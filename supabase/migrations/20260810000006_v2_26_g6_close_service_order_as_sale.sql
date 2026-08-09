-- ══════════════════════════════════════════════════════════════════════
-- F-16 G6 — Fix close_service_order_as_sale
--
-- Cambios:
-- 1. SELECT FOR UPDATE en production_orders
-- 2. Idempotencia: si ya está closed, retornar transaction_id existente
-- 3. audit_logs global
-- 4. cost_at_sale = 0 explícito (regla congelada: servicios no tienen WAC)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(
  p_order_id uuid,
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_current_status text;
BEGIN
  -- ─── 1. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 3. Idempotencia: si ya está closed con transaction, retornar ───
  IF v_order.status = 'closed' AND v_order.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_closed', 'transaction_id', v_order.transaction_id);
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- ─── 4. Calcular desglose de pagos ───
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  v_effective_method := p_payment_method;
  IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
    v_effective_method := 'mixed';
  ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
    v_effective_method := 'mixed';
  ELSIF v_cash_amount > 0 THEN
    v_effective_method := 'cash';
  ELSIF v_transfer_amount > 0 THEN
    v_effective_method := 'transfer';
  ELSIF v_zelle_amount > 0 THEN
    v_effective_method := 'zelle';
  END IF;

  -- ─── 5. Crear venta ───
  INSERT INTO transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at, completed_at,
    customer_name, customer_phone, customer_ci, customer_address,
    subtotal, cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    v_effective_method::public.payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(), now(),
    v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
    v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
  ) RETURNING id INTO v_transaction_id;

  -- ─── 6. Crear item de venta — cost_at_sale = 0 (regla congelada: servicios no tienen WAC) ───
  INSERT INTO transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- ─── 7. Transición de estados (inline, no sub-LLamada) ───
  SELECT status INTO v_current_status FROM production_orders WHERE id = p_order_id;

  IF v_current_status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_current_status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'PRODUCTION_CLOSED_AS_SALE', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'transaction_id', v_transaction_id,
      'budget_total', v_order.budget_total,
      'cost_at_sale', 0,
      'effective_method', v_effective_method
    )
  );

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(uuid, uuid, uuid, text, text, numeric, uuid) TO authenticated;
