-- ═══════════════════════════════════════════════════════════════════════════
-- CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 (2026-11-16) · PARTE 2
-- MOTOR DE IDENTIFICACIÓN Y CLASIFICACIÓN DEL IMPORTADOR DE RECEPCIONES
-- ═══════════════════════════════════════════════════════════════════════════
-- Nuevo motor (misión §4-§6, §8):
--   · fn_classify_reception_import_row: helper interno que clasifica UNA fila
--     del Excel contra el Catálogo Maestro SIN excluir productos por estado
--     (consulta maestros activos Y archivados, filas locales activas E
--     inactivas). Orden de identificación (misión §4): SKU normalizado →
--     código de barras (solo para detectar conflictos) → nombre exacto
--     normalizado EXCLUSIVAMENTE como auxiliar (nunca resuelve solo).
--     La normalización (btrim/lower) es SOLO para comparar: el SKU original
--     se conserva tal cual y jamás se reescribe silenciosamente.
--   · classify_reception_import_rows: RPC de solo lectura (STABLE) que
--     clasifica el lote completo y devuelve el RESUMEN calculado por el
--     backend (misión §8: cifras reales, no contadores del frontend).
--   · resolve_reception_import_rows: escritor canónico del importador:
--     por fila transaccional (aislamiento por fila, patrón
--     managed_bulk_import_products), IDEMPOTENTE (reintento → identified),
--     ejecuta activación local / reactivación global confirmada / creación
--     autorizada de maestro, y devuelve los product_ids para las líneas de
--     la recepción + contadores reales. register_reception sigue siendo el
--     ÚNICO escritor de la recepción y sus movimientos (misión §9).
--
-- CLASIFICACIÓN (misión §5) — estados devueltos:
--   identified        A · existe y está activo y vinculado (o huérfano local
--                     histórico ACTIVO: se usa la fila existente, jamás se
--                     duplica; bandera orphan_local para auditoría §7)
--   activate_local    B · existe en el maestro; sin asociación local o con
--                     asociación local inactiva → se activará en esta tienda
--   reactivate_master C · existe pero está desactivado GLOBALMENTE (archived)
--                     → requiere reactivación explícita con alcance global
--   new_master        D · no existe en absoluto → se creará PRIMERO en el
--                     Catálogo Maestro y después se activará en la tienda
--                     (allowed=false si el usuario no tiene autorización)
--   new_local         (tienda NO conectada) comportamiento histórico: alta
--                     local pura vía register_reception (legacy new_product)
--   review            E · ambiguo/conflictivo: no se crea ni activa NADA
--   error             validación de datos de la fila (faltantes, duplicados
--                     en archivo, formatos)
--
-- SEGURIDAD: SECURITY DEFINER + search_path fijado + has_store_access_as.
-- Las escritoras respetan RLS del negocio vía las validaciones canónicas
-- (roles de create_master_product, gobernador para reactivación). ACL:
-- EXECUTE solo authenticated + service_role.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Helper interno: clasificación de UNA fila (sin duplicados de archivo)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classify_reception_import_row(
  p_tenant_id uuid,
  p_store_id uuid,
  p_connected boolean,
  p_row jsonb,
  p_caller_uid uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sku_raw text := COALESCE(p_row->>'sku', '');
  v_sku text := NULLIF(btrim(v_sku_raw), '');
  v_name text := NULLIF(btrim(COALESCE(p_row->>'name', '')), '');
  v_barcode text := NULLIF(btrim(COALESCE(p_row->>'barcode', '')), '');
  v_quantity numeric;
  v_unit_cost numeric;
  v_reasons jsonb := '[]'::jsonb;
  v_status text;
  v_product_id uuid;
  v_master_id uuid;
  v_master_status text;
  v_master_name text;
  v_master_barcode text;
  v_local record;
  v_local_found boolean := FALSE;
  v_name_candidates jsonb := '[]'::jsonb;
  v_can_create_master boolean := FALSE;
  v_result jsonb;
BEGIN
  -- ── Validación literal de la fila (fidelidad; sin reformateos) ──
  v_quantity := COALESCE(NULLIF(p_row->>'quantity', '')::numeric, NULL);
  v_unit_cost := COALESCE(NULLIF(p_row->>'unit_cost', '')::numeric, NULL);

  IF v_name IS NULL AND v_sku IS NULL THEN
    v_status := 'error';
    v_reasons := v_reasons || '["ERR_EMPTY_ROW: fila sin SKU ni nombre"]'::jsonb;
  ELSIF v_sku IS NULL THEN
    IF p_connected THEN
      v_status := 'error';
      v_reasons := v_reasons || '["ERR_PRODUCT_WITHOUT_SKU: en tienda conectada al Catálogo Maestro la fila requiere SKU (la identidad del producto es compartida)"]'::jsonb;
    ELSE
      -- Comportamiento histórico preservado (misión §11.17): sin conexión,
      -- el alta local admite SKU autogenerado por el cliente.
      v_status := 'new_local';
    END IF;
  ELSE
    IF v_sku_raw <> btrim(v_sku_raw) THEN
      v_status := 'review';
      v_reasons := v_reasons || jsonb_build_array('ERR_SKU_WITH_SPACES: el SKU "' || v_sku_raw || '" tiene espacios al inicio o al final; no se reformatea (fidelidad literal). Corrija el archivo.');
    ELSIF length(v_sku) > 100 THEN
      v_status := 'error';
      v_reasons := v_reasons || '["ERR_SKU_TOO_LONG: el SKU supera 100 caracteres"]'::jsonb;
    END IF;
  END IF;

  IF v_name IS NULL AND (v_sku IS NOT NULL) THEN
    v_status := 'error';
    v_reasons := v_reasons || '["ERR_PRODUCT_WITHOUT_NAME: nombre vacío o nulo"]'::jsonb;
  ELSIF v_name IS NOT NULL AND length(v_name) > 200 THEN
    v_status := 'error';
    v_reasons := v_reasons || '["ERR_NAME_TOO_LONG: el nombre supera 200 caracteres"]'::jsonb;
  END IF;

  IF v_quantity IS NULL OR v_quantity < 1 THEN
    v_status := 'error';
    v_reasons := v_reasons || '["ERR_INVALID_QUANTITY: la cantidad debe ser >= 1"]'::jsonb;
  END IF;
  IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
    v_status := 'error';
    v_reasons := v_reasons || '["ERR_INVALID_UNIT_COST: el costo unitario debe ser > 0 (B4 register_reception)"]'::jsonb;
  END IF;

  -- Errores de validación → fin inmediato (no hay nada que identificar).
  IF v_status = 'error' THEN
    RETURN jsonb_build_object(
      'sku', v_sku_raw, 'name', v_name, 'status', 'error',
      'reasons', v_reasons, 'barcode', v_barcode);
  ELSIF v_status = 'review' AND v_reasons <> '[]'::jsonb THEN
    RETURN jsonb_build_object(
      'sku', v_sku_raw, 'name', v_name, 'status', 'review',
      'reasons', v_reasons, 'barcode', v_barcode);
  END IF;

  IF NOT p_connected THEN
    -- ── Tienda NO conectada: comportamiento histórico exacto (misión §11.17).
    -- Match local por SKU o nombre exacto (case-insensitive) SOLO activos.
    SELECT id INTO v_product_id
      FROM public.products
     WHERE store_id = p_store_id AND is_active
       AND (lower(btrim(sku)) = lower(v_sku) OR lower(btrim(name)) = lower(v_name))
     ORDER BY (lower(btrim(sku)) = lower(v_sku)) DESC, created_at
     LIMIT 1;
    IF v_product_id IS NOT NULL THEN
      v_status := 'identified';
    ELSE
      v_status := 'new_local';
    END IF;
    RETURN jsonb_build_object(
      'sku', v_sku_raw, 'name', v_name, 'status', v_status,
      'product_id', v_product_id, 'reasons', v_reasons, 'barcode', v_barcode);
  END IF;

  -- ── Tienda CONECTADA: motor de identificación contra el Catálogo Maestro ──
  -- Autorización para crear maestros (paridad create_master_product; se
  -- informa para que la previsualización pueda bloquear la fila §6.3).
  v_can_create_master := public.is_admin_check(p_caller_uid)
     OR public.has_store_role_as(p_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]);

  -- Fila local por SKU normalizado (SIN filtrar por is_active: misión §3).
  SELECT id, is_active, master_product_id, name
    INTO v_local
    FROM public.products
   WHERE store_id = p_store_id AND lower(btrim(sku)) = lower(v_sku)
   LIMIT 1;
  -- NOTA PL/pgSQL: un RECORD con algún campo NULL (p.ej. master_product_id de
  -- un huérfano) evalúa «IS NOT NULL» como FALSE (semántica de composITOR):
  -- la existencia se captura con FOUND inmediatamente tras el SELECT.
  v_local_found := FOUND;

  -- Maestro por SKU normalizado (SIN filtrar por status: activos y archivados).
  SELECT id, status, name, barcode
    INTO v_master_id, v_master_status, v_master_name, v_master_barcode
    FROM public.master_products
   WHERE tenant_id = p_tenant_id AND lower(btrim(sku)) = lower(v_sku)
   LIMIT 1;

  IF v_local_found THEN
    IF v_local.master_product_id IS NOT NULL THEN
      -- Fila local vinculada. La clase C (§5.C) domina por ESTADO GLOBAL del
      -- maestro: archivado ⇒ producto EXISTENTE inactivo en el Catálogo
      -- Maestro (requiere reactivación explícita), sin importar el estado
      -- local. Con maestro activo: local activa ⇒ identificada (A); local
      -- inactiva ⇒ activación en tienda (B).
      IF v_master_status = 'archived' THEN
        v_status := 'reactivate_master';
        v_reasons := v_reasons || jsonb_build_array('INFO_REACTIVATION_SCOPE: la reactivación es GLOBAL: el producto quedará disponible para TODAS las tiendas conectadas de la organización. Requiere confirmación explícita y un gobernador del catálogo.');
      ELSIF v_local.is_active THEN
        v_status := 'identified';
        v_product_id := v_local.id;
      ELSE
        -- Asociación local inactiva → activación en tienda (misión §5.B).
        v_status := 'activate_local';
      END IF;
    ELSE
      -- Huérfano histórico (sin vínculo): jamás duplicar ni auto-vincular (§7).
      IF v_master_id IS NOT NULL THEN
        v_status := 'review';
        v_reasons := v_reasons || jsonb_build_array('ERR_ORPHAN_LOCAL_WITH_MASTER: existe un producto local sin vínculo con SKU "' || v_sku || '" Y un maestro con ese SKU. Requiere conciliación de gobernanza (incorporación); no se crea ni activa nada automáticamente.');
      ELSIF v_local.is_active THEN
        v_status := 'identified';
        v_product_id := v_local.id;
        v_reasons := v_reasons || jsonb_build_array('INFO_ORPHAN_LOCAL: producto local histórico ACTIVO sin vínculo al Catálogo Maestro (huérfano). Se usará la fila existente (sin duplicar); queda pendiente de conciliación con el catálogo.');
      ELSE
        v_status := 'review';
        v_reasons := v_reasons || '["ERR_INACTIVE_ORPHAN_LOCAL: producto local histórico INACTIVO sin vínculo al Catálogo Maestro. Activarlo violaría la regla estructural de la tienda conectada; requiere conciliación (incorporación) antes de recibirlo."]'::jsonb;
      END IF;
    END IF;
  ELSIF v_master_id IS NOT NULL THEN
    IF v_master_status = 'archived' THEN
      v_status := 'reactivate_master';
      v_reasons := v_reasons || jsonb_build_array('INFO_REACTIVATION_SCOPE: la reactivación es GLOBAL: el producto quedará disponible para TODAS las tiendas conectadas de la organización. Requiere confirmación explícita y un gobernador del catálogo.');
    ELSE
      v_status := 'activate_local';
    END IF;
  ELSE
    v_status := 'new_master';
    IF NOT v_can_create_master THEN
      v_reasons := v_reasons || '["ERR_UNAUTHORIZED_MASTER_CREATE: crear productos en el Catálogo Maestro requiere rol admin/manager/encargado en la tienda (o administración global). La fila queda bloqueada."]'::jsonb;
    END IF;
  END IF;

  -- ── Código de barras: coherencia de identidad (misión §4/§11.7) ──
  IF v_barcode IS NOT NULL AND v_sku IS NOT NULL THEN
    IF v_master_id IS NOT NULL AND v_master_barcode IS NOT NULL
       AND v_master_barcode <> v_barcode THEN
      v_status := 'review';
      v_reasons := v_reasons || jsonb_build_array('ERR_BARCODE_CONTRADICTS: el código de barras "' || v_barcode || '" contradice al del maestro del SKU "' || v_sku || '" ("' || v_master_barcode || '"). Requiere revisión.');
    ELSIF v_master_id IS NULL AND EXISTS (
      SELECT 1 FROM public.master_products
       WHERE barcode = v_barcode
         AND (tenant_id <> p_tenant_id OR lower(btrim(sku)) <> lower(v_sku))
    ) THEN
      v_status := 'review';
      v_reasons := v_reasons || jsonb_build_array('ERR_BARCODE_EXISTS: el código de barras "' || v_barcode || '" ya pertenece a otro producto del Catálogo Maestro.');
    END IF;
  END IF;

  -- ── Nombre exacto normalizado: SOLO auxiliar (misión §4) ──
  -- Si el SKU no identifica nada pero el nombre coincide EXACTAMENTE con un
  -- maestro existente → revisión humana (nunca coincidencia difusa, nunca
  -- resolución automática: previene maestros duplicados por identidad).
  IF v_status = 'new_master' AND v_name IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('master_product_id', m.id, 'sku', m.sku, 'name', m.name)), '[]'::jsonb)
      INTO v_name_candidates
      FROM public.master_products m
     WHERE m.tenant_id = p_tenant_id
       AND lower(btrim(m.name)) = lower(v_name)
       AND (v_sku IS NULL OR lower(btrim(m.sku)) <> lower(v_sku));
    IF jsonb_array_length(v_name_candidates) > 0 THEN
      v_status := 'review';
      v_reasons := v_reasons || jsonb_build_array('ERR_NAME_MATCH_REQUIRES_REVIEW: el nombre coincide exactamente con producto(s) existente(s) del Catálogo Maestro con otro SKU. No se crea automáticamente (prevención de duplicados); revise si corresponde a uno de ellos o corrija el SKU.');
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'sku', v_sku_raw,
    'name', COALESCE(v_name, v_master_name),
    'status', v_status,
    'product_id', v_product_id,
    'master_product_id', v_master_id,
    'master_status', v_master_status,
    'master_name', v_master_name,
    'local_row_exists', v_local_found,
    'local_is_active', (v_local_found AND v_local.is_active),
    'orphan_local', (v_local_found AND v_local.master_product_id IS NULL),
    'can_create_master', v_can_create_master,
    'name_match_candidates', v_name_candidates,
    'reasons', v_reasons,
    'barcode', v_barcode
  );
  RETURN v_result;
