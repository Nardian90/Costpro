-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO (2026-11-11)
-- Guardas de integridad de SKU ante movimientos históricos (regla del
-- propietario: un SKU no se modifica cuando el producto tiene movimientos).
-- ═══════════════════════════════════════════════════════════════════════════
-- CRITERIO (brief §4): la decisión se basa en la EXISTENCIA REAL DE
--   MOVIMIENTOS asociados al producto (transaction_items / stock_movements /
--   receipt_items), no en la antigüedad del registro ni en su estado de
--   activación.
-- ALCANCE:
--   1) fn_master_apply_identity_changes: si un cambio de identidad incluye
--      'sku' con un valor DISTINTO del vigente y ALGUNA fila local vinculada
--      al maestro tiene movimientos → ERR_SKU_LOCKED_BY_MOVEMENTS (fail-closed
--      en el punto único por el que pasan update_master_product Y las
--      propuestas aprobadas por review_master_proposal — no hay ruta que
--      esquive la regla). Además, colisión del SKU nuevo con filas LOCALES
--      no vinculadas de las tiendas afectadas → ERR_MASTER_SKU_CONFLICT
--      (error controlado en lugar del 23505 crudo de products_store_sku_unique
--      durante la propagación).
--   2) trg_products_sku_movement_guard: UPDATE directo de products.sku en
--      filas SIN maestro (altas locales puras — vía PostgREST/useUpdateProduct)
--      bloqueado cuando la fila tiene movimientos. Las filas VINCULADAS no se
--      tocan aquí: su SKU lo gobierna el maestro y la guardra (1) ya cubre la
--      propagación (la coerción del trg_products_master_identity_guard hace
--      el resto). No se reconstruye ningún documento histórico.
--   3) Verificación fail-closed post-migración (patrón del repo).
-- PRESERVACIÓN: no se reescriben movimientos, documentos, inventarios ni
--   ventas; no cambian precios/costos/existencias; unicidades vigentes
--   intactas (products_store_sku_unique, master_products_tenant_sku_unique).
-- IDEMPOTENCIA: CREATE OR REPLACE + DROP TRIGGER IF EXISTS (re-ejecutable sin
--   daño); guardas repetibles.
-- REVERSIBILIDAD: re-aplicar la definición de 20261030120000 (fn_master_apply)
--   y DROP TRIGGER trg_products_sku_movement_guard restaura el estado previo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) fn_master_apply_identity_changes — versión vigente (20261030120000) +
--    guardas de SKU por movimientos y colisión local
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_master_apply_identity_changes(
  p_master_id uuid,
  p_changes jsonb,
  p_actor uuid,
  p_origin_store_id uuid DEFAULT NULL,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_master record;
  v_allowed text[] := ARRAY['sku','name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'];
  v_key text;
  v_old text;
  v_new text;
  v_new_sku text;
  v_new_barcode text;
  v_changes_applied jsonb := '[]'::jsonb;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: se requiere un objeto de cambios no vacío';
  END IF;

  SELECT * INTO v_master FROM public.master_products WHERE id = p_master_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ERR_INVALID_CHANGES: campo % no es identidad compartida editable', v_key;
    END IF;
  END LOOP;

  -- Validaciones de unicidad sobre los valores NUEVOS
  v_new_sku := NULLIF(btrim(COALESCE(p_changes->>'sku', '')), '');
  IF v_new_sku IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.master_products
                WHERE tenant_id = v_master.tenant_id AND sku = v_new_sku AND id <> p_master_id) THEN
      RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', v_new_sku;
    END IF;
  END IF;

  v_new_barcode := NULLIF(btrim(COALESCE(p_changes->>'barcode', '')), '');
  IF v_new_barcode IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.master_products
                WHERE barcode = v_new_barcode AND id <> p_master_id) THEN
      RAISE EXCEPTION 'ERR_BARCODE_EXISTS: %', v_new_barcode;
    END IF;
  END IF;

  IF p_changes->>'name' IS NOT NULL AND btrim(p_changes->>'name') = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: el nombre no puede quedar vacío';
  END IF;

  -- GESTIÓN-MAESTRO (2026-11-11, brief §4): el SKU de un producto con
  -- movimientos históricos NO se modifica. El SKU del maestro se propaga a
  -- TODAS las filas locales vinculadas, por lo que la regla se evalúa sobre
  -- la existencia REAL de movimientos en cualquiera de esas filas (columna
  -- materializada has_movements + comprobación directa de las tres tablas
  -- de movimientos — defensa en profundidad contra desincronización de la
  -- columna). Un cambio idéntico al SKU vigente (no-cambio) no se bloquea.
  IF v_new_sku IS NOT NULL AND v_new_sku <> v_master.sku THEN
    IF EXISTS (
      SELECT 1
        FROM public.products pr
       WHERE pr.master_product_id = p_master_id
         AND (
           COALESCE(pr.has_movements, false)
           OR EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pr.id)
           OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pr.id)
           OR EXISTS (SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = pr.id)
         )
    ) THEN
      RAISE EXCEPTION 'ERR_SKU_LOCKED_BY_MOVEMENTS: el producto maestro % tiene movimientos históricos en al menos una tienda vinculada; el SKU no puede modificarse', v_master.sku;
    END IF;

    -- La propagación reescribiría el SKU de las filas vinculadas: un SKU
    -- local no-vinculado en alguna de esas tiendas colisionaría con
    -- products_store_sku_unique. Se detecta ANTES para devolver un error
    -- controlado (la transacción ya era atómica; esto solo traduce el 23505).
    IF EXISTS (
      SELECT 1
        FROM public.products pr2
       WHERE pr2.master_product_id IS NULL
         AND pr2.sku = v_new_sku
         AND pr2.store_id IN (SELECT store_id FROM public.products WHERE master_product_id = p_master_id)
    ) THEN
      RAISE EXCEPTION 'ERR_MASTER_SKU_CONFLICT: el SKU % ya existe como producto local sin vínculo en una tienda afectada', v_new_sku;
    END IF;
  END IF;

  -- Aplicar campo a campo con registro de auditoría por campo.
  -- v_master es la instantánea previa (bajo lock FOR UPDATE): los old_value
  -- reflejan el estado original aunque se cambien varios campos a la vez.
  FOR v_key, v_new IN
    SELECT k, p_changes ->> k FROM jsonb_each(p_changes) AS t(k, v)
  LOOP
    v_old := to_jsonb(v_master) ->> v_key;

    EXECUTE format('UPDATE public.master_products SET %I = %L, updated_at = now() WHERE id = %L',
                   v_key, v_new, p_master_id);

    INSERT INTO public.master_change_log
      (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id, proposal_id)
    VALUES
      (p_master_id, v_master.tenant_id, v_key, v_old, v_new, p_actor, p_origin_store_id, p_proposal_id);

    v_changes_applied := v_changes_applied || jsonb_build_object('field', v_key, 'old', v_old, 'new', v_new);
  END LOOP;

  -- Propagación de coherencia de identidad (SKU y nombre) a las filas locales
  -- vinculadas de TODAS las tiendas conectadas. El trigger de identidad
  -- re-coerciona contra el maestro; datos comerciales intactos.
  IF v_new_sku IS NOT NULL OR p_changes->>'name' IS NOT NULL THEN
    UPDATE public.products pr
       SET sku = m.sku,
           name = m.name,
           updated_at = now()
      FROM public.master_products m
     WHERE m.id = pr.master_product_id
       AND pr.master_product_id = p_master_id;
  END IF;

  -- CP-CAT-MAESTRO-002 (F2): propagación de la imagen compartida. Cuando el
  -- cambio de identidad incluye image_path, las filas locales vinculadas
  -- adoptan la referencia vigente del maestro (compartición por referencia;
  -- el objeto del bucket es el mismo y no se duplica). Solo se toca
  -- image_url/updated_at: precio, costo y existencias locales intactos.
  IF p_changes->>'image_path' IS NOT NULL THEN
    UPDATE public.products pr
       SET image_url = m.image_path,
           updated_at = now()
      FROM public.master_products m
     WHERE m.id = pr.master_product_id
       AND pr.master_product_id = p_master_id
       AND m.image_path IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'master_product_id', p_master_id,
    'changes_applied', v_changes_applied
  );
