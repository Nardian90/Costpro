-- ============================================================================
-- 03-df05-production.sql — W6.2 LAB · DF-05 PRODUCCIÓN SERVER-SIDE
-- Diseño: W62-03 DF-05. Requiere paquetes 01-02.
-- withdraw_production_item_v3: costo SIEMPRE server-side (WAC bajo FOR UPDATE),
--   p_unit_cost NO EXISTE, p_server_side_cost NO EXISTE (opción eliminada),
--   qty numérica sin truncar (D-11), overconsumption check, audit_logs (INV-15),
--   costo 0 legítimo solo con bandera admin auditada (CR-W6-2/INV-05).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_doc text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
  v_zero_flagged boolean;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw_v3', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

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

  -- Overconsumption check con valores bloqueados
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %', v_actual, p_qty, v_budgeted;
  END IF;

  -- DF-05: costo SIEMPRE server-side — WAC_prev del material bajo FOR UPDATE, sin fallback a 0
  SELECT cost_average
  INTO v_real_unit_cost
  FROM products WHERE id = v_product_id AND store_id = v_order_store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
  END IF;
  IF v_real_unit_cost IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
  END IF;
  IF v_real_unit_cost = 0 THEN
    SELECT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                   WHERE store_id = v_order_store_id AND product_id = v_product_id
                     AND scope = 'approve_zero_cost_material')
    INTO v_zero_flagged;
    IF NOT v_zero_flagged THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_product_id;
    END IF;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- D-11: qty numérica sin truncamiento
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
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw_v3', p_item_id, v_param_hash, v_existing_result);
  END IF;

  -- INV-15: audit_logs SIEMPRE (procedencia del costo server-side registrada)
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'cost_authority', 'server_side_wac_v3',
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END $fn$;

-- ACL canónica de la firma consolidada (INV-13): authenticated SÍ, anon NO
REVOKE ALL ON FUNCTION public.withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text) TO authenticated, service_role;

\echo '03: DF-05 aplicado — withdraw_production_item_v3 server-side (costo cliente eliminado)'