END;
$function$;

-- Helper interno: SOLO ejecutable por el owner (postgres). Patrón
-- fn_master_apply_identity_changes.
REVOKE EXECUTE ON FUNCTION public.fn_classify_reception_import_row(uuid, uuid, boolean, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) classify_reception_import_rows — previsualización (SOLO LECTURA)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.classify_reception_import_rows(
  p_store_id uuid,
  p_rows jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
  v_connected boolean;
  v_row jsonb;
  v_idx int := 0;
  v_class jsonb;
  v_rows_out jsonb := '[]'::jsonb;
  v_seen_skus jsonb := '[]'::jsonb;
  v_sku text;
  v_status text;
  v_identified int := 0;
  v_activate_local int := 0;
  v_reactivate_master int := 0;
  v_new_master int := 0;
  v_new_master_blocked int := 0;
  v_new_local int := 0;
  v_review int := 0;
  v_error int := 0;
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYLOAD: se requiere un array de filas';
  END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'ERR_BULK_LIMIT: máximo 1000 filas por lote de previsualización';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;
  v_connected := public.is_catalog_store_connected(v_tenant, p_store_id);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    v_class := public.fn_classify_reception_import_row(v_tenant, p_store_id, v_connected, v_row, v_caller_uid);

    -- Duplicados de SKU dentro del archivo (misión §11.6): ambigüedad.
    v_sku := NULLIF(btrim(COALESCE(v_class->>'sku', '')), '');
    IF v_sku IS NOT NULL THEN
      IF v_seen_skus ? lower(v_sku) THEN
        v_class := jsonb_set(v_class, '{status}', to_jsonb('error'::text));
        v_class := jsonb_set(v_class, '{reasons}',
          (v_class->'reasons') || jsonb_build_array('ERR_SKU_DUPLICATE_FILE: el SKU "' || v_sku || '" aparece más de una vez en el archivo'));
      ELSE
        v_seen_skus := v_seen_skus || to_jsonb(lower(v_sku));
      END IF;
    END IF;

    v_status := v_class->>'status';
    CASE v_status
      WHEN 'identified' THEN v_identified := v_identified + 1;
      WHEN 'activate_local' THEN v_activate_local := v_activate_local + 1;
      WHEN 'reactivate_master' THEN v_reactivate_master := v_reactivate_master + 1;
      WHEN 'new_master' THEN
        IF (v_class->>'can_create_master')::boolean THEN
          v_new_master := v_new_master + 1;
        ELSE
          v_new_master_blocked := v_new_master_blocked + 1;
        END IF;
      WHEN 'new_local' THEN v_new_local := v_new_local + 1;
      WHEN 'review' THEN v_review := v_review + 1;
      ELSE v_error := v_error + 1;
    END CASE;

    v_rows_out := v_rows_out || jsonb_set(v_class, '{index}', to_jsonb(v_idx));
  END LOOP;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'tenant_id', v_tenant,
    'catalog_connected', v_connected,
    'rows', v_rows_out,
    'summary', jsonb_build_object(
      'total', v_idx,
      'identified', v_identified,
      'activate_local', v_activate_local,
      'reactivate_master', v_reactivate_master,
      'new_master', v_new_master,
      'new_master_blocked', v_new_master_blocked,
      'new_local', v_new_local,
      'review', v_review,
      'error', v_error,
      -- Líneas válidas para recepción SIN reactivación global (misión §8):
      'valid_lines', v_identified + v_activate_local + v_new_master + v_new_local,
      -- Con reactivación global confirmada (todas las accionables):
      'valid_lines_with_reactivation', v_identified + v_activate_local + v_reactivate_master + v_new_master + v_new_local,
      'computed_by', 'backend'
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.classify_reception_import_rows(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classify_reception_import_rows(uuid, jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.classify_reception_import_rows(uuid, jsonb, uuid) IS
  'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 §5/§8: clasificación READ-ONLY de las filas del Excel de recepciones contra el Catálogo Maestro (sin excluir inactivos). Resumen calculado por el backend. Estados: identified / activate_local / reactivate_master / new_master / new_local / review / error.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) resolve_reception_import_rows — escritor canónico del importador
--    (por fila transaccional, idempotente, con carreras resueltas)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_reception_import_rows(
  p_store_id uuid,
  p_rows jsonb,
  p_confirm_reactivation jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
  v_connected boolean;
  v_row jsonb;
  v_idx int := 0;
  v_class jsonb;
  v_status text;
  v_sku text;
  v_name text;
  v_uom text;
  v_price numeric;
  v_cost numeric;
  v_price_currency text;
  v_barcode text;
  v_master_id uuid;
  v_master_status text;
  v_product_id uuid;
  v_local_id uuid;
  v_master_created boolean;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_confirm text[] := '{}';
  v_local_active boolean;
  v_identified int := 0;
  v_local_created int := 0;
  v_local_activated int := 0;
  v_masters_created int := 0;
  v_masters_reactivated int := 0;
  v_blocked int := 0;
  v_valid_lines int := 0;
  v_seen_skus text[] := '{}';
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYLOAD: se requiere un array de filas';
  END IF;
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'ERR_BULK_LIMIT: máximo 500 filas por lote';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;
  v_connected := public.is_catalog_store_connected(v_tenant, p_store_id);
  -- Confirmaciones de reactivación (SKUs, normalizados a minúsculas).
  v_confirm := ARRAY(SELECT lower(x) FROM jsonb_array_elements_text(COALESCE(p_confirm_reactivation, '[]'::jsonb)) x);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    v_master_created := FALSE;
    v_product_id := NULL;
    v_master_id := NULL;
    BEGIN
      v_class := public.fn_classify_reception_import_row(v_tenant, p_store_id, v_connected, v_row, v_caller_uid);
      v_status := v_class->>'status';
      v_sku := NULLIF(btrim(COALESCE(v_class->>'sku', '')), '');
      v_name := NULLIF(btrim(COALESCE(v_row->>'name', '')), '');
      v_master_id := NULLIF(v_class->>'master_product_id', '')::uuid;

      -- Duplicados de SKU dentro del lote (misión §5.E/§11.6): ambigüedad →
      -- fila bloqueada. La clasificación por fila NO puede detectarlo (ve el
      -- estado tras las escrituras de la fila anterior en la MISMA
      -- transacción), por lo que el lote lo trackea aquí — igual que classify.
      IF v_sku IS NOT NULL THEN
        IF lower(v_sku) = ANY (v_seen_skus) THEN
          v_blocked := v_blocked + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'blocked',
            'reasons', to_jsonb(jsonb_build_array('ERR_SKU_DUPLICATE_FILE: el SKU "' || v_sku || '" aparece más de una vez en el archivo')));
          v_results := v_results || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'error',
            'action', 'blocked', 'product_id', NULL,
            'reasons', to_jsonb(jsonb_build_array('ERR_SKU_DUPLICATE_FILE')));
          CONTINUE;
        ELSE
          v_seen_skus := array_append(v_seen_skus, lower(v_sku));
        END IF;
      END IF;

      IF v_status = 'error' OR v_status = 'review' THEN
        v_blocked := v_blocked + 1;
        v_errors := v_errors || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku', 'status', v_status,
          'reasons', v_class->'reasons');
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku', 'status', v_status,
          'action', 'blocked', 'product_id', NULL,
          'reasons', v_class->'reasons');
        CONTINUE;
      END IF;

      IF v_status = 'identified' THEN
        v_product_id := NULLIF(v_class->>'product_id', '')::uuid;
        v_identified := v_identified + 1;
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku', 'status', 'identified',
          'action', 'use_existing', 'product_id', v_product_id,
          'master_product_id', v_master_id,
          'orphan_local', (v_class->>'orphan_local')::boolean,
          'reasons', v_class->'reasons');
        v_valid_lines := v_valid_lines + 1;
        CONTINUE;
      END IF;

      IF v_status = 'new_local' THEN
        -- Tienda NO conectada: la crea register_reception (legacy) — aquí no
        -- se escribe nada (un solo escritor para el flujo local histórico).
        v_valid_lines := v_valid_lines + 1;
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku', 'status', 'new_local',
          'action', 'legacy_register_reception', 'product_id', NULL,
          'reasons', v_class->'reasons');
        CONTINUE;
      END IF;

      -- Datos locales de la fila (SOLO para la fila local de ESTA tienda).
      v_price := COALESCE(NULLIF(v_row->>'sale_price', '')::numeric, 0);
      v_cost := COALESCE(NULLIF(v_row->>'unit_cost', '')::numeric, 0);
      v_uom := NULLIF(btrim(COALESCE(v_row->>'unit_of_measure', '')), '');
      v_price_currency := COALESCE(NULLIF(btrim(COALESCE(v_row->>'price_currency', '')), ''), 'CUP');
      v_barcode := NULLIF(btrim(COALESCE(v_row->>'barcode', '')), '');

      IF v_status = 'reactivate_master' THEN
        -- Clase C (misión §5.C): reactivación GLOBAL, explícita y autorizada.
        IF v_sku IS NULL OR NOT (lower(v_sku) = ANY (v_confirm)) THEN
          v_blocked := v_blocked + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'blocked',
            'reasons', to_jsonb(jsonb_build_array('ERR_REACTIVATION_NOT_CONFIRMED: la reactivación global del maestro requiere confirmación explícita (alcance: todas las tiendas conectadas)')));
          v_results := v_results || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'reactivate_master',
            'action', 'blocked', 'product_id', NULL,
            'reasons', to_jsonb(jsonb_build_array('ERR_REACTIVATION_NOT_CONFIRMED')));
          CONTINUE;
        END IF;
        IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
          v_blocked := v_blocked + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'blocked',
            'reasons', to_jsonb(jsonb_build_array('ERR_UNAUTHORIZED_REACTIVATE: la reactivación global requiere un gobernador del catálogo')));
          v_results := v_results || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'reactivate_master',
            'action', 'blocked', 'product_id', NULL,
            'reasons', to_jsonb(jsonb_build_array('ERR_UNAUTHORIZED_REACTIVATE')));
          CONTINUE;
        END IF;
        -- Operación autorizada (misma RPC de gobernanza; idempotente).
        PERFORM public.reactivate_master_product(v_master_id, p_store_id, v_caller_uid);
        v_masters_reactivated := v_masters_reactivated + 1;
        -- Tras reactivar, la fila continúa como activate_local.
      END IF;

      IF v_status IN ('activate_local', 'reactivate_master') THEN
        -- Clase B (misión §5.B): activación canónica en esta tienda.
        SELECT id, is_active INTO v_local_id, v_local_active
          FROM public.products
         WHERE master_product_id = v_master_id AND store_id = p_store_id;
        IF v_local_id IS NOT NULL THEN
          IF NOT v_local_active THEN
            UPDATE public.products SET is_active = true WHERE id = v_local_id;
            v_local_activated := v_local_activated + 1;
            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES ('RECEPTION_IMPORT_ACTIVATE_LOCAL', 'products', v_local_id, p_store_id, v_caller_uid,
                    jsonb_build_object('master_product_id', v_master_id, 'sku', v_sku,
                      'origin', 'reception_import', 'mode', 'local_reactivated'));
          END IF;
          v_product_id := v_local_id;
        ELSE
          -- Fila local nueva vinculada (paridad activate_master_product:
          -- cost_average NOMINAL 1 CUP — la primera recepción real lo
          -- sustituye vía fn_recalc_wac, S=0). Datos comerciales de ESTA
          -- tienda (precio/costo del Excel); jamás del maestro ni de otras
          -- tiendas (misión §6). El barcode canónico vive en el MAESTRO
          -- (doctrina 20261028110000: la fila local vinculada no lo porta).
          INSERT INTO public.products (
            store_id, tenant_id, master_product_id, sku, name, price, price_currency,
            cost_price, cost_average, unit_of_measure, is_active, is_complete,
            stock_current, min_stock
          ) VALUES (
            p_store_id, v_tenant, v_master_id, v_sku,
            COALESCE(v_name, v_class->>'name'),
            v_price, v_price_currency, v_cost, 1,
            COALESCE(v_uom, 'unidad'), true, true, 0, 1
          ) RETURNING id INTO v_product_id;
          v_local_created := v_local_created + 1;
          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_IMPORT_ACTIVATE_LOCAL', 'products', v_product_id, p_store_id, v_caller_uid,
                  jsonb_build_object('master_product_id', v_master_id, 'sku', v_sku,
                    'origin', 'reception_import', 'mode', 'local_created',
                    'cost_average_origin', 'nominal_1cup_owner_policy'));
        END IF;
        v_valid_lines := v_valid_lines + 1;
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku',
          'status', CASE WHEN v_status = 'reactivate_master' THEN 'reactivate_master' ELSE 'activate_local' END,
          'action', 'activated_local', 'product_id', v_product_id,
          'master_product_id', v_master_id,
          'master_reactivated', v_status = 'reactivate_master',
          'reasons', v_class->'reasons');
        CONTINUE;
      END IF;

      IF v_status = 'new_master' THEN
        -- Clase D (misión §6): PRIMERO el maestro (identidad compartida,
        -- SOLO identidad), DESPUÉS la fila local vinculada.
        IF NOT (v_class->>'can_create_master')::boolean THEN
          v_blocked := v_blocked + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'blocked',
            'reasons', v_class->'reasons');
          v_results := v_results || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'new_master',
            'action', 'blocked', 'product_id', NULL,
            'reasons', v_class->'reasons');
          CONTINUE;
        END IF;
        IF v_barcode IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.master_products WHERE barcode = v_barcode
        ) THEN
          v_blocked := v_blocked + 1;
          v_errors := v_errors || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'blocked',
            'reasons', to_jsonb(jsonb_build_array('ERR_BARCODE_EXISTS: el código de barras ya pertenece a otro producto del catálogo (global)')));
          v_results := v_results || jsonb_build_object(
            'index', v_idx, 'sku', v_class->>'sku', 'status', 'new_master',
            'action', 'blocked', 'product_id', NULL,
            'reasons', to_jsonb(jsonb_build_array('ERR_BARCODE_EXISTS')));
          CONTINUE;
        END IF;

        BEGIN
          INSERT INTO public.master_products
            (tenant_id, sku, name, barcode, barcode_type, unit_of_measure,
             is_service, status, created_by)
          VALUES
            (v_tenant, v_sku, COALESCE(v_name, v_class->>'name'), v_barcode,
             CASE WHEN v_barcode IS NULL THEN NULL ELSE 'EAN13' END,
             COALESCE(v_uom, 'unidad'), FALSE, 'active', v_caller_uid)
          RETURNING id INTO v_master_id;
          v_master_created := TRUE;
          v_masters_created := v_masters_created + 1;

          -- Trazabilidad de origen (misión §6): alta desde importación de
          -- recepción, tienda solicitante, usuario, identidad.
          INSERT INTO public.master_change_log
            (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
          VALUES
            (v_master_id, v_tenant, 'sku', NULL, v_sku, v_caller_uid, p_store_id),
            (v_master_id, v_tenant, 'name', NULL, COALESCE(v_name, v_class->>'name'), v_caller_uid, p_store_id);
          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_IMPORT_MASTER_CREATED', 'master_products', v_master_id, p_store_id, v_caller_uid,
                  jsonb_build_object('sku', v_sku, 'tenant_id', v_tenant,
                    'origin', 'reception_import', 'source', 'excel_reception_import'));
        EXCEPTION WHEN unique_violation THEN
          -- Carrera entre tiendas (misión §10): se reutiliza el maestro
          -- ganador; NUNCA un segundo maestro.
          v_master_id := NULL;
          SELECT id, status INTO v_master_id, v_master_status
            FROM public.master_products
           WHERE tenant_id = v_tenant AND lower(btrim(sku)) = lower(v_sku)
           FOR UPDATE;
          IF v_master_id IS NULL OR v_master_status <> 'active' THEN
            RAISE EXCEPTION 'ERR_MASTER_SKU_RACE: carrera de unicidad del maestro sin ganador activo para el SKU "%"', v_sku;
          END IF;
        END;

        INSERT INTO public.products (
          store_id, tenant_id, master_product_id, sku, name, price, price_currency,
          cost_price, cost_average, unit_of_measure, is_active, is_complete,
          stock_current, min_stock
        ) VALUES (
          p_store_id, v_tenant, v_master_id, v_sku,
          COALESCE(v_name, v_class->>'name'),
          v_price, v_price_currency, v_cost, 1,
          COALESCE(v_uom, 'unidad'), true, true, 0, 1
        ) RETURNING id INTO v_product_id;
        v_local_created := v_local_created + 1;
        INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
        VALUES ('RECEPTION_IMPORT_ACTIVATE_LOCAL', 'products', v_product_id, p_store_id, v_caller_uid,
                jsonb_build_object('master_product_id', v_master_id, 'sku', v_sku,
                  'origin', 'reception_import', 'mode', 'master_and_local_created',
                  'cost_average_origin', 'nominal_1cup_owner_policy'));

        v_valid_lines := v_valid_lines + 1;
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku', 'status', 'new_master',
          'action', 'master_and_local_created', 'product_id', v_product_id,
          'master_product_id', v_master_id, 'master_created', v_master_created,
          'reasons', v_class->'reasons');
        CONTINUE;
      END IF;

      -- Estado no manejado: fail-closed (nunca procesar en silencio).
      v_blocked := v_blocked + 1;
      v_errors := v_errors || jsonb_build_object(
        'index', v_idx, 'sku', v_class->>'sku', 'status', v_status,
        'reasons', to_jsonb(jsonb_build_array('ERR_UNEXPECTED_STATUS: estado de clasificación no manejado')));
      v_results := v_results || jsonb_build_object(
        'index', v_idx, 'sku', v_class->>'sku', 'status', v_status,
        'action', 'blocked', 'product_id', NULL,
        'reasons', to_jsonb(jsonb_build_array('ERR_UNEXPECTED_STATUS')));

    EXCEPTION
      WHEN OTHERS THEN
        -- Aislamiento por fila: el fallo NO aborta el lote; se reporta con
        -- causa clara. Nada queda a medias (subtransacción por fila).
        v_blocked := v_blocked + 1;
        v_errors := v_errors || jsonb_build_object(
          'index', v_idx, 'sku', COALESCE(v_sku, v_row->>'sku'), 'status', 'error',
          'reasons', to_jsonb(jsonb_build_array('ERR_ROW_PROCESSING: ' || substr(SQLERRM, 1, 300))));
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', COALESCE(v_sku, v_row->>'sku'), 'status', 'error',
          'action', 'blocked', 'product_id', NULL,
          'reasons', to_jsonb(jsonb_build_array('ERR_ROW_PROCESSING: ' || substr(SQLERRM, 1, 300))));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_blocked > 0 THEN 'completed_with_errors' ELSE 'success' END,
    'store_id', p_store_id,
    'tenant_id', v_tenant,
    'catalog_connected', v_connected,
    'total', v_idx,
    'summary', jsonb_build_object(
      'identified', v_identified,
      'masters_created', v_masters_created,
      'masters_reactivated', v_masters_reactivated,
      'locals_created', v_local_created,
      'locals_activated', v_local_activated,
      'blocked', v_blocked,
      'valid_lines', v_valid_lines,
      'computed_by', 'backend'
    ),
    'results', v_results,
    'errors', v_errors
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_reception_import_rows(uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_reception_import_rows(uuid, jsonb, jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_reception_import_rows(uuid, jsonb, jsonb, uuid) IS
  'CP-LOG-RECEPTION-MASTER-CATALOG-INTEGRITY-001 §6/§10: escritor canónico del importador de recepciones. Por fila transaccional e idempotente: activa local, reactiva maestro (confirmación explícita + gobernador) o crea maestro + fila local vinculada (rol autorizado). Carreras resueltas reutilizando el maestro ganador. register_reception permanece como único escritor de la recepción.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) GUARD fail-closed post-migración
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_LOG_RECEPTION_IMPORT_GUARD$
DECLARE
  v_fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'classify_reception_import_rows';
  IF v_fn IS NULL OR v_fn NOT LIKE '%STABLE%' OR v_fn NOT LIKE '%has_store_access_as%'
     OR v_fn NOT LIKE '%computed_by%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-IMPORT-GUARD: classify_reception_import_rows ausente o sin contrato (STABLE/autorización/resumen backend)';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'resolve_reception_import_rows';
  IF v_fn IS NULL OR v_fn NOT LIKE '%SECURITY DEFINER%'
     OR v_fn NOT LIKE '%reactivate_master_product%'
     OR v_fn NOT LIKE '%ERR_REACTIVATION_NOT_CONFIRMED%'
     OR v_fn NOT LIKE '%RECEPTION_IMPORT_MASTER_CREATED%'
     OR v_fn NOT LIKE '%RECEPTION_IMPORT_ACTIVATE_LOCAL%'
     OR v_fn NOT LIKE '%unique_violation%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-IMPORT-GUARD: resolve_reception_import_rows sin escritor canónico completo';
  END IF;

  -- El helper interno existe y NO es ejecutable por clientes (REVOKE de esta
  -- migración: PUBLIC/anon/authenticated sin EXECUTE).
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_classify_reception_import_row';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-IMPORT-GUARD: helper fn_classify_reception_import_row ausente';
  END IF;
  IF coalesce((SELECT p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'fn_classify_reception_import_row'), '')
     LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'CP-LOG-RECEPTION-IMPORT-GUARD: el helper interno no debe ser ejecutable por authenticated';
  END IF;
  RAISE NOTICE 'CP-LOG-RECEPTION-IMPORT-GUARD OK: motor de clasificación y resolución del importador instalado';
END
$CP_LOG_RECEPTION_IMPORT_GUARD$;
