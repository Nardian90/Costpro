-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-CAT-MAESTRO-002 — INICIALIZACIÓN DEL CATÁLOGO MAESTRO (FASE 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- OBJETIVO DE NEGOCIO: el catálogo maestro de la organización contiene una
-- copia fiel, literal y completa del catálogo real de una tienda, con
-- correspondencia individual 1:1 (un maestro por identidad de producto) y el
-- vínculo products.master_product_id apuntando al maestro correcto.
--
-- MECANISMO: RPC versionada `incorporate_store_products_to_master` — la
-- operación segura que faltaba (misión §3.2: «Si no existe una operación
-- segura para incorporar productos existentes al maestro y asociarlos con
-- sus registros locales, implementa el mecanismo versionado necesario, con
-- autorización, controles de tenant, idempotencia y auditoría»).
--
-- DISEÑO:
--   · Autorización: SOLO el gobernador del catálogo de la organización
--     (owner del tenant o catalog_governors) — misma regla que
--     connect_store_catalog. Vía service_role exige p_user_id (actor auditable).
--   · Fidelidad literal (misión §3.1): SKU, nombre, descripción, código de
--     barras y tipo, unidad de medida, indicador de servicio e imagen se
--     copian SIN traducciones, reformateos ni normalizaciones. La imagen se
--     copia por REFERENCIA (image_url → image_path): no se duplican objetos
--     del bucket ni se reemplazan archivos.
--   · Correspondencia 1:1 (misión §3.2): NO crea una segunda copia local;
--     SOLO fija products.master_product_id en la fila original. Ningún dato
--     comercial (precio, costo, existencias, categoría, proveedor…) se toca.
--   · Conciliación (misión §3.3): SKU duplicado en el maestro con identidad
--     COINCIDENTE → reutiliza el maestro (vincula). Identidad CONTRADICTORIA
--     (nombre o barcode distintos) → conflicto registrado, SIN fusión
--     silenciosa y SIN alta duplicada. Barcode colisionado globalmente con
--     otro maestro de SKU distinto → conflicto registrado. SKU/nombre con
--     espacios exteriores o vacíos → excepción registrada (sin reformatear).
--   · Idempotencia (misión §3.4): solo procesa filas con master_product_id
--     IS NULL; una segunda ejecución no crea maestros duplicados (0 altas).
--   · Modo dry-run: p_dry_run=true analiza y reporta sin escribir (manifiesto
--     previo a la carga).
--   · Aislamiento por fila: cada producto se procesa en una subtransacción
--     con EXCEPTION controlada; un conflicto NO aborta la carga completa y
--     queda documentado en el reporte (estado 'completed_with_exceptions').
--   · Auditoría: master_change_log (creación de identidad sku+name) y
--     audit_logs ('INCORPORATE_PRODUCT_TO_MASTER') por producto incorporado.
--   · Estado: products.is_active=true → master 'active'; false → 'archived'
--     (mapeo documentado; el modelo maestro solo admite active/archived).
--   · SIN conexión previa: la incorporación es la operación de INICIALIZACIÓN
--     del catálogo (misión FASE 1 → FASE 2 conexión); no exige
--     is_catalog_store_connected. Las altas POSTERIORES (create_master_product)
--     sí lo exigen, como ya está implementado.
--
-- SEPARACIÓN compartido/local (misión §8): el maestro recibe SOLO atributos
-- de identidad. Existencias, costos, precios, kardex, movimientos, imágenes
-- públicas derivadas (public_image_url) y atributos operativos permanecen
-- en la fila local. El modelo maestro no contempla category/supplier/
-- public_image_url: se conservan en el registro local (limitación documentada
-- en el expediente de la misión).
--
-- ACL: EXECUTE para authenticated y service_role; revocado a PUBLIC/anon
-- (patrón 20261028112200). RLS de products se salta vía SECURITY DEFINER
-- (owner postgres) — única ruta de escritura del vínculo, como las demás
-- RPC del catálogo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.incorporate_store_products_to_master(
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
  v_results jsonb := '[]'::jsonb;
  v_exceptions jsonb := '[]'::jsonb;
  v_created int := 0;
  v_linked int := 0;
  v_conflicts int := 0;
  v_skipped int := 0;
  v_would_create int := 0;
  v_would_link int := 0;
  v_total int := 0;
  v_master_id uuid;
  v_existing record;
  v_bc_conflict record;
  r record;
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  -- Autorización org-level: gobernador del catálogo (owner o designado)
  IF NOT public.is_catalog_governor(v_tenant, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el gobernador del catálogo incorpora productos al maestro';
  END IF;

  SELECT count(*) INTO v_total FROM public.products
   WHERE store_id = p_store_id AND master_product_id IS NULL;

  FOR r IN
    SELECT p.id, p.sku, p.name, p.description, p.barcode, p.barcode_type,
           p.unit_of_measure, p.is_service, p.is_active, p.image_url
      FROM public.products p
     WHERE p.store_id = p_store_id AND p.master_product_id IS NULL
     ORDER BY p.created_at ASC, p.id ASC
  LOOP
    BEGIN
      -- Validación literal (misión §3.1: sin reformateos; sin inventar datos)
      IF r.sku IS NULL OR btrim(r.sku) = '' THEN
        v_exceptions := v_exceptions || jsonb_build_object(
          'product_id', r.id, 'sku', r.sku, 'reason', 'ERR_PRODUCT_WITHOUT_SKU',
          'detail', 'SKU vacío o nulo: no puede representarse en el maestro');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      IF btrim(r.sku) <> r.sku THEN
        v_exceptions := v_exceptions || jsonb_build_object(
          'product_id', r.id, 'sku', r.sku, 'reason', 'ERR_SKU_WITH_SPACES',
          'detail', 'SKU con espacios exteriores: el CHECK del maestro (btrim(sku)=sku) lo rechaza; no se reformatea (fidelidad literal)');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      IF r.name IS NULL OR btrim(r.name) = '' THEN
        v_exceptions := v_exceptions || jsonb_build_object(
          'product_id', r.id, 'sku', r.sku, 'reason', 'ERR_PRODUCT_WITHOUT_NAME',
          'detail', 'nombre vacío o nulo: no puede representarse en el maestro');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Conciliación con maestros existentes del MISMO tenant (misión §3.3).
      -- REGLA DE IDENTIDAD (documentada): el nombre debe coincidir y el
      -- barcode solo es contradictorio si AMBOS son comerciales (≠ INTERNAL):
      -- products_barcode_unique es GLOBAL, por lo que dos tiendas NUNCA pueden
      -- sostener el mismo barcode local — los INTERNAL son artefactos de tienda
      -- (INT… generados por trg_ensure_product_barcode), no identidad global
      -- del producto; el canónico vive en el maestro y las demás filas
      -- vinculadas lo resuelven por el vínculo (20261028120000).
      SELECT id, name, barcode, barcode_type INTO v_existing
        FROM public.master_products
       WHERE tenant_id = v_tenant AND sku = r.sku
       LIMIT 1;

      IF v_existing.id IS NOT NULL THEN
        IF v_existing.name = r.name
           AND (r.barcode IS NULL OR btrim(r.barcode) = ''
                OR v_existing.barcode IS NULL OR btrim(v_existing.barcode) = ''
                OR v_existing.barcode = r.barcode
                OR COALESCE(r.barcode_type, '') = 'INTERNAL'
                OR COALESCE(v_existing.barcode_type, '') = 'INTERNAL') THEN
          -- Identidad coincidente → reutilizar maestro, vincular (sin alta)
          IF p_dry_run THEN
            v_would_link := v_would_link + 1;
            v_results := v_results || jsonb_build_object(
              'product_id', r.id, 'sku', r.sku, 'action', 'would_link_existing',
              'master_product_id', v_existing.id);
          ELSE
            UPDATE public.products SET master_product_id = v_existing.id
             WHERE id = r.id AND store_id = p_store_id;
            v_linked := v_linked + 1;
            v_results := v_results || jsonb_build_object(
              'product_id', r.id, 'sku', r.sku, 'action', 'linked_existing',
              'master_product_id', v_existing.id);
            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES ('INCORPORATE_PRODUCT_TO_MASTER', 'master_products', v_existing.id, p_store_id, v_caller_uid,
                    jsonb_build_object('mode', 'link_existing', 'sku', r.sku,
                                       'product_id', r.id, 'tenant_id', v_tenant));
          END IF;
        ELSE
          -- Atributos contradictorios → conflicto identificable, sin fusión
          v_conflicts := v_conflicts + 1;
          v_exceptions := v_exceptions || jsonb_build_object(
            'product_id', r.id, 'sku', r.sku, 'reason', 'ERR_IDENTITY_CONFLICT',
            'detail', jsonb_build_object(
              'master_id', v_existing.id,
              'master_name', v_existing.name, 'local_name', r.name,
              'master_barcode', v_existing.barcode, 'local_barcode', r.barcode,
              'master_barcode_type', v_existing.barcode_type, 'local_barcode_type', r.barcode_type));
        END IF;
        CONTINUE;
      END IF;

      -- Conciliación de barcode GLOBAL (master_products_barcode_unique):
      -- en este punto no existe maestro (tenant, sku); CUALQUIER maestro que
      -- ya use este barcode bloquearía el INSERT (índice único global parcial)
      SELECT id, tenant_id, sku INTO v_bc_conflict
        FROM public.master_products
       WHERE barcode = r.barcode
       LIMIT 1;
      IF v_bc_conflict.id IS NOT NULL THEN
        v_conflicts := v_conflicts + 1;
        v_exceptions := v_exceptions || jsonb_build_object(
          'product_id', r.id, 'sku', r.sku, 'reason', 'ERR_BARCODE_CONFLICT',
          'detail', jsonb_build_object('barcode', r.barcode,
            'existing_master_id', v_bc_conflict.id,
            'existing_master_sku', v_bc_conflict.sku,
            'existing_tenant', v_bc_conflict.tenant_id));
        CONTINUE;
      END IF;

      IF p_dry_run THEN
        v_would_create := v_would_create + 1;
        v_results := v_results || jsonb_build_object(
          'product_id', r.id, 'sku', r.sku, 'action', 'would_create_master');
        CONTINUE;
      END IF;

      -- Copia FIEL de la identidad (misión §3.1)
      INSERT INTO public.master_products
        (tenant_id, sku, name, description, image_path, barcode, barcode_type,
         unit_of_measure, is_service, status, created_by)
      VALUES
        (v_tenant, r.sku, r.name, r.description, r.image_url,
         CASE WHEN r.barcode IS NOT NULL AND btrim(r.barcode) = '' THEN NULL ELSE r.barcode END,
         r.barcode_type,
         r.unit_of_measure, r.is_service,
         CASE WHEN r.is_active THEN 'active' ELSE 'archived' END,
         v_caller_uid)
      RETURNING id INTO v_master_id;

      -- Vínculo 1:1 en la fila local ORIGINAL (sin segunda copia local)
      UPDATE public.products SET master_product_id = v_master_id
       WHERE id = r.id AND store_id = p_store_id;

      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object(
        'product_id', r.id, 'sku', r.sku, 'action', 'created_master',
        'master_product_id', v_master_id);

      -- Auditoría de identidad (mismo registro que create_master_product)
      INSERT INTO public.master_change_log
        (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
      VALUES
        (v_master_id, v_tenant, 'sku', NULL, r.sku, v_caller_uid, p_store_id),
        (v_master_id, v_tenant, 'name', NULL, r.name, v_caller_uid, p_store_id);

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES ('INCORPORATE_PRODUCT_TO_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
              jsonb_build_object('mode', 'create', 'sku', r.sku, 'product_id', r.id,
                                 'tenant_id', v_tenant,
                                 'fidelity_fields', '["sku","name","description","barcode","barcode_type","unit_of_measure","is_service","status","image_path"]'));

    EXCEPTION WHEN OTHERS THEN
      -- Aislamiento por fila: el fallo de UN producto no aborta la carga
      v_exceptions := v_exceptions || jsonb_build_object(
        'product_id', r.id, 'sku', r.sku, 'reason', 'ERR_ROW_PROCESSING',
        'detail', substr(SQLERRM, 1, 500));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_conflicts + v_skipped > 0 THEN 'completed_with_exceptions' ELSE 'success' END,
    'dry_run', p_dry_run,
    'store_id', p_store_id,
    'tenant_id', v_tenant,
    'total_candidates', v_total,
    'created', v_created,
    'linked_existing', v_linked,
    'conflicts', v_conflicts,
    'skipped', v_skipped,
    'would_create', v_would_create,
    'would_link', v_would_link,
    'results', v_results,
    'exceptions', v_exceptions,
    'audit_actor', v_caller_uid
  );
END;
$function$;

-- ─── ACL: misma política que las RPC del catálogo (20261028112200) ──────────
REVOKE EXECUTE ON FUNCTION public.incorporate_store_products_to_master(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incorporate_store_products_to_master(uuid, boolean, uuid) TO authenticated, service_role;

-- ─── Guard fail-closed post-migración ───────────────────────────────────────
DO $CP_CAT_M002_BF_GUARD$
DECLARE
  v_sig text;
  v_owner text;
  v_grants text;
  v_secdef boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef, pg_get_userbyid(p.proowner)
    INTO v_sig, v_secdef, v_owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'incorporate_store_products_to_master';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: la RPC incorporate_store_products_to_master no existe';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: la RPC debe ser SECURITY DEFINER';
  END IF;
  IF v_sig NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: search_path no fijado';
  END IF;
  IF v_sig NOT LIKE '%is_catalog_governor(v_tenant, v_caller_uid)%' THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: autorización de gobernador ausente';
  END IF;
  IF v_sig NOT LIKE '%master_product_id = v_master_id%' OR v_sig NOT LIKE '%master_product_id = v_existing.id%' THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: el vínculo 1:1 (UPDATE products.master_product_id) ausente';
  END IF;
  IF v_sig NOT LIKE '%master_change_log%' OR v_sig NOT LIKE '%audit_logs%' THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: auditoría ausente';
  END IF;
  IF v_sig LIKE '%price%' OR v_sig LIKE '%cost_price%' OR v_sig LIKE '%stock_current%' THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: la RPC no debe tocar datos comerciales (precio/costo/existencias)';
  END IF;

  SELECT COALESCE(string_agg(rp.grantee, ','), '') INTO v_grants
    FROM information_schema.routine_privileges rp
   WHERE rp.routine_schema = 'public'
     AND rp.routine_name = 'incorporate_store_products_to_master';
  IF v_grants NOT LIKE '%authenticated%' OR v_grants NOT LIKE '%service_role%' THEN
    RAISE EXCEPTION 'CP-CAT-M002-BF-GUARD: grants incompletos (%)', v_grants;
  END IF;

  RAISE NOTICE 'CP-CAT-M002-BF-GUARD OK: RPC de incorporación presente, SECURITY DEFINER, governor-guard, vínculo 1:1, auditoría, ACL authenticated+service_role';
END
$CP_CAT_M002_BF_GUARD$;
