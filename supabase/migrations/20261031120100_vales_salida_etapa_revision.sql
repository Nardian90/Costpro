-- ============================================================================
-- VALES DE SALIDA — ETAPA INTERMEDIA DE REVISIÓN (estado 'pending')
-- ============================================================================
-- MISIÓN RESOLUCIÓN 11 (2026-10-31): Vales de Salida adopta el mismo estándar
-- de gestión documental que Ajustes Documentales:
--
--   ANTES: crear y confirmar en un solo paso (create_vale_salida mueve stock
--          inmediatamente; el modal solo tenía una revisión EN CLIENTE que no
--          persistía el documento).
--   AHORA: crear → 'pending' (En Revisión; se CONSERVA en BD, consulta y
--          verificación posterior) → confirm_vale_salida (acción explícita:
--          descuenta stock, kardex y auditoría) | void_vale_salida (anulación
--          del vale en revisión, sin efecto en stock).
--
-- El flujo directo «crear y confirmar ahora» se CONSERVA intacto
-- (create_vale_salida sin cambios: Vender y el botón directo del módulo
-- siguen funcionando; ninguna funcionalidad existente se elimina).
--
-- Cambios:
--   1. issue_slips.status CHECK extendido: + 'pending'.
--      (transiciones válidas: pending → completed (confirm) | voided (anular);
--       completed → reversed (reverse_vale_salida existente, INTACTA);
--       voided/reversed: terminales.)
--   2. Columnas de trazabilidad: confirmed_at / confirmed_by.
--   3. RPC create_vale_salida_pending — crea el vale 'pending' + items con
--      snapshot de costo para revisión; SIN movimientos de stock.
--   4. RPC confirm_vale_salida — pending → completed; aplica los movimientos
--      issue_slip_out / withdraw_production_item_v3 con costo servidor
--      re-leído en el momento de la confirmación; recalcula total_cost.
--   5. RPC void_vale_salida — pending → voided con motivo obligatorio y
--      defense-in-depth (rechaza si existieran movimientos ligados).
--
-- SEGURIDAD: mismos patrones certificados (guard anti-spoofing,
-- has_store_access_as, FOR UPDATE, REVOKE anon/PUBLIC, audit_logs en cada
-- transición, idempotencia en la creación). Migración aditiva: no modifica
-- datos existentes ni las RPC vigentes.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Estado 'pending' en issue_slips (CHECK extendido — supersete estricto)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.issue_slips DROP CONSTRAINT issue_slips_status_check;
ALTER TABLE public.issue_slips ADD CONSTRAINT issue_slips_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'voided'::text, 'reversed'::text]));

