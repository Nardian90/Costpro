-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO ↔ ENERVIDA (2026-11-08) — RECONCILIACIÓN DE DATOS
-- COMPARTIDOS CON LA TIENDA COMO REFERENCIA (complemento de CP-CAT-MAESTRO-003)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO: 20261107120000 cerró la causa raíz de las Recepciones (sincronía
--   transaccional del maestro) y la reconciliación de altas/vínculos se
--   ejecutó con incorporate_store_products_to_master (198 eventos auditados).
--   Quedaba sin mecanismo propio la categoría de la misión §3.3: «Productos
--   vinculados cuyo nombre, SKU o imagen compartida presenta diferencias» —
--   es decir, filas YA vinculadas cuyo dato compartido quedó desfasado
--   respecto del catálogo local de la tienda de referencia (Enervida).
--
-- ESTA RPC: reconcile_store_catalog_shared_data(p_store_id, p_dry_run, p_user_id)
--   · Autorización: SOLO el gobernador del catálogo (is_catalog_governor) —
--     misma regla que incorporate_store_products_to_master.
--   · REFERENCIA = catálogo local de la tienda indicada (misión §3.3): si el
--     nombre difiere, el maestro adopta el vigente en la tienda; si la imagen
--     local difiere (o el maestro no tiene), el maestro adopta la de la
--     tienda. Si la tienda no tiene imagen y el maestro sí, se sincroniza SOLO
--     la fila local (NULL local no es referencia que deba borrar datos).
--   · Reutiliza fn_master_apply_identity_changes (20261028112100+20261030120000):
--     auditoría por campo en master_change_log (old/new) + propagación
--     diseñada a TODAS las filas vinculadas (nombre y imagen compartida por
--     referencia). Jamás toca precio, costo, existencias ni datos comerciales.
--   · SKU vinculado ≠ SKU del maestro → conflicto documentado (sin fusión;
--     misión §3.5). Un conflicto NO aborta la operación (aislamiento por fila).
--   · NO elimina maestros sin correspondencia (solo los reporta) y NO toca
--     filas sin vínculo (mecanismo existente: incorporate_...).
--   · Dry-run (p_dry_run=true) para la vista previa obligatoria antes de
--     aplicar. Idempotente: una segunda pasada no produce cambios.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_store_catalog_shared_data(
  p_store_id uuid,
  p_dry_run boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
  r record;
  v_changes jsonb;
  v_result jsonb;
  v_updated_identity int := 0;
  v_updated_image int := 0;
  v_local_image_synced int := 0;
  v_conflicts int := 0;
  v_checked int := 0;
  v_unlinked int := 0;
  v_exceptions jsonb := '[]'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_unlinked_skus jsonb := '[]'::jsonb;
  v_orphans int := 0;
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  -- Autorización org-level: SOLO el gobernador del catálogo reconcilia
  -- (misión §3.6: toda modificación por los mecanismos autorizados).
  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador del catálogo reconcilia los datos compartidos';
  END IF;

  -- Filas de la tienda SIN vínculo: no son de esta RPC (mecanismo: incorporate).
  SELECT count(*), COALESCE(jsonb_agg(DISTINCT p.sku), '[]'::jsonb)
    INTO v_unlinked, v_unlinked_skus
    FROM public.products p
   WHERE p.store_id = p_store_id AND p.master_product_id IS NULL;

  -- Maestros de la organización sin correspondencia en esta tienda
  -- (informativo; NUNCA se eliminan — misión §3.5).
  SELECT count(*) INTO v_orphans
    FROM public.master_products m
   WHERE m.tenant_id = v_tenant
     AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.master_product_id = m.id AND p.store_id = p_store_id);

  FOR r IN
    SELECT p.id AS local_id, p.sku AS local_sku, p.name AS local_name,
           p.image_url AS local_image, p.master_product_id,
           m.sku AS master_sku, m.name AS master_name, m.image_path AS master_image
      FROM public.products p
      JOIN public.master_products m ON m.id = p.master_product_id
     WHERE p.store_id = p_store_id
     ORDER BY p.created_at ASC, p.id ASC
  LOOP
    v_checked := v_checked + 1;

    BEGIN
      -- Anomalía: SKU local ≠ SKU del maestro (el trigger de identidad lo
      -- hace prácticamente imposible; si ocurre, conflicto documentado, sin
      -- fusión automática — misión §3.5).
      IF r.local_sku <> r.master_sku THEN
        v_conflicts := v_conflicts + 1;
        v_exceptions := v_exceptions || jsonb_build_object(
          'product_id', r.local_id, 'sku', r.local_sku,
          'reason', 'ERR_SKU_MISMATCH_LINKED',
          'detail', jsonb_build_object('master_id', r.master_product_id, 'master_sku', r.master_sku));
        CONTINUE;
      END IF;

      v_changes := '{}'::jsonb;
      -- REFERENCIA = catálogo local de la tienda (misión §3.3): si el nombre
      -- difiere, el maestro adopta el vigente en la tienda. fn_master_apply_
      -- identity_changes audita old/new y propaga a TODAS las filas
      -- vinculadas de la organización (coherencia de identidad diseñada).
      IF COALESCE(r.local_name, '') <> '' AND r.local_name <> r.master_name THEN
        v_changes := jsonb_set(v_changes, '{name}', to_jsonb(r.local_name));
      END IF;
      -- Imagen compartida por referencia: si la tienda tiene imagen y el
      -- maestro otra (o ninguna), el maestro la adopta. Si la tienda no
      -- tiene y el maestro sí, se sincroniza SOLO la fila local (la imagen
      -- del maestro es más rica; NULL local no es "referencia" que deba
      -- borrar datos del maestro).
      IF r.local_image IS NOT NULL AND btrim(r.local_image) <> ''
         AND COALESCE(r.master_image, '') <> r.local_image THEN
        v_changes := jsonb_set(v_changes, '{image_path}', to_jsonb(r.local_image));
      END IF;

      IF v_changes <> '{}'::jsonb THEN
        IF p_dry_run THEN
          v_results := v_results || jsonb_build_object(
            'product_id', r.local_id, 'sku', r.local_sku, 'action', 'would_update_master',
            'changes', v_changes, 'master_product_id', r.master_product_id);
        ELSE
          v_result := public.fn_master_apply_identity_changes(
            r.master_product_id, v_changes, v_caller_uid, p_store_id, NULL);
          v_results := v_results || jsonb_build_object(
            'product_id', r.local_id, 'sku', r.local_sku, 'action', 'updated_master',
            'applied', v_result->'changes_applied', 'master_product_id', r.master_product_id);
          IF v_changes ? 'name' THEN v_updated_identity := v_updated_identity + 1; END IF;
          IF v_changes ? 'image_path' THEN v_updated_image := v_updated_image + 1; END IF;
        END IF;
      ELSIF (r.local_image IS NULL OR btrim(COALESCE(r.local_image, '')) = '')
            AND COALESCE(r.master_image, '') <> '' THEN
        -- Sincronización inversa de la fila local (única fila tocada: la de
        -- ESTA tienda; datos comerciales intactos).
        IF NOT p_dry_run THEN
          UPDATE public.products
             SET image_url = r.master_image, updated_at = now()
           WHERE id = r.local_id AND store_id = p_store_id;
          v_local_image_synced := v_local_image_synced + 1;
        END IF;
        v_results := v_results || jsonb_build_object(
          'product_id', r.local_id, 'sku', r.local_sku, 'action', 'local_image_synced',
          'image', r.master_image);
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Aislamiento por fila: un conflicto no aborta la reconciliación.
      v_conflicts := v_conflicts + 1;
      v_exceptions := v_exceptions || jsonb_build_object(
        'product_id', r.local_id, 'sku', r.local_sku,
        'reason', 'ERR_ROW_PROCESSING', 'detail', substr(SQLERRM, 1, 500));
    END;
  END LOOP;

  IF NOT p_dry_run AND (v_updated_identity + v_updated_image + v_local_image_synced) > 0 THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('RECONCILE_SHARED_DATA_FROM_STORE', 'master_products', p_store_id, p_store_id, v_caller_uid,
            jsonb_build_object('tenant_id', v_tenant, 'dry_run', false,
              'identity_updated', v_updated_identity, 'image_updated', v_updated_image,
              'local_image_synced', v_local_image_synced, 'conflicts', v_conflicts,
              'checked', v_checked));
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_conflicts > 0 THEN 'completed_with_exceptions' ELSE 'success' END,
    'dry_run', p_dry_run,
    'store_id', p_store_id,
    'tenant_id', v_tenant,
    'linked_rows_checked', v_checked,
    'identity_updated', v_updated_identity,
    'image_updated', v_updated_image,
    'local_image_synced', v_local_image_synced,
    'unlinked_rows', v_unlinked,
    'unlinked_skus', v_unlinked_skus,
    'masters_without_local_correspondence', v_orphans,
    'conflicts', v_conflicts,
    'results', v_results,
    'exceptions', v_exceptions,
    'note', CASE WHEN v_unlinked > 0
      THEN 'Filas sin vínculo detectadas: ejecutar incorporate_store_products_to_master para altas/vínculos.'
      ELSE 'Sin filas sin vínculo.' END,
    'audit_actor', v_caller_uid
  );
