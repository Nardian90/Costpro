-- ══════════════════════════════════════════════════════════════════════
-- F-16 HOTFIX — Fix record_id uuid vs text type mismatch in G3 + G8
-- Same bug as G2: audit_logs.record_id is uuid, not text
-- ══════════════════════════════════════════════════════════════════════

-- Fix G3: withdraw_production_item — change record_id = p_item_id::text to record_id = p_item_id
-- (p_item_id is uuid, record_id is uuid — direct comparison)
-- The function is recreated with the fix

CREATE OR REPLACE FUNCTION public.withdraw_production_item(
  p_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
  v_user_id UUID;
  v_qty_int INTEGER;
  v_order_store_id UUID;
  v_order_status TEXT;
  v_existing_result JSONB;
  v_param_hash TEXT;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || p_qty::text || p_unit_cost::text || p_store_id::text);
    SELECT metadata->>'result'
    INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ITEM_WITHDRAWN'
      AND record_id = p_item_id
      AND metadata->>'idempotency_key' = p_idempotency_key
    LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  v_qty_int := GREATEST(p_qty, 0)::integer;
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = p_unit_cost,
    withdrawn_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END,
    updated_at = now()
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id, p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int, p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text,
    p_sale_id := NULL::uuid, p_unit_cost := p_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id, p_skip_access_check := TRUE
  );

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost', p_unit_cost, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success')));

  RETURN jsonb_build_object('status', 'success', 'order_id', v_order_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid, numeric, numeric, uuid, uuid, text) TO authenticated;

-- Fix G8: close_production_order_v2 — change record_id = p_order_id::text to record_id = p_order_id
CREATE OR REPLACE FUNCTION public.close_production_order_v2(
  p_order_id uuid, p_store_id uuid, p_seller_id uuid,
  p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL,
  p_final_currency text DEFAULT 'CUP', p_exchange_rate numeric DEFAULT 1.0,
  p_output_product_id uuid DEFAULT NULL, p_output_quantity numeric DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
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
  v_existing_result jsonb;
  v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'order_id', p_order_id, 'transaction_id', v_order.transaction_id);
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order.status NOT IN ('in_progress', 'approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSABLE: status %', v_order.status;
  END IF;

  IF v_order.status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_order.status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  IF p_final_amount > 0 AND p_final_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id, p_amount := p_final_amount,
      p_payment_method := p_final_method, p_paid_by := v_caller_uid,
      p_currency := p_final_currency, p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text
    );
  END IF;

  IF v_order.order_type = 'production' THEN
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT';
    END IF;
    PERFORM public.receive_production_output(
      p_order_id := p_order_id, p_product_id := p_output_product_id,
      p_quantity := p_output_quantity, p_store_id := v_order.store_id,
      p_user_id := v_caller_uid, p_idempotency_key := 'recv-' || p_order_id::text
    );
  ELSIF v_order.order_type = 'service' THEN
    SELECT
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_amount, v_transfer_amount, v_zelle_amount
    FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

    v_effective_method := COALESCE(p_final_method, 'cash');
    IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN v_effective_method := 'mixed';
    ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN v_effective_method := 'mixed';
    ELSIF v_cash_amount > 0 THEN v_effective_method := 'cash';
    ELSIF v_transfer_amount > 0 THEN v_effective_method := 'transfer';
    ELSIF v_zelle_amount > 0 THEN v_effective_method := 'zelle';
    END IF;

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

    INSERT INTO transaction_items (transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale)
    VALUES (v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0);
  END IF;

  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET status = 'closed', closed_at = now(),
    transaction_id = COALESCE(v_transaction_id, v_order.transaction_id), payment_status = 'paid'
  WHERE id = p_order_id;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_CLOSED', 'production_orders', p_order_id,
    jsonb_build_object('order_number', v_order.order_number, 'order_type', v_order.order_type,
      'transaction_id', v_transaction_id, 'final_amount', p_final_amount,
      'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id)));

  RETURN jsonb_build_object('status', 'success', 'order_id', p_order_id, 'transaction_id', v_transaction_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid, uuid, uuid, numeric, text, text, numeric, uuid, numeric, uuid, text) TO authenticated;
