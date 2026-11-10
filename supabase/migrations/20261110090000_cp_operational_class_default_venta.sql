-- ============================================================================
-- CP-PRODUCT-COMMISSION-001 (2026-11-10) — TAREA 1: clasificación operativa
-- OBLIGATORIA con Venta como valor predeterminado.
-- ============================================================================
-- 1) BACKFILL AUTORIZADO por la misión (§7): los productos locales existentes
--    con operational_class NULL (histórico anterior a 20261108150000) pasan a
--    'venta'. NO se toca ninguna clasificación explícita ya asignada, ni
--    precios, costos, inventario, ventas, pagos ni datos financieros. El
--    catálogo maestro compartido no se modifica: las filas exclusivamente
--    maestras no existen en products y siguen devolviendo NULL en la RPC
--    (LEFT JOIN sin fila local) — al incorporarse a una tienda nacen con el
--    DEFAULT 'venta'.
-- 2) DEFAULT 'venta' en la columna: TODA vía de escritura que no envíe
--    clasificación (importaciones Excel/CSV, API de importación masiva,
--    duplicación, recepciones, futuros procesos) crea productos con Venta.
-- 3) NOT NULL tras el backfill: imposible que quede un producto local sin
--    clasificación operativa (integridad a nivel de base, no solo de UI).
-- 4) DEFAULT 'venta' en create_master_product y activate_master_product: una
--    activación/alta desde el catálogo maestro sin clasificación explícita
--    nace como Venta. CREATE OR REPLACE es legal aquí (identidad idéntica:
--    solo cambia el DEFAULT del argumento, no la firma ni el retorno).
-- Enum y valores existentes: SIN cambios. RLS y permisos: sin cambios.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Backfill autorizado (con conteo para la evidencia de la misión)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_backfilled bigint;
  v_already bigint;
  v_por_tienda text;
BEGIN
  SELECT COUNT(*) INTO v_already FROM public.products WHERE operational_class IS NOT NULL;
  UPDATE public.products
     SET operational_class = 'venta'
   WHERE operational_class IS NULL;
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RAISE NOTICE 'CP-PRODUCT-COMMISSION-001: backfill % fila(s) NULL -> venta; % ya clasificada(s) sin cambios', v_backfilled, v_already;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) DEFAULT 'venta' + 3) NOT NULL (el backfill anterior garantiza éxito)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ALTER COLUMN operational_class SET DEFAULT 'venta';

ALTER TABLE public.products
  ALTER COLUMN operational_class SET NOT NULL;

