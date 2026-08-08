-- ══════════════════════════════════════════════════════════════════════
-- F-16 G8 — RPC close_production_order_v2 (atomic)
-- Atomic: payment + receive_output (production) OR sale (service) + state transitions + audit
-- Paths separados para production y service
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_production_order_v2(
  p_order_id uuid,
  p_store_id uuid,
  p_seller_id uuid,
  p_final_amount numeric DEFAULT 0,
  p_final_method text DEFAULT NULL,
  p_final_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_output_product_id uuid DEFAULT NULL,
  p_output_quantity numeric DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order RECORD;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
  v_transaction_id uuid;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_recv_result jsonb;
  v_existing_result jsonb;
  v_param_hash text;
BEGIN
  -- ─── 0. Idempotency ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id::text
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia: si ya está closed ───
  IF v_order.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'order_id', p_order_id, 'transaction_id', v_order.transaction_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar que la orden está en progreso ───
  IF v_order.status NOT IN ('in_progress', 'approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSABLE: status %', v_order.status;
  END IF;

  -- ─── 5. Transición a in_progress (si no lo está) ───
  IF v_order.status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_order.status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  -- ─── 6. Pago final (atómico) ───
  IF p_final_amount > 0 AND p_final_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id,
      p_amount := p_final_amount,
      p_payment_method := p_final_method,
      p_paid_by := v_caller_uid,
      p_currency := p_final_currency,
      p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- PATH A: PRODUCCIÓN
  -- ═══════════════════════════════════════════════════════════════
  IF v_order.order_type = 'production' THEN
    -- Validar output product + quantity
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT: product_id y quantity > 0 son obligatorios';
    END IF;

    -- Recibir output (inline, no sub-LLamada para evitar conflictos de status)
    -- Esto ejecuta la misma lógica que receive_production_output pero dentro de la transacción
    PERFORM public.receive_production_output(
      p_order_id := p_order_id,
      p_product_id := p_output_product_id,
      p_quantity := p_output_quantity,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_idempotency_key := 'recv-' || p_order_id::text
    );

  -- ═══════════════════════════════════════════════════════════════
  -- PATH B: SERVICIO
  -- ═══════════════════════════════════════════════════════════════
  ELSIF v_order.order_type = 'service' THEN
    -- Calcular desglose de pagos
    SELECT
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_amount, v_transfer_amount, v_zelle_amount
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

    v_effective_method := COALESCE(p_final_method, 'cash');
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

    -- Crear venta (inline)
    INSERT INTO transactions (
      store_id, seller_id, total_amount, payment_method,
      sale_currency, sale_exchange_rate, status, created_at, completed_at,
      customer_name, customer_phone, customer_ci, customer_address,
      subtotal, cash_amount, transfer_amount, zelle_amount
    ) VALUES (
      v_order.store_id, p_seller_id, v_order.budget_total,
      v_effective_method::public.payment_method_enum,
      p_final_currency, p_exchange_rate, 'completed', now(), now(),
      v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
      v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
    ) RETURNING id INTO v_transaction_id;

    -- Item de venta — cost_at_sale = 0 (regla congelada: servicios no tienen WAC)
    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
    );
  END IF;

  -- ─── 7. Transición a completed → closed ───
  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET
    status = 'closed',
    closed_at = now(),
    transaction_id = COALESCE(v_transaction_id, v_order.transaction_id),
    payment_status = 'paid'
  WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_CLOSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'transaction_id', v_transaction_id,
      'final_amount', p_final_amount,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'transaction_id', v_transaction_id
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid, uuid, uuid, numeric, text, text, numeric, uuid, numeric, uuid, text) TO authenticated;
