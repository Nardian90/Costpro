-- ════════════════════════════════════════════════════════════════════════
-- CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001 · Migración 2/2 (2026-11-25)
-- Consecutivo OFICIAL del Catálogo Maestro al crear productos desde Recepciones
-- ════════════════════════════════════════════════════════════════════════
--
-- CAUSA RAÍZ (auditada con datos de producción, tenant 5364ccf8 / ENERVIDA):
--   NO existía ninguna secuencia centralizada de códigos. El consecutivo REAL
--   del Catálogo Maestro es numérico contiguo (1..256 completo; outliers
--   históricos 998/999) → siguiente código oficial = 257. Pero:
--   (a) el cliente (useReceptionState.handleAddManualProduct) generaba
--       AUTO-<timestamp36>-<seq36> cuando el usuario dejaba el SKU vacío;
--   (b) fn_classify_reception_import_row rechazaba filas sin SKU en tienda
--       conectada (ERR_PRODUCT_WITHOUT_SKU), forzando ese generador;
--   (c) resolve_reception_import_rows y register_reception creaban el maestro
--       con el SKU LITERAL que llegaba del cliente.
--   Resultado verificado en BD: 17 maestros AUTO-* fuera del consecutivo
--   (16 de la recepción 47380573 + 1 del 23/11), todos vinculados a su fila
--   local — sin duplicados, pero rompiendo el consecutivo oficial.
--
-- SOLUCIÓN (fuente ÚNICA, servidor, transaccional):
--   1) next_master_catalog_sku(tenant): el generador OFICIAL. Regla forward-
--      only: mayor N tal que 1..N existe (prefijo contiguo) → N+1, con salto
--      defensivo de colisiones contra master_products Y products del tenant
--      (cobertura de locales sin maestro). Concurrencia: pg_advisory_xact_lock
--      por tenant — dos tiendas/usuarios simultáneos obtienen códigos distintos;
--      reintentos/fallos no queman códigos (no persiste nada por sí sola).
--   2) fn_classify_reception_import_row: en tienda CONECTADA una fila sin SKU
--      (con nombre) deja de ser error → new_master con auto_sku (el servidor
--      completará la identidad). La coincidencia por NOMBRE contra maestros
--      existentes sigue protegiendo los duplicados (review).
--   3) resolve_reception_import_rows: en new_master sin SKU asigna
--      next_master_catalog_sku DENTRO de su transacción y devuelve el código
--      asignado (sku + sku_assigned_by_server) para trazabilidad y UI.
--   4) register_reception: new_product sin SKU (ruta legacy de tiendas NO
--      conectadas y reintentos) asigna el mismo código oficial — ya no exige
--      SKU tecleado ni confía en generadores del cliente.
--   NO se renumeran los 17 AUTO-* existentes (prohibición de la misión;
--   estrategia opcional documentada en docs/audits/). NO se modifica el
--   formato del código para SKUs tecleados por el usuario.
-- ════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) EL GENERADOR OFICIAL — consecutivo del Catálogo Maestro por tenant
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_master_catalog_sku(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix bigint := 0;
  v_candidate bigint;
  v_guard int := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'ERR_TENANT_REQUIRED: next_master_catalog_sku requiere tenant';
  END IF;
  -- Concurrencia: un solo asignador por tenant a la vez. Las transacciones
  -- simultáneas (dos tiendas creando productos a la vez, reintentos) se
  -- serializan; cada una ve los INSERTs confirmados de la anterior porque el
  -- lock se libera al commit de la ganadora (el 2º llamado ve el SKU nuevo).
  PERFORM pg_advisory_xact_lock(hashtextextended('cp_master_sku_consecutivo:' || p_tenant_id::text, 0));

  -- Consecutivo oficial: prefijo contiguo 1..N de SKUs numéricos del maestro.
  -- (Los outliers históricos 998/999 no participan: están POR ENCIMA del
  --  prefijo y el salto defensivo los evita como candidatos.)
  SELECT COALESCE(MIN(gs.n) - 1, 100000) INTO v_prefix
  FROM generate_series(1, 100000) AS gs(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.master_products mp
    WHERE mp.tenant_id = p_tenant_id
      AND mp.sku ~ '^[0-9]{1,9}$'
      AND (mp.sku)::bigint = gs.n
  );
  v_candidate := v_prefix + 1;

  -- Salto defensivo: el candidato no puede colisionar con NINGÚN sku numérico
  -- ya usado en el tenant (maestros NI filas locales de sus tiendas — cubre
  -- productos creados por tiendas NO conectadas sin fila de maestro).
  WHILE v_guard < 100000 LOOP
    v_guard := v_guard + 1;
    EXIT WHEN
      NOT EXISTS (SELECT 1 FROM public.master_products mp
                  WHERE mp.tenant_id = p_tenant_id
                    AND lower(btrim(mp.sku)) = v_candidate::text)
      AND NOT EXISTS (SELECT 1 FROM public.products p
                      JOIN public.stores s ON s.id = p.store_id
                      WHERE s.tenant_id = p_tenant_id
                        AND p.sku ~ '^[0-9]{1,9}$'
                        AND (p.sku)::bigint = v_candidate);
    v_candidate := v_candidate + 1;
  END LOOP;
  IF v_guard >= 100000 THEN
    RAISE EXCEPTION 'ERR_SKU_SPACE_EXHAUSTED: no se encontró código libre en el consecutivo del tenant %', p_tenant_id;
  END IF;
  RETURN v_candidate::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.next_master_catalog_sku(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_master_catalog_sku(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.next_master_catalog_sku(uuid) IS
  'CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001: generador OFICIAL del consecutivo numérico del Catálogo Maestro (prefijo contiguo 1..N → N+1; salto defensivo de colisiones; advisory xact lock por tenant). Única fuente de códigos automáticos: recepciones (resolve/register) y futuros puntos de entrada.';


-- ─────────────────────────────────────────────────────────────────────────
-- 1b) RPC fina para el ÚNICO caso donde el cliente debe pedir el código:
--     recepciones PENDIENTES en tiendas NO conectadas (el borrador se guarda
--     client-side por diseño; el alta local cae a este asignador). Devuelve
--     el siguiente código OFICIAL del tenant bajo el mismo advisory lock —
--     no hay segundo generador. Colisión residual assignment→insert se
--     resuelve con el patrón establecido 23505→reintento visible.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_next_catalog_sku(p_store_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_access_as(v_caller, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;
  RETURN public.next_master_catalog_sku(v_tenant);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_next_catalog_sku(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_next_catalog_sku(uuid) TO authenticated;

COMMENT ON FUNCTION public.assign_next_catalog_sku(uuid) IS
  'CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001: entrega el siguiente código OFICIAL del consecutivo del Catálogo Maestro al flujo de recepciones pendientes en tiendas NO conectadas (borradores client-side). Usa el mismo generador único next_master_catalog_sku — no existe un segundo asignador.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Clasificador: filas sin SKU en tienda conectada → auto_sku (no error)
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
  -- CP-RECEP-001: fila sin SKU en tienda conectada → identidad la completa el servidor
  v_auto_sku boolean := FALSE;
  -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001: nombre que SE UTILIZARÁ.
  v_effective_name text;
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
      -- CP-RECEP-001: la fila SIN SKU (con nombre) sigue siendo válida en
      -- tienda conectada: la identidad la completa el SERVIDOR con el
      -- siguiente código del consecutivo oficial del Catálogo Maestro
      -- (next_master_catalog_sku, advisory lock por tenant). Ya no se exige
      -- teclear el código ni se acepta el generador AUTO-* del cliente
      -- (eliminado del frontend: producía códigos fuera del consecutivo).
      -- La protección contra duplicados NO cambia: la coincidencia por NOMBRE
      -- exacto contra maestros existentes sigue enviando la fila a revisión.
      v_reasons := v_reasons || jsonb_build_array('INFO_SKU_AUTOASSIGN: sin SKU; al crear el producto se le asignará el siguiente código disponible del consecutivo oficial del Catálogo Maestro.');
      v_auto_sku := TRUE;
    ELSE
      -- Comportamiento histórico preservado (misión §11.17): sin conexión,
      -- el alta local no exige SKU; si la fila llega vacía, register_reception
      -- le asigna el mismo código oficial del tenant.
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
  -- effective_name: sin maestro identificado → el Excel (nada se escribe).
  IF v_status = 'error' THEN
    RETURN jsonb_build_object(
      'sku', v_sku_raw, 'name', v_name, 'status', 'error',
      'effective_name', v_name,
      'reasons', v_reasons, 'barcode', v_barcode);
  ELSIF v_status = 'review' AND v_reasons <> '[]'::jsonb THEN
    RETURN jsonb_build_object(
      'sku', v_sku_raw, 'name', v_name, 'status', 'review',
      'effective_name', v_name,
      'reasons', v_reasons, 'barcode', v_barcode);
  END IF;

  IF NOT p_connected THEN
    -- ── Tienda NO conectada: comportamiento histórico exacto. Match local
    -- por SKU o nombre exacto (case-insensitive) SOLO activos. Sin maestro,
    -- el nombre del alta es el único nombre que existe (autoridad local).
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
      'effective_name', v_name,
      'product_id', v_product_id, 'reasons', v_reasons, 'barcode', v_barcode);
  END IF;

  -- ── Tienda CONECTADA: motor de identificación contra el Catálogo Maestro ──
  -- Autorización para crear maestros (paridad create_master_product; se
  -- informa para que la previsualización pueda bloquear la fila).
  v_can_create_master := public.is_admin_check(p_caller_uid)
     OR public.has_store_role_as(p_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]);

  -- Fila local por SKU normalizado (SIN filtrar por is_active).
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
      -- Fila local vinculada. La clase C domina por ESTADO GLOBAL del
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
        -- Asociación local inactiva → activación en tienda.
        v_status := 'activate_local';
      END IF;
    ELSE
      -- Huérfano histórico (sin vínculo): jamás duplicar ni auto-vincular.
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

  -- ── Código de barras: coherencia de identidad ──
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

  -- ── Nombre exacto normalizado: SOLO auxiliar ──
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

  -- ── CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 (§4): nombre efectivo ──
  -- El nombre del Catálogo Maestro es la autoridad para productos EXISTENTES
  -- (clases A/B/C y huérfanos identificados). El Excel solo nombra lo que se
  -- crea NUEVO: clase D (maestro nuevo) y alta local sin maestro.
  IF v_master_id IS NOT NULL THEN
    v_effective_name := v_master_name;              -- autoridad del maestro
  ELSIF v_status IN ('identified') AND v_local_found THEN
    v_effective_name := v_local.name;               -- huérfano: su nombre vigente
  ELSE
    v_effective_name := v_name;                     -- clase D / new_local
  END IF;

  v_result := jsonb_build_object(
    'sku', v_sku_raw,
    'name', COALESCE(v_name, v_master_name),
    'status', v_status,
    'effective_name', v_effective_name,
    'product_id', v_product_id,
    'master_product_id', v_master_id,
    'master_status', v_master_status,
    'master_name', v_master_name,
    'local_row_exists', v_local_found,
    'local_is_active', (v_local_found AND v_local.is_active),
    'local_name', CASE WHEN v_local_found THEN v_local.name ELSE NULL END,
    'orphan_local', (v_local_found AND v_local.master_product_id IS NULL),
    'can_create_master', v_can_create_master,
    'auto_sku', v_auto_sku,
    'name_match_candidates', v_name_candidates,
    'reasons', v_reasons,
    'barcode', v_barcode
  );
  RETURN v_result;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Escritor canónico: asignación server-side del código oficial
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_reception_import_rows(
  p_store_id uuid,
  p_rows jsonb,
  p_confirm_reactivation jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
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
  -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001: nombre canónico del maestro
  -- (autoridad del nombre para productos existentes; nombre del ganador en
  -- la carrera multitienda §9).
  v_master_name text;
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
  -- CP-RECEP-001: códigos del consecutivo oficial asignados por el servidor
  v_auto_skus_assigned int := 0;
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
    v_master_name := NULL;
    BEGIN
      v_class := public.fn_classify_reception_import_row(v_tenant, p_store_id, v_connected, v_row, v_caller_uid);
      v_status := v_class->>'status';
      v_sku := NULLIF(btrim(COALESCE(v_class->>'sku', '')), '');
      v_name := NULLIF(btrim(COALESCE(v_row->>'name', '')), '');
      v_master_id := NULLIF(v_class->>'master_product_id', '')::uuid;
      -- AUTORIDAD DEL NOMBRE (§4): el maestro existente impone su nombre.
      v_master_name := NULLIF(v_class->>'master_name', '');

      -- Duplicados de SKU dentro del lote: ambigüedad → fila bloqueada.
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
          -- §7: nombre canónico que mostrará la línea de recepción.
          'product_name', COALESCE(v_master_name, v_class->>'effective_name'),
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
          'product_name', v_class->>'effective_name',
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
        -- Clase C: reactivación GLOBAL, explícita y autorizada.
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
        -- reactivate_master_product SOLO cambia status: el nombre canónico
        -- queda intacto (§11.13).
        PERFORM public.reactivate_master_product(v_master_id, p_store_id, v_caller_uid);
        v_masters_reactivated := v_masters_reactivated + 1;
        -- Tras reactivar, la fila continúa como activate_local.
      END IF;

      IF v_status IN ('activate_local', 'reactivate_master') THEN
        -- Clase B: activación canónica en esta tienda.
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
          -- tiendas. El barcode canónico vive en el MAESTRO.
          --
          -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 §4/§5: el nombre de la
          -- fila local es el CANÓNICO del maestro — NUNCA el del Excel. La
          -- activación local jamás copia el nombre del Excel al producto
          -- (el trigger de identidad ya lo coerciona; aquí se hace explícito:
          -- defensa en profundidad, §14.6).
          INSERT INTO public.products (
            store_id, tenant_id, master_product_id, sku, name, price, price_currency,
            cost_price, cost_average, unit_of_measure, is_active, is_complete,
            stock_current, min_stock
          ) VALUES (
            p_store_id, v_tenant, v_master_id, v_sku,
            COALESCE(v_master_name, v_class->>'effective_name'),
            v_price, v_price_currency, v_cost, 1,
            COALESCE(v_uom, 'unidad'), true, true, 0, 1
          ) RETURNING id INTO v_product_id;
          v_local_created := v_local_created + 1;
          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_IMPORT_ACTIVATE_LOCAL', 'products', v_product_id, p_store_id, v_caller_uid,
                  jsonb_build_object('master_product_id', v_master_id, 'sku', v_sku,
                    'origin', 'reception_import', 'mode', 'local_created',
                    'name_source', 'master_canonical',
                    'cost_average_origin', 'nominal_1cup_owner_policy'));
        END IF;
        v_valid_lines := v_valid_lines + 1;
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_class->>'sku',
          'status', CASE WHEN v_status = 'reactivate_master' THEN 'reactivate_master' ELSE 'activate_local' END,
          'action', 'activated_local', 'product_id', v_product_id,
          'master_product_id', v_master_id,
          'master_reactivated', v_status = 'reactivate_master',
          'product_name', COALESCE(v_master_name, v_class->>'effective_name'),
          'reasons', v_class->'reasons');
        CONTINUE;
      END IF;

      IF v_status = 'new_master' THEN
        -- Clase D: PRIMERO el maestro (identidad compartida, SOLO identidad),
        -- DESPUÉS la fila local vinculada. ÚNICO caso en el que el Excel
        -- proporciona el nombre (nombre INICIAL del maestro verdaderamente
        -- nuevo; tras la creación, el maestro es su fuente de verdad).
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

        -- CP-RECEP-001: filas sin SKU reciben el siguiente código del
        -- consecutivo OFICIAL del Catálogo Maestro. Asignación SERVIDOR y
        -- transaccional (advisory xact lock por tenant dentro del generador);
        -- NUNCA MAX+1 desde el cliente. Dos tiendas creando productos a la
        -- vez obtienen códigos distintos; un fallo posterior de la fila no
        -- quema el código (el generador no persiste nada por sí solo).
        IF v_sku IS NULL THEN
          v_sku := public.next_master_catalog_sku(v_tenant);
          v_auto_skus_assigned := v_auto_skus_assigned + 1;
        END IF;

        BEGIN
          INSERT INTO public.master_products
            (tenant_id, sku, name, barcode, barcode_type, unit_of_measure,
             is_service, status, created_by)
          VALUES
            (v_tenant, v_sku, COALESCE(v_name, v_class->>'effective_name'), v_barcode,
             CASE WHEN v_barcode IS NULL THEN NULL ELSE 'EAN13' END,
             COALESCE(v_uom, 'unidad'), FALSE, 'active', v_caller_uid)
          RETURNING id INTO v_master_id;
          v_master_created := TRUE;
          v_masters_created := v_masters_created + 1;
          v_master_name := COALESCE(v_name, v_class->>'effective_name');

          -- Trazabilidad de origen: alta desde importación de recepción,
          -- tienda solicitante, usuario, identidad.
          INSERT INTO public.master_change_log
            (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
          VALUES
            (v_master_id, v_tenant, 'sku', NULL, v_sku, v_caller_uid, p_store_id),
            (v_master_id, v_tenant, 'name', NULL, v_master_name, v_caller_uid, p_store_id);
          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_IMPORT_MASTER_CREATED', 'master_products', v_master_id, p_store_id, v_caller_uid,
                  jsonb_build_object('sku', v_sku, 'tenant_id', v_tenant,
                    'origin', 'reception_import', 'source', 'excel_reception_import'));
        EXCEPTION WHEN unique_violation THEN
          -- Carrera entre tiendas (§9): se reutiliza el maestro ganador;
          -- NUNCA un segundo maestro. El NOMBRE canónico es el DEL GANADOR:
          -- la fila local de ESTA tienda no puede imponer el nombre de su
          -- Excel sobre la identidad compartida.
          v_master_id := NULL;
          v_master_name := NULL;
          SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
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
          COALESCE(v_master_name, v_class->>'effective_name'),
          v_price, v_price_currency, v_cost, 1,
          COALESCE(v_uom, 'unidad'), true, true, 0, 1
        ) RETURNING id INTO v_product_id;
        v_local_created := v_local_created + 1;
        INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
        VALUES ('RECEPTION_IMPORT_ACTIVATE_LOCAL', 'products', v_product_id, p_store_id, v_caller_uid,
                jsonb_build_object('master_product_id', v_master_id, 'sku', v_sku,
                  'origin', 'reception_import', 'mode', 'master_and_local_created',
                  'name_source', 'master_canonical',
                  'cost_average_origin', 'nominal_1cup_owner_policy'));

        v_valid_lines := v_valid_lines + 1;
        v_results := v_results || jsonb_build_object(
          'index', v_idx, 'sku', v_sku,
          'sku_assigned_by_server', ((v_class->>'sku') IS NULL),
          'status', 'new_master',
          'action', 'master_and_local_created', 'product_id', v_product_id,
          'master_product_id', v_master_id, 'master_created', v_master_created,
          'product_name', v_master_name,
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
        -- causa clara. Nada queda a medias (subtransacción por fila) — ningún
        -- cambio parcial de nombres (§11.16).
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
      'auto_skus_assigned', v_auto_skus_assigned,
      'computed_by', 'backend'
    ),
    'results', v_results,
    'errors', v_errors
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) register_reception: new_product sin SKU → código oficial (ruta legacy)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_reception(
  p_store_id uuid,
  p_supplier text,
  p_reception_date timestamptz DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_po_id uuid DEFAULT NULL,
  p_supplier_code text DEFAULT NULL,
  p_supplier_address text DEFAULT NULL,
  p_supplier_phone text DEFAULT NULL,
  p_supplier_tax_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor NUMERIC := 1;
  v_units_to_add NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
  v_uc_base NUMERIC;
  -- MISIÓN RECEPCIONES (2026-10-27): alta transaccional de productos nuevos
  v_new_product JSONB;
  v_new_sku TEXT;
  v_new_tenant_id UUID;
  v_created_skus TEXT[] := '{}';
  -- CP-RECEP-001: conteo de códigos oficiales asignados por el servidor
  v_new_skus_autoassigned int := 0;
  v_new_products_count INTEGER := 0;
  -- CP-CAT-MAESTRO-003: sincronización con el catálogo maestro
  v_store_connected BOOLEAN := FALSE;
  v_master_id UUID;
  v_master_status TEXT;
  v_master_name TEXT;
  v_master_created_count INTEGER := 0;
  v_master_linked_count INTEGER := 0;
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  IF p_invoice_number IS NOT NULL AND btrim(p_invoice_number) <> '' AND EXISTS (
    SELECT 1 FROM public.receipts
    WHERE store_id = p_store_id
      AND reference_doc IS NOT NULL
      AND reference_doc = btrim(p_invoice_number)
  ) THEN
    RAISE EXCEPTION 'ERR_INVOICE_DUPLICATE: el número de factura "%" ya existe en esta tienda. Usa un número distinto.', btrim(p_invoice_number);
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id,
    supplier_code, supplier_address, supplier_phone, supplier_tax_id
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id,
    p_supplier_code, p_supplier_address, p_supplier_phone, p_supplier_tax_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;

    IF v_item ? 'new_product' THEN
      IF v_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_AMBIGUOUS_ITEM: el item trae product_id y new_product a la vez';
      END IF;
      v_new_product := v_item->'new_product';
      v_new_sku := btrim(COALESCE(v_new_product->>'sku', ''));
      IF btrim(COALESCE(v_new_product->>'name', '')) = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre', v_new_sku;
      END IF;
      -- CP-RECEP-001: el tenant se resuelve ANTES de la asignación de código.
      IF v_new_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;
      -- CP-RECEP-001: producto nuevo SIN SKU tecleado → el SERVIDOR le asigna
      -- el siguiente código del consecutivo OFICIAL del Catálogo Maestro
      -- (next_master_catalog_sku, advisory xact lock por tenant). Ya no se
      -- exige SKU tecleado ni se depende del generador AUTO-* del cliente
      -- (eliminado del frontend: producía códigos fuera del consecutivo).
      IF v_new_sku = '' THEN
        v_new_sku := public.next_master_catalog_sku(v_new_tenant_id);
        v_new_skus_autoassigned := v_new_skus_autoassigned + 1;
      END IF;
      IF v_new_sku = ANY (v_created_skus) THEN
        RAISE EXCEPTION 'ERR_SKU_DUPLICATE_PAYLOAD: el SKU "%" aparece más de una vez entre los productos nuevos de la recepción', v_new_sku;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE store_id = p_store_id AND sku = v_new_sku
      ) THEN
        RAISE EXCEPTION 'ERR_SKU_EXISTS: el SKU "%" ya existe en el catálogo de esta tienda. Selecciona el producto existente (o actívalo desde el Catálogo Maestro con el asistente de importación) en lugar de crearlo de nuevo.', v_new_sku;
      END IF;
      IF v_new_tenant_id IS NULL THEN
        -- (CP-RECEP-001: ya resuelto antes de asignar código; guard defensivo)
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;

      v_store_connected := public.is_catalog_store_connected(v_new_tenant_id, p_store_id);

      IF v_store_connected THEN
        v_master_id := NULL;
        v_master_status := NULL;
        v_master_name := NULL;
        SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
          FROM public.master_products
         WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
         FOR UPDATE;

        IF v_master_id IS NOT NULL AND v_master_status = 'active' AND EXISTS (
          SELECT 1 FROM public.products
           WHERE master_product_id = v_master_id AND store_id = p_store_id
        ) THEN
          -- CASO A7 · vínculo ya ocupado por otra fila local (inconsistencia
          -- previa tras reetiquetado). Se RECHAZA la escritura con error
          -- accionable — jamás una fila local huérfana en tienda conectada.
          RAISE EXCEPTION 'ERR_MASTER_LINK_CONFLICT: el vínculo del maestro (SKU "%") con esta tienda ya está ocupado por otra fila local. Requiere revisión de gobernanza (reetiquetado/conciliación): no se crea un producto independiente ni se registra la recepción.', v_new_sku;
        ELSIF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
          -- CASO A4 · maestro existente y activo: VINCULAR (reutilizar identidad).
          -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 §5: el nombre de la
          -- fila local es el CANÓNICO del maestro (v_master_name) — NUNCA el
          -- nombre del payload/Excel. La auditoría conserva
          -- 'local_name_requested' para trazabilidad.
          INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, v_master_name,
              COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
              COALESCE((v_new_product->>'price')::NUMERIC, 0),
              COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
              TRUE,
              COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
              0
            ) RETURNING id INTO v_product_id;
          v_master_linked_count := v_master_linked_count + 1;

          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_PRODUCT_LINKED_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
            jsonb_build_object(
              'sku', v_new_sku,
              'master_product_id', v_master_id,
              'master_name', v_master_name,
              'local_name_requested', btrim(v_new_product->>'name'),
              'name_source', 'master_canonical',
              'receipt_id', v_receipt_id,
              'product_id', v_product_id,
              'at', now()));
        ELSE
          IF v_master_id IS NULL THEN
            -- CASO A5 · alta de identidad compartida (SOLO identidad compartida).
            -- La creación de identidad maestra exige autorización (paridad
            -- create_master_product): admin global o rol admin/manager/encargado.
            IF NOT public.is_admin_check(v_caller_uid)
               AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
              RAISE EXCEPTION 'ERR_UNAUTHORIZED_MASTER_CREATE: crear el producto "%" en el Catálogo Maestro requiere rol admin/manager/encargado en la tienda (o administración global). Usa el asistente de importación de recepciones para clasificar y crear con autorización.', v_new_sku;
            END IF;
            BEGIN
              INSERT INTO public.master_products
                (tenant_id, sku, name, image_path, barcode, unit_of_measure, is_service, status, created_by)
              VALUES
                (v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'), NULL, NULL,
                 COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
                 FALSE, 'active', v_user_id)
              RETURNING id INTO v_master_id;

              v_master_created_count := v_master_created_count + 1;
              v_master_status := 'active';
              v_master_name := btrim(v_new_product->>'name');

              INSERT INTO public.master_change_log
                (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
              VALUES
                (v_master_id, v_new_tenant_id, 'sku', NULL, v_new_sku, v_user_id, p_store_id),
                (v_master_id, v_new_tenant_id, 'name', NULL, v_master_name, v_user_id, p_store_id);
            EXCEPTION WHEN unique_violation THEN
              -- Carrera: otra tienda creó el mismo SKU en paralelo. Se reutiliza
              -- el maestro ganador (un solo maestro por organización) y su
              -- NOMBRE canónico — el payload de ESTA llamada no renombra (§9).
              v_master_status := NULL;
              v_master_name := NULL;
              SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
                FROM public.master_products
               WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
               FOR UPDATE;
            END;
          END IF;

          IF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
            -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 §5: nombre local =
            -- v_master_name (canónico; el del GANADOR en la carrera §9).
            INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, v_master_name,
              COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
              COALESCE((v_new_product->>'price')::NUMERIC, 0),
              COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
              TRUE,
              COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
              0
            ) RETURNING id INTO v_product_id;
            v_master_linked_count := v_master_linked_count + 1;

            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES ('RECEPTION_PRODUCT_LINKED_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
              jsonb_build_object(
                'sku', v_new_sku,
                'master_product_id', v_master_id,
                'master_name', v_master_name,
                'local_name_requested', btrim(v_new_product->>'name'),
                'name_source', 'master_canonical',
                'receipt_id', v_receipt_id,
                'product_id', v_product_id,
                'at', now()));
          ELSE
            -- CASO A6 · maestro archivado: se RECHAZA (error accionable) —
            -- la reactivación global es decisión de gobernanza explícita.
            RAISE EXCEPTION 'ERR_MASTER_ARCHIVED: el producto maestro del SKU "%" está archivado en el Catálogo Maestro. Requiere reactivación global por un gobernador del catálogo (confirmación explícita desde el asistente de importación) antes de poder recibirlo; no se crea un producto independiente.', v_new_sku;
          END IF;
        END IF;
      ELSE
        -- CASO B · tienda NO conectada: alta local pura, sin maestro ni
        -- relaciones (funcionamiento de la tienda sin cambios).
        INSERT INTO public.products (
            store_id, tenant_id, sku, name, cost_price, price,
            unit_of_measure, is_active, is_complete, stock_current
          ) VALUES (
            p_store_id, v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'),
            COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
            COALESCE((v_new_product->>'price')::NUMERIC, 0),
            COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
            TRUE,
            COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
            0
          ) RETURNING id INTO v_product_id;
      END IF;

      v_created_skus := array_append(v_created_skus, v_new_sku);
      v_new_products_count := v_new_products_count + 1;
    END IF;

    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id AND store_id = p_store_id
        AND expiration_date IS NOT NULL
        AND expiration_date < v_effective_date
        AND quantity_remaining > 0
    ) THEN
      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- WAC primero → movimiento después (orden doctrina W62-01 §6).
    v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                      THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                      ELSE v_unit_cost_cup END;
    PERFORM public.fn_recalc_wac(
      p_store_id   := p_store_id,
      p_product_id := v_product_id,
      p_event      := 'reception_in',
      p_qty_in     := v_units_to_add,
      p_uc_in      := v_uc_base,
      p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );

    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object(
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id,
      'new_products_created', v_new_products_count,
      'new_products_master_created', v_master_created_count,
      'new_products_master_linked', v_master_linked_count,
      'new_products_sku_autoassigned', v_new_skus_autoassigned
    ));

  RETURN v_receipt_id;
