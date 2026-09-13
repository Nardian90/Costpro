-- DECLARED FINAL STATE (Git) de withdraw_production_item
-- fuente: 20260817000001_vale_salida.sql stmt#47

CREATE OR REPLACE FUNCTION public.withdraw_production_item(
  p_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_reference_doc text DEFAULT NULL,
  p_server_side_cost boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,'') || '|' || p_server_side_cost::text);
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  -- V-01: SELECT FOR UPDATE reads AND locks budgeted_qty + actual_qty
  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- V-01: Overconsumption check using locked values
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %',
      v_actual, p_qty, v_budgeted;
  END IF;

  -- C-03 + C-04: Server-side cost without fallback
  IF p_server_side_cost THEN
    SELECT cost_average INTO v_real_unit_cost
    FROM products WHERE id = v_product_id AND store_id = v_order_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;
    IF v_real_unit_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
    END IF;
  ELSE
    v_real_unit_cost := p_unit_cost;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- No integer truncation (fix #3): use p_qty directly
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'server_side_cost', p_server_side_cost,
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$