COMMENT ON COLUMN public.products.operational_class IS
'Clasificación operativa del elemento: venta | insumo | activo_fijo | util_herramienta. OBLIGATORIA (NOT NULL, DEFAULT venta, CP-PRODUCT-COMMISSION-001): todo producto local tiene clasificación; las filas exclusivamente maestras (sin fila local en la tienda) devuelven NULL en las RPC por diseño multitienda. Solo informativa: no afecta contabilidad, impuestos, ventas ni costeo.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) DEFAULT 'venta' en las RPC del ciclo de vida del maestro
--    (bodies verbatim de 20261108150000 — definición vigente en main —
--    con el único cambio autorizado: DEFAULT 'venta' en p_operational_class)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_master_product(
  p_store_id uuid,
  p_sku text,
  p_name text,
  p_description text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_barcode_type text DEFAULT NULL,
  p_unit_of_measure text DEFAULT 'unidad',
  p_is_service boolean DEFAULT false,
  p_local jsonb DEFAULT '{}'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_operational_class public.product_operational_class DEFAULT 'venta'
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
  v_sku text := NULLIF(btrim(COALESCE(p_sku, '')), '');
  v_name text := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_barcode text := NULLIF(btrim(COALESCE(p_barcode, '')), '');
  v_master_id uuid;
  v_product_id uuid;
  v_existing_master uuid;
  v_price numeric := COALESCE(NULLIF(p_local->>'price', '')::numeric, 0);
  v_currency text := COALESCE(NULLIF(p_local->>'price_currency', ''), 'CUP');
  v_cost numeric := COALESCE(NULLIF(p_local->>'cost_price', '')::numeric, 0);
  v_min_stock numeric := COALESCE(NULLIF(p_local->>'min_stock', '')::numeric, 1);
BEGIN
  IF v_caller_uid IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF v_sku IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYLOAD: SKU y nombre son obligatorios';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.is_admin_check(v_caller_uid)
     AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de alta de productos en la tienda';
  END IF;

  IF NOT public.is_catalog_store_connected(v_tenant, p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % no usa el catálogo de la organización', p_store_id;
  END IF;

  IF v_currency NOT IN ('CUP','USD','EUR','MLC') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;
  IF v_price < 0 OR v_cost < 0 OR v_min_stock < 1 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYLOAD: precio/costo no pueden ser negativos ni min_stock menor que 1';
  END IF;

  -- Deduplicación por SKU a nivel de maestro (misión §5): proponer existente
  SELECT id INTO v_existing_master FROM public.master_products
   WHERE tenant_id = v_tenant AND sku = v_sku;
  IF v_existing_master IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', v_existing_master;
  END IF;

  -- Si la tienda ya tiene un producto local con ese SKU sin maestro → vincular
  IF EXISTS (SELECT 1 FROM public.products WHERE store_id = p_store_id AND sku = v_sku) THEN
    RAISE EXCEPTION 'ERR_SKU_EXISTS_LOCAL: la tienda ya tiene un producto local con ese SKU; vincúlelo al catálogo en lugar de duplicar';
  END IF;

  IF v_barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.master_products WHERE barcode = v_barcode) THEN
    RAISE EXCEPTION 'ERR_BARCODE_EXISTS: %', v_barcode;
  END IF;

  BEGIN
    INSERT INTO public.master_products
      (tenant_id, sku, name, description, image_path, barcode, barcode_type,
       unit_of_measure, is_service, status, created_by)
    VALUES
      (v_tenant, v_sku, v_name, p_description, p_image_path, v_barcode,
       COALESCE(NULLIF(btrim(COALESCE(p_barcode_type, '')), ''), CASE WHEN v_barcode IS NULL THEN NULL ELSE 'EAN13' END),
       COALESCE(NULLIF(btrim(COALESCE(p_unit_of_measure, '')), ''), 'unidad'),
       p_is_service, 'active', v_caller_uid)
    RETURNING id INTO v_master_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Carrera: otra tienda creó el mismo SKU en paralelo (misión §8.1):
      -- se traduce el 23505 a un error controlado con el id del maestro
      -- ganador; NUNCA un segundo maestro ni una transacción parcial.
      SELECT id INTO v_existing_master FROM public.master_products
       WHERE tenant_id = v_tenant AND sku = v_sku;
      RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', COALESCE(v_existing_master, '(carrera de unicidad, revise y vincule)');
  END;

  -- Fila local de ESTA tienda (valores por defecto del alta manual local;
  -- el trigger de identidad garantiza SKU/nombre = maestro).
  -- CP-OPERATIONAL-CLASS-002 §6: la clasificación operativa se persiste en
  -- la MISMA TRANSACCIÓN (no queda a merced de una escritura secundaria).
  INSERT INTO public.products
    (store_id, tenant_id, master_product_id, sku, name, description, image_url,
     unit_of_measure, is_service, price, price_currency, cost_price, min_stock,
     stock_current, is_active, is_complete, category, supplier, operational_class)
  VALUES
    (p_store_id, v_tenant, v_master_id, v_sku, v_name, p_description, p_image_path,
     COALESCE(NULLIF(btrim(COALESCE(p_unit_of_measure, '')), ''), 'unidad'),
     p_is_service, v_price, v_currency, v_cost, v_min_stock,
     0, true, true, NULLIF(btrim(COALESCE(p_local->>'category', '')), ''), NULLIF(btrim(COALESCE(p_local->>'supplier', '')), ''),
     p_operational_class)
  RETURNING id INTO v_product_id;

  -- Auditoría de identidad: creación (registro por campo)
  INSERT INTO public.master_change_log
    (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
  VALUES
    (v_master_id, v_tenant, 'sku', NULL, v_sku, v_caller_uid, p_store_id),
    (v_master_id, v_tenant, 'name', NULL, v_name, v_caller_uid, p_store_id);

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_MASTER_PRODUCT', 'master_products', v_master_id, p_store_id, v_caller_uid,
          jsonb_build_object('sku', v_sku, 'product_id', v_product_id, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('status','success','master_product_id', v_master_id,
    'product_id', v_product_id, 'tenant_id', v_tenant, 'sku', v_sku);
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_master_product(
  p_master_id uuid,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_operational_class public.product_operational_class DEFAULT 'venta'
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
  v_master public.master_products;
  v_existing uuid;
  v_product_id uuid;
BEGIN
  IF v_caller_uid IS NULL OR p_master_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = p_store_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: %', p_store_id;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.is_admin_check(v_caller_uid)
     AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: sin permiso de alta de productos en la tienda';
  END IF;

  SELECT * INTO v_master FROM public.master_products WHERE id = p_master_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;
  IF v_master.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: el maestro pertenece a otra organización';
  END IF;
  IF v_master.status = 'archived' THEN
    RAISE EXCEPTION 'ERR_MASTER_ARCHIVED: el producto maestro está archivado';
  END IF;
  IF NOT public.is_catalog_store_connected(v_tenant, p_store_id) THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_CONNECTED: la tienda % no usa el catálogo de la organización', p_store_id;
  END IF;

  -- Idempotencia: máx. una fila local por (maestro, tienda). Si la fila ya
  -- existía y el usuario pidió una clasificación, se aplica AQUÍ (misma
  -- transacción): un re-intento de activación corrige la clasificación sin
  -- efectos colaterales.
  SELECT id INTO v_existing FROM public.products
   WHERE master_product_id = p_master_id AND store_id = p_store_id;
  IF v_existing IS NOT NULL THEN
    IF p_operational_class IS NOT NULL THEN
      UPDATE public.products
         SET operational_class = p_operational_class
       WHERE id = v_existing;
    END IF;
    RETURN jsonb_build_object('status','success','already_active', true,
      'product_id', v_existing, 'master_product_id', p_master_id);
  END IF;

  -- Fila local con valores por defecto del alta manual: SIN existencias, SIN
  -- recepciones, SIN movimientos, SIN precios de otras tiendas (misión §10).
  -- CP-OPERATIONAL-CLASS-002 §6: clasificación persistida en la misma
  -- transacción que crea la fila local.
  INSERT INTO public.products
    (store_id, tenant_id, master_product_id, sku, name, description, image_url,
     unit_of_measure, is_service, price, price_currency, cost_price, min_stock,
     stock_current, is_active, is_complete, operational_class)
  VALUES
    (p_store_id, v_tenant, p_master_id, v_master.sku, v_master.name, v_master.description,
     v_master.image_path, COALESCE(v_master.unit_of_measure, 'unidad'), v_master.is_service,
     0, 'CUP', 0, 1, 0, true, true, p_operational_class)
  RETURNING id INTO v_product_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ACTIVATE_MASTER_PRODUCT', 'master_products', p_master_id, p_store_id, v_caller_uid,
          jsonb_build_object('product_id', v_product_id, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('status','success','already_active', false,
    'product_id', v_product_id, 'master_product_id', p_master_id);
END;
$function$;

-- Permisos re-confirmados por contrato (CREATE OR REPLACE los conserva, pero
-- se re-declara explícitamente como en las migraciones de hardening).
REVOKE EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Verificación final de integridad (solo lectura + NOTICE)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nullable text;
  v_default text;
  v_null_count bigint;
  v_valid_count bigint;
  v_create_default boolean;
  v_activate_default boolean;
BEGIN
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'operational_class';
  IF v_nullable <> 'NO' THEN
    RAISE EXCEPTION 'CP-PRODUCT-COMMISSION-001: operational_class sigue nullable (%)', v_nullable;
  END IF;

  SELECT COALESCE(column_default, '') INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'operational_class';
  IF v_default NOT LIKE '%venta%' THEN
    RAISE EXCEPTION 'CP-PRODUCT-COMMISSION-001: DEFAULT inesperado (%)', v_default;
  END IF;

  SELECT COUNT(*) INTO v_null_count FROM public.products WHERE operational_class IS NULL;
  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'CP-PRODUCT-COMMISSION-001: quedan % productos sin clasificación', v_null_count;
  END IF;
  SELECT COUNT(*) INTO v_valid_count
  FROM public.products
  WHERE operational_class NOT IN ('venta','insumo','activo_fijo','util_herramienta');
  IF v_valid_count <> 0 THEN
    RAISE EXCEPTION 'CP-PRODUCT-COMMISSION-001: % clasificaciones fuera del enum', v_valid_count;
  END IF;

  -- DEFAULT del argumento en las RPCs (pg_get_functiondef contiene la firma).
  -- pg_get_functiondef normaliza el tipo sin el prefijo public.: se busca
  -- el parámetro y su DEFAULT 'venta' por separado (único DEFAULT 'venta').
  SELECT (position('DEFAULT ''venta''' IN pg_get_functiondef(p.oid)) > 0
          AND position('p_operational_class' IN pg_get_functiondef(p.oid)) > 0) INTO v_create_default
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_master_product';
  SELECT (position('DEFAULT ''venta''' IN pg_get_functiondef(p.oid)) > 0
          AND position('p_operational_class' IN pg_get_functiondef(p.oid)) > 0) INTO v_activate_default
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'activate_master_product';
  IF NOT v_create_default OR NOT v_activate_default THEN
    RAISE EXCEPTION 'CP-PRODUCT-COMMISSION-001: DEFAULT venta ausente en RPCs (create=%, activate=%)', v_create_default, v_activate_default;
  END IF;

  RAISE NOTICE 'CP-PRODUCT-COMMISSION-001 OK: columna NOT NULL con DEFAULT venta, 0 sin clasificar, RPCs con DEFAULT venta';
END
$$;
