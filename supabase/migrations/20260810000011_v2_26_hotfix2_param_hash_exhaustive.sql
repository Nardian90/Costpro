-- ══════════════════════════════════════════════════════════════════════
-- F-16 HOTFIX v2 — Fix param_hash exhaustivo en G3, G7, G8
-- Todos los parámetros de la mutación deben estar en el hash
-- ══════════════════════════════════════════════════════════════════════

-- ─── G7: create_production_order_v2 — hash exhaustivo ───
CREATE OR REPLACE FUNCTION public.create_production_order_v2(
  p_store_id uuid, p_order_type text DEFAULT 'service',
  p_customer_name text DEFAULT NULL, p_customer_ci text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_customer_address text DEFAULT NULL,
  p_budget_total numeric DEFAULT 0, p_budget_currency text DEFAULT 'CUP',
  p_description text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_advance_amount numeric DEFAULT 0, p_advance_method text DEFAULT NULL,
  p_advance_currency text DEFAULT 'CUP',
  p_created_by uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_item_count integer := 0;
  v_caller_uid uuid := COALESCE(p_created_by, auth.uid());
  v_existing_id uuid;
  v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_store_id::text || '|' ||
      p_order_type || '|' ||
      COALESCE(p_customer_name, '') || '|' ||
      COALESCE(p_customer_ci, '') || '|' ||
      COALESCE(p_customer_phone, '') || '|' ||
      COALESCE(p_customer_address, '') || '|' ||
      p_budget_total::text || '|' ||
      p_budget_currency || '|' ||
      COALESCE(p_description, '') || '|' ||
      COALESCE(p_notes, '') || '|' ||
      COALESCE(p_items::text, '[]') || '|' ||
      p_advance_amount::text || '|' ||
      COALESCE(p_advance_method, '') || '|' ||
      p_advance_currency || '|' ||
      COALESCE(p_created_by::text, '')
    );
    SELECT id INTO v_existing_id FROM production_orders WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      SELECT metadata->>'param_hash' INTO v_param_hash FROM audit_logs WHERE action = 'PRODUCTION_ORDER_CREATED' AND record_id = v_existing_id LIMIT 1;
      IF v_param_hash IS NOT NULL AND md5(
        p_store_id::text || '|' || p_order_type || '|' || COALESCE(p_customer_name, '') || '|' ||
        COALESCE(p_customer_ci, '') || '|' || COALESCE(p_customer_phone, '') || '|' ||
        COALESCE(p_customer_address, '') || '|' || p_budget_total::text || '|' ||
        p_budget_currency || '|' || COALESCE(p_description, '') || '|' || COALESCE(p_notes, '') || '|' ||
        COALESCE(p_items::text, '[]') || '|' || p_advance_amount::text || '|' ||
        COALESCE(p_advance_method, '') || '|' || p_advance_currency || '|' || COALESCE(p_created_by::text, '')
      ) != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN jsonb_build_object('status', 'success', 'order_id', v_existing_id, 'idempotent', true);
    END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_order_type NOT IN ('production', 'service', 'work') THEN
    RAISE EXCEPTION 'ERR_INVALID_ORDER_TYPE';
  END IF;

  INSERT INTO production_orders (
    store_id, order_type, status, budget_total, budget_currency,
    customer_name, customer_ci, customer_phone, customer_address,
    description, notes, created_by, paid_amount, payment_status,
    idempotency_key, advance_amount, advance_method, advance_currency
  ) VALUES (
    p_store_id, p_order_type, 'draft', p_budget_total, p_budget_currency,
    p_customer_name, p_customer_ci, p_customer_phone, p_customer_address,
    p_description, p_notes, v_caller_uid, 0, 'unpaid',
    p_idempotency_key, p_advance_amount, p_advance_method, p_advance_currency
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF NOT EXISTS (SELECT 1 FROM products WHERE id = (v_item->>'product_id')::uuid AND store_id = p_store_id) THEN
        RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: %', v_item->>'product_id';
      END IF;
      INSERT INTO production_order_items (order_id, product_id, variant_id, budgeted_qty, budgeted_unit_cost, status)
      VALUES (v_order_id, (v_item->>'product_id')::uuid, NULLIF(v_item->>'variant_id', '')::uuid,
        (v_item->>'budgeted_qty')::numeric, (v_item->>'budgeted_unit_cost')::numeric, 'pending');
      v_item_count := v_item_count + 1;
    END LOOP;
  END IF;

  IF p_advance_amount > 0 AND p_advance_method IS NOT NULL THEN
    PERFORM register_supplier_payment(p_store_id := p_store_id,
      p_ref_type := CASE WHEN p_order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := v_order_id, p_amount := p_advance_amount, p_payment_method := p_advance_method,
      p_paid_by := v_caller_uid, p_currency := p_advance_currency,
      p_idempotency_key := 'advance-' || v_order_id::text);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'PRODUCTION_ORDER_CREATED', 'production_orders', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'order_type', p_order_type,
      'budget_total', p_budget_total, 'items_count', v_item_count,
      'advance_amount', p_advance_amount, 'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash));

  RETURN jsonb_build_object('status', 'success', 'order_id', v_order_id, 'order_number', v_order_number, 'items_count', v_item_count);
END;
$func$;
GRANT EXECUTE ON FUNCTION public.create_production_order_v2(uuid, text, text, text, text, text, numeric, text, text, text, jsonb, numeric, text, text, uuid, text) TO authenticated;

-- ─── G3: withdraw_production_item — hash exhaustivo ───
CREATE OR REPLACE FUNCTION public.withdraw_production_item(
  p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid,
  p_user_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_qty_int INTEGER; v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_item_id::text || '|' || p_qty::text || '|' || p_unit_cost::text || '|' ||
      p_store_id::text || '|' || COALESCE(p_user_id::text, '')
    );
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs WHERE action = 'PRODUCTION_ITEM_WITHDRAWN' AND record_id = p_item_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
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
    actual_qty = actual_qty + p_qty, actual_unit_cost = p_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(p_product_id := v_product_id, p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int, p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text, p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost, p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id, p_skip_access_check := TRUE);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost', p_unit_cost, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'order_id', v_order_id)));

  RETURN jsonb_build_object('status', 'success', 'order_id', v_order_id);
END;
$func$;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid, numeric, numeric, uuid, uuid, text) TO authenticated;

