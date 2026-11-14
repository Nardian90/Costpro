-- ═══════════════════════════════════════════════════════════════════════════
-- CP-CAT-IMPORT-001 (2026-11-13) — El importador masivo integra el Catálogo
-- Maestro: RPC managed_bulk_import_products.
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (verificada en BD viva): POST /api/catalog/bulk-import hacía
--   UPSERT directo en products y solo REUTILIZABA un maestro ya existente
--   (master-stamp best-effort); jamás creaba master_products para SKU nuevos.
--   En una tienda conectada al catálogo, cada SKU nuevo importado quedaba
--   como fila local huérfana (master_product_id NULL), invisible para las
--   demás tiendas (caso SKU 197 de ENERVIDA-VITALLCONS).
--
-- DISEÑO (respeta la arquitectura vigente, sin ampliar campos compartidos):
--   · Escritura del maestro SOLO vía función SECURITY DEFINER (RLS de
--     master_products no permite escritura directa; mismo patrón que
--     create_master_product / incorporate_store_products_to_master).
--   · El maestro porta SOLO identidad compartida: sku, name, description,
--     image_path, barcode/barcode_type, unit_of_measure, is_service.
--     NUNCA price, cost, min_stock, stock, category, supplier ni
--     operational_class (datos comerciales propios de cada tienda, viven en
--     products; el maestro no los contempla por diseño 20261028110000).
--   · Tienda NO conectada: comportamiento idéntico al upsert histórico
--     (fila local sin maestro), sin romper tiendas fuera del catálogo.
--   · Tienda conectada: garantiza maestro por (tenant, sku) → reutiliza el
--     existente o lo crea (con carrera de unicidad traducida), estampa
--     master_product_id en la fila local y el trigger trg_products_master_
--     identity_guard coerciona sku/name al maestro. En tienda conectada NO se
--     importa una fila que no pueda quedar vinculada (cero huérfanos).
--   · Aislamiento POR FILA (patrón incorporate_store_products_to_master): el
--     fallo de una fila no aborta el lote; se reporta con causa clara.
--   · Transaccional por fila: maestro + fila local + auditoría se aplican o
--     se revierten JUNTOS (compensación del maestro si el upsert local
--     falla → cero maestros huérfanos).
--   · Idempotente: reimportar el mismo archivo no duplica (upsert por
--     unique products_sku_store_unique + maestro por tenant_sku).
--   · Conserva datos locales en re-import: NO toca stock_current,
--     cost_average, has_movements, status ni image_url en el UPDATE
--     (image_url solo se define en el alta; la imagen compartida del maestro
--     se resuelve por lectura, 20261030120000).
--   · Anti-spoofing v2.12.9 (mismo guard que has_store_access_as consume) y
--     autorización idéntica a create_master_product: acceso a la tienda
--     (has_store_access_as) + permiso de alta de productos
--     (admin global o rol admin/manager/encargado de la tienda).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.managed_bulk_import_products(
  p_store_id uuid,
  p_rows jsonb,
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
  v_connected boolean := false;
  v_row jsonb;
  v_idx int := 0;
  v_sku text;
  v_name text;
  v_raw_sku text;
  v_master_id uuid;
  v_product_id uuid;
  v_was_inserted boolean;
  v_action text;
  v_master_created_this_row boolean := false;
  v_created int := 0;
  v_updated int := 0;
  v_masters_created int := 0;
  v_masters_reused int := 0;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_price numeric;
  v_cost numeric;
  v_min_stock numeric;
  v_currency text;
  v_barcode text;
  v_barcode_type text;
  v_uom text;
  v_oc text;
  v_row_is_active boolean;
  v_is_service boolean;
  v_constraint text;
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

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.is_admin_check(v_caller_uid)
     AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de alta de productos en la tienda';
  END IF;

  v_connected := public.is_catalog_store_connected(v_tenant, p_store_id);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    v_master_id := NULL;
    v_master_created_this_row := false;
    v_product_id := NULL;
    v_was_inserted := false;
    BEGIN
      -- ── Validación literal de la fila (fidelidad; sin reformateos) ──
      v_raw_sku := v_row->>'sku';
      v_sku := NULLIF(btrim(COALESCE(v_raw_sku, '')), '');
      v_name := NULLIF(btrim(COALESCE(v_row->>'name', '')), '');

      IF v_sku IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_raw_sku, 'reason', 'ERR_PRODUCT_WITHOUT_SKU',
          'detail', 'SKU vacío o nulo: la fila no se importa');
        CONTINUE;
      END IF;
      IF v_raw_sku <> btrim(v_raw_sku) THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_raw_sku, 'reason', 'ERR_SKU_WITH_SPACES',
          'detail', 'SKU con espacios al inicio o al final: no se reformatea (fidelidad literal)');
        CONTINUE;
      END IF;
      IF length(v_sku) > 100 THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_SKU_TOO_LONG',
          'detail', 'SKU supera 100 caracteres');
        CONTINUE;
      END IF;
      IF v_name IS NULL THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_PRODUCT_WITHOUT_NAME',
          'detail', 'Nombre vacío o nulo: la fila no se importa');
        CONTINUE;
      END IF;
      IF length(v_name) > 200 THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_NAME_TOO_LONG',
          'detail', 'El nombre supera 200 caracteres');
        CONTINUE;
      END IF;

      -- ── Datos comerciales de la tienda (validación como create_master_product) ──
      v_price := COALESCE(NULLIF(v_row->>'price', '')::numeric, 0);
      v_cost := COALESCE(NULLIF(v_row->>'cost_price', '')::numeric, 0);
      v_min_stock := COALESCE(NULLIF(v_row->>'min_stock', '')::numeric, 1);
      v_currency := COALESCE(NULLIF(btrim(COALESCE(v_row->>'price_currency', '')), ''), 'CUP');
      v_barcode := NULLIF(btrim(COALESCE(v_row->>'barcode', '')), '');
      v_barcode_type := NULLIF(btrim(COALESCE(v_row->>'barcode_type', '')), '');
      v_uom := NULLIF(btrim(COALESCE(v_row->>'unit_of_measure', '')), '');
      v_oc := NULLIF(btrim(COALESCE(v_row->>'operational_class', '')), '');
      v_is_service := COALESCE((v_row->>'is_service')::boolean, false);
      v_row_is_active := COALESCE((v_row->>'is_active')::boolean, true);

      IF v_price < 0 OR v_cost < 0 OR v_min_stock < 1 THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_INVALID_PAYLOAD',
          'detail', 'precio/costo no pueden ser negativos ni min_stock menor que 1');
        CONTINUE;
      END IF;
      IF v_currency NOT IN ('CUP','USD','EUR','MLC') THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_INVALID_CURRENCY',
          'detail', 'moneda no soportada: ' || v_currency || ' (válidas: CUP, USD, EUR, MLC)');
        CONTINUE;
      END IF;
      IF v_oc IS NOT NULL AND v_oc NOT IN ('venta','insumo','activo_fijo','util_herramienta') THEN
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_INVALID_OPERATIONAL_CLASS',
          'detail', 'clasificación operativa no válida: ' || v_oc
            || ' (válidas: venta, insumo, activo_fijo, util_herramienta)');
        CONTINUE;
      END IF;

      -- ── Identidad compartida: garantizar el maestro por (tenant, sku) ──
      IF v_connected THEN
        SELECT id INTO v_master_id FROM public.master_products
         WHERE tenant_id = v_tenant AND sku = v_sku;
      END IF;

      IF v_connected AND v_master_id IS NULL THEN
        -- Sin maestro: crearlo (identidad compartida; sin datos comerciales).
        -- El conflicto global de barcode se reporta SIN importar la fila
        -- (en tienda conectada no se aceptan huérfanos).
        IF v_barcode IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.master_products WHERE barcode = v_barcode
        ) THEN
          v_errors := v_errors || jsonb_build_object(
            'row', v_idx, 'sku', v_sku, 'reason', 'ERR_BARCODE_EXISTS',
            'detail', jsonb_build_object(
              'barcode', v_barcode,
              'message', 'el código de barras ya pertenece a otro producto del catálogo (global)'));
          CONTINUE;
        END IF;

        INSERT INTO public.master_products
          (tenant_id, sku, name, description, image_path, barcode, barcode_type,
           unit_of_measure, is_service, status, created_by)
        VALUES
          (v_tenant, v_sku, v_name, v_row->>'description', NULL, v_barcode,
           COALESCE(v_barcode_type, CASE WHEN v_barcode IS NULL THEN NULL ELSE 'EAN13' END),
           COALESCE(v_uom, 'unidad'),
           v_is_service, 'active', v_caller_uid)
        RETURNING id INTO v_master_id;

        v_master_created_this_row := true;
        v_masters_created := v_masters_created + 1;

        -- Auditoría de identidad (mismo registro que create_master_product)
        INSERT INTO public.master_change_log
          (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
        VALUES
          (v_master_id, v_tenant, 'sku', NULL, v_sku, v_caller_uid, p_store_id),
          (v_master_id, v_tenant, 'name', NULL, v_name, v_caller_uid, p_store_id);
      ELSIF v_connected THEN
        v_masters_reused := v_masters_reused + 1;
      END IF;

      -- ── Fila local de la tienda (alta o refresco idempotente) ──
      INSERT INTO public.products
        (store_id, tenant_id, master_product_id, sku, name, description, image_url,
         unit_of_measure, is_service, price, price_currency, cost_price, min_stock,
         stock_current, is_active, is_complete, category, supplier,
         barcode, barcode_type, operational_class)
      VALUES
        (p_store_id, v_tenant, v_master_id, v_sku, v_name, v_row->>'description',
         v_row->>'image_url',
         COALESCE(v_uom, 'unidad'),
         v_is_service, v_price, v_currency, v_cost, v_min_stock,
         0, v_row_is_active, true,
         NULLIF(btrim(COALESCE(v_row->>'category', '')), ''),
         NULLIF(btrim(COALESCE(v_row->>'supplier', '')), ''),
         v_barcode, v_barcode_type,
         v_oc::product_operational_class)
      ON CONFLICT (sku, store_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        unit_of_measure = EXCLUDED.unit_of_measure,
        is_service = EXCLUDED.is_service,
        price = EXCLUDED.price,
        price_currency = EXCLUDED.price_currency,
        cost_price = EXCLUDED.cost_price,
        min_stock = EXCLUDED.min_stock,
        is_active = EXCLUDED.is_active,
        category = EXCLUDED.category,
        supplier = EXCLUDED.supplier,
        barcode = EXCLUDED.barcode,
        barcode_type = EXCLUDED.barcode_type,
        master_product_id = COALESCE(EXCLUDED.master_product_id, public.products.master_product_id),
        operational_class = COALESCE(EXCLUDED.operational_class, public.products.operational_class),
        updated_at = now()
      RETURNING id, (xmax = 0) INTO v_product_id, v_was_inserted;

      -- El trigger trg_products_master_identity_guard coerciona sku/name al
      -- maestro para filas vinculadas; los datos comerciales quedan intactos.
      IF v_was_inserted THEN
        v_created := v_created + 1;
        v_action := 'created';
      ELSE
        v_updated := v_updated + 1;
        v_action := 'updated';
      END IF;

      v_results := v_results || jsonb_build_object(
        'row', v_idx, 'sku', v_sku, 'action', v_action,
        'product_id', v_product_id,
        'master_product_id', v_master_id,
        'master_created', v_master_created_this_row);

      -- Auditoría por fila (acción de tienda: store_id satisface el check)
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES
        ('IMPORT_PRODUCT', 'products', v_product_id, p_store_id, v_caller_uid,
         jsonb_build_object('sku', v_sku, 'action', v_action,
                            'catalog_connected', v_connected,
                            'master_product_id', v_master_id,
                            'master_created', v_master_created_this_row));

    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
        -- Compensación transaccional: si el maestro de ESTA fila se creó y el
        -- upsert local falló, se elimina el maestro recién creado (y su log de
        -- identidad) para no dejar huérfanos.
        IF v_master_created_this_row AND v_master_id IS NOT NULL THEN
          DELETE FROM public.master_change_log WHERE master_product_id = v_master_id;
          DELETE FROM public.master_products WHERE id = v_master_id;
          v_master_created_this_row := false;
          v_masters_created := v_masters_created - 1;
        END IF;
        IF v_constraint = 'master_products_barcode_unique' THEN
          v_errors := v_errors || jsonb_build_object(
            'row', v_idx, 'sku', v_sku, 'reason', 'ERR_BARCODE_EXISTS',
            'detail', 'el código de barras ya pertenece a otro producto del catálogo (global)');
        ELSIF v_constraint = 'master_products_tenant_sku_unique' THEN
          v_errors := v_errors || jsonb_build_object(
            'row', v_idx, 'sku', v_sku, 'reason', 'ERR_MASTER_SKU_RACE',
            'detail', 'carrera de unicidad del maestro: reintente la fila');
        ELSE
          v_errors := v_errors || jsonb_build_object(
            'row', v_idx, 'sku', v_sku, 'reason', 'ERR_UNIQUE_VIOLATION',
            'detail', 'conflicto de unicidad en ' || v_constraint);
        END IF;
      WHEN check_violation THEN
        IF v_master_created_this_row AND v_master_id IS NOT NULL THEN
          DELETE FROM public.master_change_log WHERE master_product_id = v_master_id;
          DELETE FROM public.master_products WHERE id = v_master_id;
          v_master_created_this_row := false;
          v_masters_created := v_masters_created - 1;
        END IF;
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_CHECK_VIOLATION',
          'detail', 'valor rechazado por una regla de la base de datos');
      WHEN OTHERS THEN
        IF v_master_created_this_row AND v_master_id IS NOT NULL THEN
          DELETE FROM public.master_change_log WHERE master_product_id = v_master_id;
          DELETE FROM public.master_products WHERE id = v_master_id;
          v_master_created_this_row := false;
          v_masters_created := v_masters_created - 1;
        END IF;
        v_errors := v_errors || jsonb_build_object(
          'row', v_idx, 'sku', v_sku, 'reason', 'ERR_ROW_PROCESSING',
          'detail', substr(SQLERRM, 1, 500));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(v_errors) > 0
                   THEN 'completed_with_errors' ELSE 'success' END,
    'store_id', p_store_id,
    'tenant_id', v_tenant,
    'catalog_connected', v_connected,
    'total', jsonb_array_length(p_rows),
    'created_products', v_created,
    'updated_products', v_updated,
    'masters_created', v_masters_created,
    'masters_reused', v_masters_reused,
    'errors', v_errors,
    'results', v_results,
    'audit_actor', v_caller_uid
  );
END;
$function$
;

REVOKE EXECUTE ON FUNCTION public.managed_bulk_import_products(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.managed_bulk_import_products(uuid, jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.managed_bulk_import_products(uuid, jsonb, uuid) IS
  'CP-CAT-IMPORT-001: alta masiva de productos integrada con el Catálogo Maestro. Garantiza maestro por (tenant, sku) en tiendas conectadas (reutiliza o crea), vincula la fila local y reporta errores por fila. El maestro porta SOLO identidad; los datos comerciales quedan en products.';