-- Trazabilidad de la confirmación (espejo de voided_at/voided_by existentes)
ALTER TABLE public.issue_slips ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.issue_slips ADD COLUMN IF NOT EXISTS confirmed_by uuid
  REFERENCES public.profiles (id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. RPC create_vale_salida_pending — vale EN REVISIÓN (sin efecto en stock)
--    Firma espejo de create_vale_salida (misma validación de items/OT/fecha).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_vale_salida_pending(
  p_store_id uuid,
  p_items jsonb,
  p_production_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_operation_date timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_slip_id uuid := gen_random_uuid();
  v_slip_number text;
  v_caller_uid uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_total_cost numeric := 0;
  v_item jsonb;
  v_po_item_id uuid;
  v_po_product uuid;
  v_po_variant uuid;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_seen_products uuid[] := ARRAY[]::uuid[];
  v_existing_result jsonb;
  v_param_hash text;
  v_eff timestamptz;
  v_items_count integer := 0;
BEGIN
  v_eff := COALESCE(p_operation_date, NOW());
  PERFORM public.validate_operation_date(v_eff, p_store_id);

  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    v_param_hash := md5(p_store_id::text || '|pending|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,'') || '|' || COALESCE(p_operation_date::text,'') || '|' || p_items::text);
    v_existing_result := public.check_idempotency(p_idempotency_key, 'vale_salida_pending', v_slip_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  -- El vale nace 'pending' (En Revisión): NO descuenta stock ni OT.
  INSERT INTO issue_slips (id, store_id, slip_number, status, production_order_id, notes, total_cost, created_by, created_at, tenant_id)
  VALUES (v_slip_id, p_store_id, v_slip_number, 'pending', p_production_order_id, COALESCE(p_notes, ''), 0, v_caller_uid, v_eff,
    (SELECT tenant_id FROM stores WHERE id = p_store_id));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity   := (v_item->>'quantity')::numeric;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
    IF v_product_id = ANY(v_seen_products) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PRODUCT: %', v_product_id; END IF;
    v_seen_products := v_seen_products || v_product_id;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;
    END IF;

    -- Snapshot del costo promedio VIGENTE para la revisión (informativo):
    -- en la confirmación el costo se relee y el servidor vuelve a mandar.
    SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id;
    IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost, created_at)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost, v_eff);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    v_items_count := v_items_count + 1;
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida_pending', v_slip_id, v_param_hash,
      jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,
        'total_cost',v_total_cost,'status_vale','pending'));
  END IF;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA_PENDING', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'status', 'pending',
      'total_cost_estimado', v_total_cost, 'items_count', v_items_count,
      'production_order_id', p_production_order_id, 'operation_date', v_eff));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,
    'total_cost',v_total_cost,'vale_status','pending','items_count',v_items_count);
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RPC confirm_vale_salida — pending → completed (acción explícita:
--    descuenta stock + kardex + OT; costo servidor re-leído al confirmar)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_vale_salida(
  p_slip_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_slip public.issue_slips%ROWTYPE;
  v_item public.issue_slip_items%ROWTYPE;
  v_unit_cost numeric;
  v_total_cost numeric := 0;
  v_items_count integer := 0;
BEGIN
  -- Lock de fila: confirmar/anular concurrentes → exactamente uno gana;
  -- una segunda confirmación ve el estado avanzado y se rechaza (evita
  -- dobles descuentos de stock).
  SELECT * INTO v_slip FROM public.issue_slips WHERE id = p_slip_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_FOUND';
  END IF;
  IF v_slip.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar vales en revisión (estado actual: %)', v_slip.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_slip.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(NOW(), v_slip.store_id);

  FOR v_item IN
    SELECT * FROM public.issue_slip_items WHERE slip_id = p_slip_id ORDER BY created_at, id
  LOOP
    -- Costo SIEMPRE servidor, re-leído con lock en el momento de la
    -- confirmación (el snapshot del borrador era solo informativo).
    SELECT cost_average INTO v_unit_cost
    FROM public.products WHERE id = v_item.product_id AND store_id = v_slip.store_id
    FOR UPDATE;
    IF v_unit_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_item.product_id;
    END IF;

    IF v_item.production_order_item_id IS NOT NULL THEN
      -- Descuento sobre la línea de OT (misma firma consolidada v3 que
      -- create_vale_salida — costo server-side).
      PERFORM public.withdraw_production_item_v3(
        p_item_id := v_item.production_order_item_id, p_qty := v_item.quantity,
        p_store_id := v_slip.store_id, p_user_id := v_caller_uid,
        p_idempotency_key := NULL,
        p_reference_id := v_slip.id,
        p_reference_doc := 'Vale de Salida ' || v_slip.slip_number
      );
      SELECT cost_average INTO v_unit_cost FROM public.products WHERE id = v_item.product_id;
    ELSE
      IF v_item.variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_item.variant_id AND product_id = v_item.product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id, p_store_id := v_slip.store_id,
        p_quantity := -v_item.quantity, p_movement_type := 'issue_slip_out',
        p_reason := 'Vale de Salida ' || v_slip.slip_number,
        p_user_id := v_caller_uid,
        p_variant_id := v_item.variant_id,
        p_sale_id := v_slip.id,
        p_unit_cost := v_unit_cost,
        p_notes := COALESCE(v_slip.notes, ''),
        p_skip_access_check := TRUE,
        p_operation_date := NOW()
      );
    END IF;

    UPDATE public.issue_slip_items
    SET unit_cost = v_unit_cost, total_cost = v_item.quantity * v_unit_cost
    WHERE id = v_item.id;

    v_total_cost := v_total_cost + (v_item.quantity * v_unit_cost);
    v_items_count := v_items_count + 1;
  END LOOP;

  UPDATE public.issue_slips
  SET status = 'completed',
      total_cost = v_total_cost,
      confirmed_at = NOW(),
      confirmed_by = v_caller_uid
  WHERE id = p_slip_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CONFIRM_VALE_SALIDA', 'issue_slips', p_slip_id, v_slip.store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip.slip_number, 'from', 'pending', 'to', 'completed',
      'total_cost', v_total_cost, 'items_count', v_items_count,
      'confirmed_by', v_caller_uid,
      'production_order_id', v_slip.production_order_id));

  RETURN jsonb_build_object('status','success','slip_id',p_slip_id,
    'slip_number', v_slip.slip_number, 'total_cost', v_total_cost,
    'items_count', v_items_count);
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RPC void_vale_salida — pending → voided (anulación del vale en revisión;
--    jamás tocó stock, pero la trazabilidad de la anulación es total)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_vale_salida(
  p_slip_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_slip public.issue_slips%ROWTYPE;
  v_items_count integer;
BEGIN
  SELECT * INTO v_slip FROM public.issue_slips WHERE id = p_slip_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_FOUND';
  END IF;
  IF v_slip.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden anular vales en revisión (estado actual: %). Un vale completado se corrige con Devolver (reversión); uno ya anulado o devuelto no admite más acciones.', v_slip.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_slip.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;

  -- Defense-in-depth: un vale 'pending' jamás movió stock; si por cualquier
  -- vía existieran movimientos ligados (stock_movements.reference_id es TEXT:
  -- se compara con cast explícito), la anulación se rechaza (usar
  -- Devolver/reversión).
  IF EXISTS (SELECT 1 FROM public.stock_movements
             WHERE reference_id = p_slip_id::text AND movement_type = 'issue_slip_out') THEN
    RAISE EXCEPTION 'ERR_SLIP_HAS_MOVEMENTS: el vale tiene movimientos de inventario; usa Devolver (reversión)';
  END IF;

  SELECT count(*) INTO v_items_count FROM public.issue_slip_items WHERE slip_id = p_slip_id;

  UPDATE public.issue_slips
  SET status = 'voided',
      voided_at = NOW(),
      voided_by = v_caller_uid,
      void_reason = btrim(p_reason)
  WHERE id = p_slip_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_VALE_SALIDA', 'issue_slips', p_slip_id, v_slip.store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip.slip_number, 'from', 'pending', 'to', 'voided',
      'reason', btrim(p_reason), 'items_count', v_items_count));

  RETURN jsonb_build_object('status','success','slip_id',p_slip_id,
    'slip_number', v_slip.slip_number, 'to', 'voided');
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. ACL (patrón sec_definer_hardening: sin EXECUTE para PUBLIC/anon)
-- ───────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_vale_salida_pending(uuid, jsonb, uuid, text, text, uuid, timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_vale_salida_pending(uuid, jsonb, uuid, text, text, uuid, timestamp with time zone) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_vale_salida(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_vale_salida(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.void_vale_salida(uuid, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.void_vale_salida(uuid, text, uuid) FROM PUBLIC, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Comentarios de trust boundary
-- ───────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.create_vale_salida_pending(uuid, jsonb, uuid, text, text, uuid, timestamp with time zone) IS
'TRUST BOUNDARY: p_user_id DEBE venir del JWT (session.user.id), NUNCA del body del request. Crea el vale en estado pending (En Revisión): SIN movimientos de stock ni descuento de OT — el costo de las líneas es un snapshot informativo; confirm_vale_salida relee el costo servidor al confirmar. Estándar documental de Ajustes Documentales (misión Res. 11, 2026-10-31).';
COMMENT ON FUNCTION public.confirm_vale_salida(uuid, uuid) IS
'pending → completed. Acción explícita de confirmación con lock FOR UPDATE (una segunda confirmación recibe ERR_NOT_PENDING): aplica issue_slip_out / withdraw_production_item_v3 con costo servidor re-leído, recalcula total_cost y registra confirmed_at/confirmed_by + auditoría.';