END;
$function$;

-- ─── ACL: misma política que las RPC del catálogo (20261028112200) ──────────
REVOKE EXECUTE ON FUNCTION public.reconcile_store_catalog_shared_data(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_store_catalog_shared_data(uuid, boolean, uuid) TO authenticated, service_role;

-- ─── Guard fail-closed post-migración ───────────────────────────────────────
DO $CP_CAT_RECONCILE_GUARD$
DECLARE
  v_sig text;
  v_secdef boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef INTO v_sig, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reconcile_store_catalog_shared_data';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: la RPC reconcile_store_catalog_shared_data no existe';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: la RPC debe ser SECURITY DEFINER';
  END IF;
  IF v_sig NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: search_path no fijado';
  END IF;
  IF v_sig NOT LIKE '%is_catalog_governor(v_tenant, v_caller_uid)%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: autorización de gobernador ausente';
  END IF;
  IF v_sig NOT LIKE '%p_dry_run%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: modo dry-run ausente';
  END IF;
  IF v_sig NOT LIKE '%fn_master_apply_identity_changes%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: debe reutilizar el mecanismo gobernado de identidad';
  END IF;
  IF v_sig NOT LIKE '%master_change_log%' AND v_sig NOT LIKE '%RECONCILE_SHARED_DATA_FROM_STORE%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: auditoría ausente';
  END IF;
  IF v_sig ILIKE '%price%' OR v_sig ILIKE '%cost_price%' OR v_sig ILIKE '%stock_current%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: la RPC no debe tocar datos comerciales (precio/costo/existencias)';
  END IF;

  SELECT COALESCE(string_agg(rp.grantee, ','), '') INTO v_sig
    FROM information_schema.routine_privileges rp
   WHERE rp.routine_schema = 'public'
     AND rp.routine_name = 'reconcile_store_catalog_shared_data';
  IF v_sig NOT LIKE '%authenticated%' OR v_sig NOT LIKE '%service_role%' THEN
    RAISE EXCEPTION 'CP-CAT-RECONCILE-GUARD: grants incompletos (%)', v_sig;
  END IF;

  RAISE NOTICE 'CP-CAT-RECONCILE-GUARD OK: RPC de reconciliación de datos compartidos presente, SECURITY DEFINER, gobernador, dry-run, sin datos comerciales, ACL authenticated+service_role';
END
$CP_CAT_RECONCILE_GUARD$;