END
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- GUARD fail-closed post-migración
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_RECEP001_SKU_GUARD$
DECLARE
  v_fn text;
  v_fn2 text;
  v_fn3 text;
  v_fn4 text;
BEGIN
  -- A) El generador oficial existe, usa advisory lock y no depende del cliente.
  SELECT pg_get_functiondef(p.oid) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'next_master_catalog_sku';
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'CP-RECEP001-SKU-GUARD: next_master_catalog_sku no existe';
  END IF;
  IF v_fn NOT LIKE '%pg_advisory_xact_lock%' OR v_fn NOT LIKE '%master_products%' THEN
    RAISE EXCEPTION 'CP-RECEP001-SKU-GUARD: next_master_catalog_sku sin lock por tenant o sin fuente maestro';
  END IF;

  -- B) El clasificador ya NO exige SKU en tienda conectada (auto_sku).
  SELECT pg_get_functiondef(p.oid) INTO v_fn2
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_classify_reception_import_row';
  IF v_fn2 IS NULL OR v_fn2 LIKE '%ERR_PRODUCT_WITHOUT_SKU%' THEN
    RAISE EXCEPTION 'CP-RECEP001-SKU-GUARD: fn_classify_reception_import_row sigue rechazando filas sin SKU';
  END IF;
  IF v_fn2 NOT LIKE '%auto_sku%' THEN
    RAISE EXCEPTION 'CP-RECEP001-SKU-GUARD: fn_classify_reception_import_row sin bandera auto_sku';
  END IF;

  -- C) El escritor canónico asigna el código oficial para new_master sin SKU.
  SELECT pg_get_functiondef(p.oid) INTO v_fn3
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'resolve_reception_import_rows';
  IF v_fn3 IS NULL OR v_fn3 NOT LIKE '%next_master_catalog_sku%' THEN
    RAISE EXCEPTION 'CP-RECEP001-SKU-GUARD: resolve_reception_import_rows no usa el generador oficial';
  END IF;

  -- D) register_reception asigna el código oficial en new_product sin SKU.
  SELECT pg_get_functiondef(p.oid) INTO v_fn4
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'register_reception';
  IF v_fn4 IS NULL OR v_fn4 NOT LIKE '%next_master_catalog_sku%' THEN
    RAISE EXCEPTION 'CP-RECEP001-SKU-GUARD: register_reception no usa el generador oficial';
  END IF;
END
$CP_RECEP001_SKU_GUARD$;
