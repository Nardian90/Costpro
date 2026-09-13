-- DECLARED FINAL STATE (Git) de create_production_order_v2
-- fuente: 20260911000100_rem_po1_production_orders_boundaries.sql stmt#5

CREATE OR REPLACE FUNCTION public.create_production_order_v2(p_store_id uuid, p_order_type text DEFAULT 'service'::text, p_customer_name text DEFAULT NULL::text, p_customer_ci text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_budget_total numeric DEFAULT 0, p_budget_currency text DEFAULT 'CUP'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_advance_amount numeric DEFAULT 0, p_advance_method text DEFAULT NULL::text, p_advance_currency text DEFAULT 'CUP'::text, p_created_by uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id uuid; v_order_number text; v_item jsonb; v_item_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_existing_result jsonb; v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_store_id::text || '|' || p_order_type || '|' || COALESCE(p_customer_name, '') || '|' ||
      COALESCE(p_customer_ci, '') || '|' || COALESCE(p_customer_phone, '') || '|' ||
      COALESCE(p_customer_address, '') || '|' || p_budget_total::text || '|' ||
      p_budget_currency || '|' || COALESCE(p_description, '') || '|' || COALESCE(p_notes, '') || '|' ||
      COALESCE(p_items::text, '[]') || '|' || p_advance_amount::text || '|' ||
      COALESCE(p_advance_method, '') || '|' || p_advance_currency || '|' || COALESCE(p_created_by::text, '')
    );
    v_existing_result := public.check_idempotency(p_idempotency_key, 'create_po', p_store_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
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

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'order_number', v_order_number, 'items_count', v_item_count);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'create_po', v_order_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'PRODUCTION_ORDER_CREATED', 'production_orders', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'order_type', p_order_type,
      'budget_total', p_budget_total, 'items_count', v_item_count,
      'advance_amount', p_advance_amount, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$
