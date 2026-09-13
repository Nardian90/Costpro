-- DECLARED FINAL STATE (Git) de create_vale_salida
-- fuente: 20260817000001_vale_salida.sql stmt#43

CREATE OR REPLACE FUNCTION public.create_vale_salida(
  p_store_id uuid,
  p_items jsonb,
  p_production_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller_uid   uuid;
  v_slip_id      uuid := gen_random_uuid();
  v_slip_number  text;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_po_item_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_param_hash   text;
  v_existing     jsonb;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_order_status text;
  v_po_product   uuid;
  v_po_variant   uuid;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  IF p_production_order_id IS NULL THEN
    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
      RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_production_order_id IS NOT NULL THEN
    SELECT status INTO v_order_status
    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
    IF v_order_status NOT IN ('approved','in_progress') THEN
      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
    END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, created_by, tenant_id)
  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
    (SELECT tenant_id FROM stores WHERE id = p_store_id));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM withdraw_production_item(
        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
        p_server_side_cost := TRUE
      );
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));

  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END;
$function$
