-- ============================================================================
-- 04-df09-overloads.sql — W6.2 LAB · DF-09 TRANSICIÓN DE OVERLOADS (5 etapas)
-- Diseño: W62-03 §DF-05 F1-F3 + W62-04 DF-09. Requiere paquetes 01-03.
--   F1 migración callers: create_vale_salida → withdraw_production_item_v3
--   F2 bloqueo explícito: REVOKE + RENAME de la 6-arg legacy y de la 9-arg
--      superseded; receive 4-arg renombrada (la 6-arg convertida es canónica)
--   F3 eliminación: DROP de las deprecated tras probe de resolución (aquí:
--      se mantiene la deprecated renombrada como evidencia — DROP demostrado
--      en el clon DF-09 con resultado "function does not exist")
--   ACL: close_v2 + receive pierden EXECUTE de anon (INV-13)
-- ============================================================================

-- ─── F1. Caller interno migrado: create_vale_salida 6-arg (con p_user_id) ───
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  v_slip_id      uuid := gen_random_uuid();
  v_slip_number  text;
  v_caller_uid   uuid;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_po_item_id   uuid;
  v_po_product   uuid;
  v_po_variant   uuid;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_existing_result JSONB;
  v_param_hash TEXT;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_store_id::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, total_cost, created_by)
  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, p_notes, 0, v_caller_uid);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity   := (v_item->>'quantity')::numeric;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;

      -- DF-09: firma consolidada v3 — costo SIEMPRE server-side (sin p_unit_cost)
      PERFORM public.withdraw_production_item_v3(
        p_item_id := v_po_item_id, p_qty := v_quantity,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_idempotency_key := NULL,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number
      );
      -- el costo usado por v3 (server-side) para el asiento del vale:
      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id;
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

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
      jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));
  END IF;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'withdraw_signature', 'v3_server_side_df09'));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END $fn$;

-- create_vale_salida 5-arg (delega en la 6-arg)
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $fn$
BEGIN
  RETURN public.create_vale_salida(p_store_id, p_items, p_production_order_id, p_notes, p_idempotency_key, NULL);
END $fn$;

-- ─── F2. Bloqueo explícito del par withdraw legacy ───
ALTER FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) RENAME TO withdraw_production_item_deprecated_6arg;
REVOKE ALL ON FUNCTION public.withdraw_production_item_deprecated_6arg(uuid,numeric,numeric,uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) RENAME TO withdraw_production_item_deprecated_9arg;
REVOKE ALL ON FUNCTION public.withdraw_production_item_deprecated_9arg(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC, anon, authenticated, service_role;

-- receive: la 4-arg (delegada, sin idempotencia) se retira del espacio público
ALTER FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) RENAME TO receive_production_output_deprecated_4arg;
REVOKE ALL ON FUNCTION public.receive_production_output_deprecated_4arg(uuid,uuid,numeric,uuid) FROM PUBLIC, anon, authenticated;

-- INV-13 (hallazgo de laboratorio): el EXECUTE de anon llegaba vía PUBLIC —
-- el REVOKE a anon es insuficiente; se revoca PUBLIC y se conceden roles explícitos.
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) TO authenticated, service_role;

\echo '04: DF-09 aplicado — F1 callers migrados, F2 bloqueo+rename, ACL INV-13 endurecida'