-- ─── G8: close_production_order_v2 — hash exhaustivo ───
CREATE OR REPLACE FUNCTION public.close_production_order_v2(
  p_order_id uuid, p_store_id uuid, p_seller_id uuid,
  p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL,
  p_final_currency text DEFAULT 'CUP', p_exchange_rate numeric DEFAULT 1.0,
  p_output_product_id uuid DEFAULT NULL, p_output_quantity numeric DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order RECORD; v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
  v_transaction_id uuid; v_cash_amount numeric := 0; v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0; v_effective_method text;
  v_existing_result jsonb; v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_order_id::text || '|' || p_store_id::text || '|' || p_seller_id::text || '|' ||
      p_final_amount::text || '|' || COALESCE(p_final_method, '') || '|' ||
      COALESCE(p_final_currency, '') || '|' || p_exchange_rate::text || '|' ||
      COALESCE(p_output_product_id::text, '') || '|' || COALESCE(p_output_quantity::text, '') || '|' ||
      COALESCE(p_user_id::text, '')
    );
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
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
    PERFORM register_supplier_payment(p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id, p_amount := p_final_amount, p_payment_method := p_final_method,
      p_paid_by := v_caller_uid, p_currency := p_final_currency, p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text);
  END IF;

  IF v_order.order_type = 'production' THEN
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT';
    END IF;
    PERFORM public.receive_production_output(p_order_id := p_order_id, p_product_id := p_output_product_id,
      p_quantity := p_output_quantity, p_store_id := v_order.store_id,
      p_user_id := v_caller_uid, p_idempotency_key := 'recv-' || p_order_id::text);
  ELSIF v_order.order_type = 'service' THEN
    SELECT COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
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

    INSERT INTO transactions (store_id, seller_id, total_amount, payment_method,
      sale_currency, sale_exchange_rate, status, created_at, completed_at,
      customer_name, customer_phone, customer_ci, customer_address,
      subtotal, cash_amount, transfer_amount, zelle_amount)
    VALUES (v_order.store_id, p_seller_id, v_order.budget_total,
      v_effective_method::public.payment_method_enum, p_final_currency, p_exchange_rate,
      'completed', now(), now(), v_order.customer_name, v_order.customer_phone,
      v_order.customer_ci, v_order.customer_address, v_order.budget_total,
      v_cash_amount, v_transfer_amount, v_zelle_amount) RETURNING id INTO v_transaction_id;

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
