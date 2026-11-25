-- ============================================================================
-- CP-RECEPCIONES-CATALOGO-MAESTRO-001 (2026-11-25) — FASE 3
-- Recepciones en Borrador (pending): capacidad de AGREGAR productos.
--
-- Defecto (auditoría fase 0): el modal Editar permite modificar cantidades/
-- costos de líneas existentes y marcar eliminaciones, pero NO EXISTE vía
-- alguna para AGREGAR productos — ni UI ni backend (el PATCH solo soporta
-- itemUpdates {id, quantity, unit_cost, deleted}; update_reception_items
-- solo UPDATE/DELETE). La misión exige: buscar/seleccionar existentes,
-- agregar varias líneas, crear producto nuevo con código OFICIAL y guardar.
--
-- Nuevo contrato (todo pendiente-only, transaccional y auditado):
--   · add_reception_items(p_receipt_id, p_items, p_user_id)
--       – p_items: [{product_id?, sku?, name?, barcode?, quantity,
--         unit_cost, unit_of_measure?, sale_price?, moneda_recepcion?,
--         tasa_cambio_recepcion?}]
--       – Líneas SIN product_id se resuelven con el ESCRITOR CANÓNICO
--         resolve_reception_import_rows (misma gobernanza que el alta y el
--         importador: identificación, activación, maestro nuevo con código
--         OFICIAL next_master_catalog_sku, autoridad del nombre, roles).
--         Todo dentro de ESTA transacción → un fallo posterior revierte
--         también los maestros creados (cero huérfanos).
--       – El emparejamiento lote⇄resolución es POSICIONAL (mismo patrón
--         determinista que useSavePendingReception / useReceptionState).
--       – Tienda NO conectada (new_local): la RPC crea la fila local con el
--         código canónico del tenant (next_master_catalog_sku) — el mismo
--         contrato que el flujo de borradores (assign_next_catalog_sku).
--       – Duplicados: mismo producto ya presente en la recepción con
--         (cantidad, costo, moneda, tasa) IDÉNTICOS → salto idempotente
--         (protección de doble envío); con datos distintos → error claro
--         con remedio (editar la cantidad de la línea existente).
--       – Anti-inventario: cero stock_movements / kardex — solo receipt_items
--         (la doctrina del módulo: el inventario aplica en la confirmación).
--   · save_pending_reception_changes(p_receipt_id, p_header, p_item_updates,
--     p_new_items, p_user_id) — UNA transacción para TODO el guardado del
--     modal: cabecera + actualizaciones de líneas + líneas nuevas
--     (reutiliza update_reception_items y add_reception_items anidados).
--
-- Permisos: authenticated (vía API route con sesión del usuario; cada RPC
-- verifica has_store_access_as) y service_role. Errores con remedio legible.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_reception_items(
  p_receipt_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_tenant uuid;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_res jsonb;
  v_product_id uuid;
  v_sku text;
  v_name text;
  v_qty numeric;
  v_cost numeric;
  v_uom text;
  v_moneda text;
  v_tasa numeric;
  v_resolve_rows jsonb := '[]'::jsonb;
  v_resolve_res jsonb;
  v_pos_map jsonb := '[]'::jsonb;
  v_map_entry jsonb;
  v_resolve_cursor int := 0;
  v_added jsonb := '[]'::jsonb;
  v_added_count int := 0;
  v_idem_count int := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_blocked_list text[] := ARRAY[]::text[];
  v_new_total numeric;
  v_row jsonb;
  v_local_sku text;
  v_local_id uuid;
  v_dup record;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
    FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo se pueden agregar productos a recepciones pendientes (estado actual: %)', v_status;
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: se requiere al menos una línea';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'ERR_BULK_LIMIT: máximo 200 líneas por lote';
  END IF;

  -- Fase A: validar forma de cada línea y clasificar (directas vs a resolver).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_moneda := COALESCE(NULLIF(btrim(COALESCE(v_item->>'moneda_recepcion', '')), ''), 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::numeric, 1);
    v_uom := NULLIF(btrim(COALESCE(v_item->>'unit_of_measure', '')), '');

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: la cantidad debe ser > 0 (recibido %)', v_qty;
    END IF;
    IF v_cost IS NULL OR v_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: el costo unitario debe ser > 0 (recibido %)', v_cost;
    END IF;
    IF v_moneda NOT IN ('CUP','USD','EUR','MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: moneda % no soportada', v_moneda;
    END IF;
    IF v_moneda = 'CUP' AND v_tasa <> 1 THEN
      RAISE EXCEPTION 'ERR_INVALID_TASA: la tasa de CUP debe ser 1 (recibido %)', v_tasa;
    END IF;
    IF v_moneda <> 'CUP' AND (v_tasa IS NULL OR v_tasa <= 1.5) THEN
      RAISE EXCEPTION 'ERR_INVALID_TASA: la tasa de % debe ser > 1.5 (recibido %)', v_moneda, v_tasa;
    END IF;

    IF (v_item->>'product_id') IS NULL OR btrim(COALESCE(v_item->>'product_id', '')) = '' THEN
      v_name := NULLIF(btrim(COALESCE(v_item->>'name', '')), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'ERR_PRODUCT_WITHOUT_NAME: la línea sin product_id exige nombre';
      END IF;
      v_resolve_rows := v_resolve_rows || jsonb_build_object(
        'sku', COALESCE(NULLIF(btrim(COALESCE(v_item->>'sku', '')), ''), ''),
        'name', v_name,
        'barcode', COALESCE(NULLIF(btrim(COALESCE(v_item->>'barcode', '')), ''), ''),
        'quantity', v_qty,
        'unit_cost', v_cost,
        'unit_of_measure', COALESCE(v_uom, 'unidad'),
        'sale_price', v_item->>'sale_price'
      );
    ELSE
      v_product_id := (v_item->>'product_id')::uuid;
      IF v_product_id = ANY(v_seen) THEN
        RAISE EXCEPTION 'ERR_DUPLICATE_IN_BATCH: el producto % aparece dos veces en el lote', v_product_id;
      END IF;
      v_seen := array_append(v_seen, v_product_id);
    END IF;
  END LOOP;

  -- Fase B: resolver las líneas sin product_id con el ESCRITOR CANÓNICO
  -- (misma transacción: si algo posterior falla, todo se revierte y no
  -- quedan maestros/filas locales huérfanas — misión §4).
  IF jsonb_array_length(v_resolve_rows) > 0 THEN
    v_resolve_res := public.resolve_reception_import_rows(
      p_store_id := v_store_id,
      p_rows := v_resolve_rows,
      p_confirm_reactivation := '[]'::jsonb,
      p_user_id := v_caller_uid
    );
    -- Mapa POSICIONAL resultado⇄fila (results[i] ↔ v_resolve_rows[i]).
    FOR v_res IN SELECT * FROM jsonb_array_elements(COALESCE(v_resolve_res->'results', '[]'::jsonb)) LOOP
      IF (v_res->>'action') = 'blocked' THEN
        v_blocked_list := array_append(v_blocked_list,
          COALESCE(NULLIF(v_res->>'sku', ''), '(sin código)') || ': ' ||
          COALESCE(v_res->'reasons'->>0, 'requiere revisión'));
        v_pos_map := v_pos_map || 'null'::jsonb;
      ELSIF (v_res->>'product_id') IS NOT NULL AND btrim(COALESCE(v_res->>'product_id', '')) <> '' THEN
        v_pos_map := v_pos_map || jsonb_build_object(
          'product_id', v_res->>'product_id', 'sku', v_res->>'sku');
      ELSE
        -- new_local (tienda NO conectada): se resuelve en Fase C.
        v_pos_map := v_pos_map || 'null'::jsonb;
        v_blocked_list := array_append(v_blocked_list, '__NEW_LOCAL__');
      END IF;
    END LOOP;
    -- Ninguna fila puede quedar bloqueada (fail-closed, misión §10).
    IF EXISTS (SELECT 1 FROM unnest(v_blocked_list) b WHERE b <> '__NEW_LOCAL__') THEN
      RAISE EXCEPTION 'ERR_ROWS_BLOCKED: no se agregó nada (transacción revertida): %',
        array_to_string(ARRAY(SELECT b FROM unnest(v_blocked_list) b WHERE b <> '__NEW_LOCAL__'), ' | ');
    END IF;
  END IF;

  -- Fase C: tienda NO conectada — filas new_local crean su fila local con
  -- el código canónico del tenant (paridad del flujo de borradores nuevo).
  IF jsonb_array_length(v_resolve_rows) > 0
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_pos_map) m WHERE jsonb_typeof(m) = 'null') THEN
    SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = v_store_id;
    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_WITHOUT_TENANT';
    END IF;
    FOR v_i IN 1..jsonb_array_length(v_resolve_rows) LOOP
      IF (v_pos_map->(v_i - 1)) IS NULL THEN
        v_row := v_resolve_rows->(v_i - 1);
        v_local_sku := NULLIF(btrim(COALESCE(v_row->>'sku', '')), '');
        IF v_local_sku IS NULL THEN
          v_local_sku := public.next_master_catalog_sku(v_tenant);
        END IF;
        INSERT INTO public.products (
          store_id, tenant_id, sku, name, price, cost_price, cost_average,
          unit_of_measure, is_active, is_complete, stock_current, min_stock
        ) VALUES (
          v_store_id, v_tenant, v_local_sku,
          COALESCE(NULLIF(btrim(COALESCE(v_row->>'name', '')), ''), v_local_sku),
          COALESCE(NULLIF(v_row->>'sale_price', '')::numeric, 0),
          COALESCE((v_row->>'unit_cost')::numeric, 0), 1,
          COALESCE(NULLIF(btrim(COALESCE(v_row->>'unit_of_measure', '')), ''), 'unidad'),
          true, false, 0, 1
        ) RETURNING id INTO v_local_id;
        v_pos_map := jsonb_set(v_pos_map, ARRAY[(v_i - 1)::text],
          jsonb_build_object('product_id', v_local_id, 'sku', v_local_sku));
        INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
        VALUES (v_caller_uid, v_store_id, 'RECEPTION_ADD_ITEM_LOCAL_CREATED', 'products', v_local_id,
          jsonb_build_object('sku', v_local_sku, 'origin', 'add_reception_items',
            'receipt_id', p_receipt_id, 'store_connected', false,
            'sku_assigned_by_server', (v_row->>'sku') IS NULL));
      END IF;
    END LOOP;
  END IF;

  -- Fase D: insertar TODAS las líneas (orden original del lote; el mapa
  -- posicional avanza SOLO en las líneas que fueron a resolución).
  v_resolve_cursor := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_moneda := COALESCE(NULLIF(btrim(COALESCE(v_item->>'moneda_recepcion', '')), ''), 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::numeric, 1);

    IF (v_item->>'product_id') IS NOT NULL AND btrim(COALESCE(v_item->>'product_id', '')) <> '' THEN
      v_product_id := (v_item->>'product_id')::uuid;
    ELSE
      v_resolve_cursor := v_resolve_cursor + 1;
      v_map_entry := v_pos_map->(v_resolve_cursor - 1);
      IF v_map_entry IS NULL OR (v_map_entry->>'product_id') IS NULL THEN
        RAISE EXCEPTION 'ERR_RESOLUTION_MISMATCH: la línea "%" no pudo resolverse con el escritor canónico', COALESCE(v_item->>'name', '(sin nombre)');
      END IF;
      v_product_id := (v_map_entry->>'product_id')::uuid;
    END IF;

    -- El producto debe existir y pertenecer a ESTA tienda (re-verificación
    -- en runtime — también cubre las filas creadas por la resolución).
    SELECT p.sku, p.name INTO v_sku, v_name
      FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = v_store_id;
    IF v_sku IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: el producto % no pertenece a la tienda de la recepción', v_product_id;
    END IF;

    -- Duplicados: línea idéntica ya presente → salto idempotente; distinta
    -- → error con remedio (misión §4: reintentos sin duplicar).
    SELECT ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion
      INTO v_dup
      FROM public.receipt_items ri
      WHERE ri.receipt_id = p_receipt_id AND ri.product_id = v_product_id
      LIMIT 1;
    IF FOUND THEN
      IF v_dup.quantity = v_qty AND v_dup.unit_cost = v_cost
         AND COALESCE(v_dup.moneda_recepcion, 'CUP') = v_moneda
         AND COALESCE(v_dup.tasa_cambio_recepcion, 1) = v_tasa THEN
        v_idem_count := v_idem_count + 1;
        v_added := v_added || jsonb_build_object('product_id', v_product_id, 'sku', v_sku,
          'name', v_name, 'state', 'already_present_idempotent');
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'ERR_PRODUCT_ALREADY_IN_RECEIPT: "%" (producto %) ya está en la recepción con otros datos — edite su cantidad/costo en la tabla en lugar de agregarlo de nuevo', v_name, v_sku;
    END IF;

    INSERT INTO public.receipt_items
      (receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
    VALUES
      (p_receipt_id, v_product_id, v_qty, v_cost, v_moneda, v_tasa);

    v_added_count := v_added_count + 1;
    v_added := v_added || jsonb_build_object(
      'product_id', v_product_id, 'sku', v_sku, 'name', v_name,
      'quantity', v_qty, 'unit_cost', v_cost, 'moneda', v_moneda,
      'sku_assigned_by_server', COALESCE(NULLIF(btrim(COALESCE(v_item->>'sku', '')), ''), '') = '');
  END LOOP;

  -- Total recalculado con la doctrina del módulo (valida coherencia global).
  v_new_total := public.calculate_receipt_total_cup(p_receipt_id);
  UPDATE public.receipts SET total_cost = v_new_total, updated_at = now()
    WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'reception_items_added', 'receipts', p_receipt_id,
    jsonb_build_object(
      'added', v_added_count, 'idempotent_skipped', v_idem_count,
      'new_total', v_new_total,
      'origin', 'cp_recepciones_catalogo_maestro_001_fase3',
      'items', v_added));

  RETURN jsonb_build_object(
    'status', 'success',
    'added_count', v_added_count,
    'idempotent_skipped', v_idem_count,
    'new_total', v_new_total,
    'items', v_added
  );
END
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Guardado ATÓMICO completo del modal de edición de borradores.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_pending_reception_changes(
  p_receipt_id uuid,
  p_header jsonb DEFAULT '{}'::jsonb,
  p_item_updates jsonb DEFAULT '[]'::jsonb,
  p_new_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_supplier text;
  v_reference_doc text;
  v_notes text;
  v_has_economic boolean := FALSE;
  v_header_update jsonb := '{}'::jsonb;
  v_update_res jsonb := NULL;
  v_add_res jsonb := NULL;
  v_new_total numeric;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
    FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  v_supplier := NULLIF(btrim(COALESCE(p_header->>'supplier', '')), '');
  v_reference_doc := NULLIF(btrim(COALESCE(p_header->>'reference_doc', '')), '');
  v_notes := p_header->>'notes';

  IF (p_item_updates IS NOT NULL AND jsonb_typeof(p_item_updates) = 'array' AND jsonb_array_length(p_item_updates) > 0)
     OR (p_new_items IS NOT NULL AND jsonb_typeof(p_new_items) = 'array' AND jsonb_array_length(p_new_items) > 0)
     OR v_supplier IS NOT NULL OR v_reference_doc IS NOT NULL THEN
    v_has_economic := TRUE;
  END IF;
  IF v_has_economic AND v_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: los datos económicos/documentales solo son editables en recepciones pendientes (estado actual: %)', v_status;
  END IF;

  -- 1. Cabecera.
  IF v_supplier IS NOT NULL THEN v_header_update := v_header_update || jsonb_build_object('supplier', v_supplier); END IF;
  IF v_reference_doc IS NOT NULL THEN v_header_update := v_header_update || jsonb_build_object('reference_doc', v_reference_doc); END IF;
  IF v_notes IS NOT NULL THEN v_header_update := v_header_update || jsonb_build_object('notes', v_notes); END IF;
  IF v_header_update <> '{}'::jsonb THEN
    UPDATE public.receipts SET
      supplier = COALESCE(v_header_update->>'supplier', supplier),
      reference_doc = COALESCE(v_header_update->>'reference_doc', reference_doc),
      notes = COALESCE(v_header_update->>'notes', notes),
      updated_at = now()
    WHERE id = p_receipt_id;
  END IF;

  -- 2. Actualizaciones de líneas existentes (RPC canónica, misma transacción).
  IF p_item_updates IS NOT NULL AND jsonb_typeof(p_item_updates) = 'array' AND jsonb_array_length(p_item_updates) > 0 THEN
    v_update_res := public.update_reception_items(p_receipt_id, p_item_updates, v_caller_uid);
  END IF;

  -- 3. Líneas nuevas (RPC canónica, misma transacción).
  IF p_new_items IS NOT NULL AND jsonb_typeof(p_new_items) = 'array' AND jsonb_array_length(p_new_items) > 0 THEN
    v_add_res := public.add_reception_items(p_receipt_id, p_new_items, v_caller_uid);
  END IF;

  SELECT total_cost INTO v_new_total FROM public.receipts WHERE id = p_receipt_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', COALESCE(v_update_res->>'updated_count', '0'),
    'failed_count', COALESCE(v_update_res->>'failed_count', '0'),
    'added_count', COALESCE(v_add_res->>'added_count', '0'),
    'idempotent_skipped', COALESCE(v_add_res->>'idempotent_skipped', '0'),
    'new_total', v_new_total,
    'added', COALESCE(v_add_res->'items', '[]'::jsonb)
  );
END
$function$;

-- Exposición controlada: API route con sesión de usuario (authenticated)
-- y service_role. Cada RPC verifica has_store_access_as internamente.
GRANT EXECUTE ON FUNCTION public.add_reception_items(uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_pending_reception_changes(uuid, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- GUARD fail-closed post-migración
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_CATMAESTRO001_F3_GUARD$
DECLARE
  v_add text;
  v_save text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_add
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'add_reception_items';
  IF v_add IS NULL THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items no existe'; END IF;
  IF v_add NOT LIKE '%ERR_NOT_EDITABLE%' THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items sin guard de estado'; END IF;
  IF v_add NOT LIKE '%resolve_reception_import_rows%' THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items no usa el escritor canónico'; END IF;
  IF v_add NOT LIKE '%ERR_PRODUCT_ALREADY_IN_RECEIPT%' OR v_add NOT LIKE '%already_present_idempotent%' THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items sin protección de duplicados/idempotencia';
  END IF;
  IF v_add NOT LIKE '%calculate_receipt_total_cup%' THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items no recalcula el total'; END IF;
  IF v_add NOT LIKE '%audit_logs%' THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items no audita'; END IF;
  IF v_add ~ '(?i)register_stock_movement|fn_recalc_wac|kardex' THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: add_reception_items NO debe tocar inventario'; END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_save
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'save_pending_reception_changes';
  IF v_save IS NULL THEN RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: save_pending_reception_changes no existe'; END IF;
  IF v_save NOT LIKE '%update_reception_items%' OR v_save NOT LIKE '%add_reception_items%' THEN
    RAISE EXCEPTION 'CP-CATMAESTRO001-F3-GUARD: save_pending_reception_changes no reutiliza las RPC canónicas';
  END IF;
END
$CP_CATMAESTRO001_F3_GUARD$;
