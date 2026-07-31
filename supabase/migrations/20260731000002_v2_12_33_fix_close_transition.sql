-- V2.12.33: Fix close_service_order_as_sale — transición de estados válida
--
-- Bug: el RPC intentaba pasar de in_progress → closed directamente, pero el
-- trigger validate_production_order_transition no lo permite. Debe pasar
-- por completed primero: in_progress → completed → closed.
--
-- Además: el RPC ahora hace la transición completa internamente, para que
-- el caller no tenga que preocuparse por el estado previo.

CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(
  p_order_id uuid,
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- V2.12.32: calcular desglose de pagos desde payment_transactions
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM public.payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  -- Determinar método efectivo
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

  -- Crear la venta en transactions
  INSERT INTO public.transactions (
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

  -- Crear item de la venta (servicio prestado — product_id NULL es válido
  -- para servicios, V2.12.32 hizo product_id nullable en transaction_items)
  INSERT INTO public.transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- V2.12.33: transición de estados válida.
  -- El trigger no permite in_progress → closed directamente.
  -- Debemos pasar por completed primero.
  -- Si el estado actual no es completed, primero transicionar a completed.
  SELECT status INTO v_current_status FROM public.production_orders WHERE id = p_order_id;

  IF v_current_status = 'draft' THEN
    UPDATE public.production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE public.production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_current_status = 'approved' THEN
    UPDATE public.production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  -- Ahora transicionar in_progress → completed → closed
  UPDATE public.production_orders
    SET status = 'completed', completion_date = CURRENT_DATE
    WHERE id = p_order_id;

  UPDATE public.production_orders
    SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id
    WHERE id = p_order_id;

  RETURN v_transaction_id;
END;
$function$;