END;
$function$;

-- ACL: paridad con la superficie certificada (20261030120000): el helper
-- interno solo lo invocan las RPC gobernadas como owner; EXECUTE para
-- service_role por convención del repo, revocado para el resto.
REVOKE EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Guardra de SKU para filas locales SIN maestro (PostgREST directo)
--    Un SKU no se modifica cuando el producto tiene movimientos (brief §4).
--    Las filas vinculadas al maestro quedan fuera: su SKU proviene siempre
--    del maestro (trg_products_master_identity_guard) y la regla se aplica
--    en fn_master_apply_identity_changes (punto único de la escritura).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_products_sku_movement_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Filas gestionadas por el catálogo maestro: SKU gobernado arriba.
  IF NEW.master_product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sin cambio real de SKU → coste cero.
  IF NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;

  -- Cambio real de SKU en fila local sin maestro: bloqueado si hay
  -- movimientos (columna materializada + verificación directa).
  IF COALESCE(OLD.has_movements, false)
     OR EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = OLD.id) THEN
    RAISE EXCEPTION 'ERR_SKU_LOCKED_BY_MOVEMENTS: el producto % tiene movimientos históricos; el SKU no puede modificarse', OLD.sku;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_sku_movement_guard ON public.products;
CREATE TRIGGER trg_products_sku_movement_guard
  BEFORE UPDATE OF sku ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_sku_movement_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Verificación post-migración fail-closed (patrón del repo)
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_MASTER_GESTION_GUARD$
DECLARE
  v_fn text;
  v_secdef boolean;
  v_trg integer;
  v_trg_secdef boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef INTO v_fn, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_master_apply_identity_changes';

  IF v_fn IS NULL OR NOT v_secdef THEN
    RAISE EXCEPTION 'CP-MASTER-GESTION-GUARD: fn_master_apply_identity_changes ausente o sin SECURITY DEFINER';
  END IF;
  IF v_fn NOT LIKE '%ERR_SKU_LOCKED_BY_MOVEMENTS%' THEN
    RAISE EXCEPTION 'CP-MASTER-GESTION-GUARD: falta la guardra de SKU por movimientos en el maestro';
  END IF;
  IF v_fn NOT LIKE '%ERR_MASTER_SKU_CONFLICT%' THEN
    RAISE EXCEPTION 'CP-MASTER-GESTION-GUARD: falta la guardra de colisión de SKU con filas locales';
  END IF;
  IF v_fn NOT LIKE '%image_path%' THEN
    RAISE EXCEPTION 'CP-MASTER-GESTION-GUARD: la propagación de imagen compartida debe conservarse';
  END IF;
  IF v_fn ILIKE '%price%' OR v_fn ILIKE '%cost_price%' OR v_fn ILIKE '%stock_current%' THEN
    RAISE EXCEPTION 'CP-MASTER-GESTION-GUARD: la RPC no debe tocar datos comerciales (precio/costo/existencias)';
  END IF;

  SELECT count(*), COALESCE(bool_or(p.prosecdef), false) INTO v_trg, v_trg_secdef
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND t.tgname = 'trg_products_sku_movement_guard'
     AND NOT t.tgisinternal;

  IF v_trg <> 1 OR NOT v_trg_secdef THEN
    RAISE EXCEPTION 'CP-MASTER-GESTION-GUARD: el trigger trg_products_sku_movement_guard debe existir (y su función ser SECURITY DEFINER)';
  END IF;

  RAISE NOTICE 'CP-MASTER-GESTION-GUARD OK: guardas de SKU por movimientos activas (maestro + local sin vínculo), propagación de imagen intacta';
END
$CP_MASTER_GESTION_GUARD$;
