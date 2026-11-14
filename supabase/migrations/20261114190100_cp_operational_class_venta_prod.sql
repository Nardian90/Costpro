-- ============================================================================
-- CP-POST-MERGE-EXECUTION-002 · FRENTE 3 (2026-11-14)
-- CLASIFICACIÓN OPERATIVA VENTA — DECISIÓN FUNCIONAL DEFINITIVA DEL PROPIETARIO
-- ============================================================================
-- DECISIÓN (adenda vinculante §3): «todos los productos del catálogo tengan
--   clasificación operativa venta» — sin NULLs, nuevos productos heredan
--   'venta', sin reincidencia por importaciones.
--
-- POR QUÉ UNA MIGRACIÓN CORRECTIVA NUEVA (y no actualizar 20261110090000):
--   La migración original figura como NO aplicada en producción (compuerta de
--   decisión del propietario de la misión anterior), PERO ya forma parte del
--   replay certificado de la BD aislada CostproE2E (manifiesto de migraciones
--   + digest). El protocolo de inmutabilidad del repositorio protege cualquier
--   migración integrada al replay: modificar el archivo cambiaría su digest y
--   rompería la reproducibilidad del replay. Se crea esta migración correctiva
--   nueva que alcanza EL MISMO ESTADO FINAL (portable: idempotente sobre una
--   base donde la original ya corrió — replay E2E — y completa sobre una base
--   donde no corrió — producción). Nada de la original se modifica.
--
-- ESTADO PRODUCCIÓN [MEDIDO 2026-11-14]: products.operational_class nullable,
--   sin default; 274 NULL + 81 'venta' de 355. La columna fue introducida por
--   20261108150000 (aplicada). Tipo: product_operational_class (venta |
--   insumo | activo_fijo | util_herramienta).
--
-- 1) BACKFILL: los NULL (productos locales del catálogo) pasan a 'venta'.
--    Las clasificaciones explícitas existentes NO se tocan. Esto aplica al
--    campo de PRODUCTOS únicamente: NO se toca ningún MOVIMIENTO histórico
--    (Entradas/Devoluciones/Vales de Salida conservan su tipo — una Entrada
--    NO se convierte en Venta).
-- 2) DEFAULT 'venta' en la columna: toda vía de escritura que omita el campo
--    (alta manual local, recepciones con SKU nuevo, futuros procesos) crea
--    productos Venta.
-- 3) NOT NULL: integridad a nivel de base — imposible un producto sin
--    clasificación. Un INSERT con NULL explícito fallará de forma visible
--    (fail-closed), nunca un NULL silencioso.
-- 4) DEFAULT 'venta' en create_master_product y activate_master_product
--    (bodies VERBATIM de 20261110090000, verificados idénticos a la definición
--    vigente de 20261108150000 salvo el DEFAULT del argumento — diff
--    programático 2 diferencias por función, ambas en el DEFAULT).
-- 5) Verificación final fail-closed: columna NOT NULL con DEFAULT, 0 sin
--    clasificar, 0 fuera del enum, DEFAULTs presentes en las RPCs.
--
-- NOTA DE CONSISTENCIA UI/API: el backend y el frontend ya operan el valor
--   'venta' (81 filas existentes creadas desde la UI post-20261108150000; el
--   importador valida venta/insumo/activo_fijo/util_herramienta; las pruebas
--   product-operational-class-schemas cubren el contrato). El fix del
--   importador (20261114190200) garantiza que las importaciones nunca inserten
--   NULL en este campo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Backfill autorizado por la decisión del propietario (conteo para evidencia)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
    v_backfilled bigint;
    v_already bigint;
begin
    select count(*) into v_already from public.products where operational_class is not null;
    update public.products
       set operational_class = 'venta'
     where operational_class is null;
    get diagnostics v_backfilled = row_count;
    raise notice 'CP-POST-MERGE-002 §3: backfill % fila(s) NULL -> venta; % ya clasificada(s) sin cambios', v_backfilled, v_already;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) DEFAULT 'venta' + 3) NOT NULL (el backfill garantiza el éxito)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.products
    alter column operational_class set default 'venta';

alter table public.products
    alter column operational_class set not null;

comment on column public.products.operational_class is
'Clasificación operativa del elemento: venta | insumo | activo_fijo | util_herramienta. OBLIGATORIA (NOT NULL, DEFAULT venta; decisión del propietario CP-POST-MERGE-EXECUTION-002 §3): todo producto local tiene clasificación; las filas exclusivamente maestras (sin fila local en la tienda) devuelven NULL en las RPC por diseño multitienda. Solo informativa: no afecta contabilidad, impuestos, ventas ni costeo. NO clasifica movimientos de inventario (Entrada/Devolución/Vale de Salida conservan su propio tipo).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) DEFAULT 'venta' en las RPC del ciclo de vida del maestro
--    (bodies VERBATIM de 20261110090000 — definición vigente en main —
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
-- 5) Verificación final de integridad (solo lectura + fail-closed)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
    v_nullable text;
    v_default text;
    v_null_count bigint;
    v_valid_count bigint;
    v_create_default boolean;
    v_activate_default boolean;
begin
    select is_nullable into v_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'operational_class';
    if v_nullable <> 'NO' then
        raise exception 'CP-POST-MERGE-002 §3: operational_class sigue nullable (%)', v_nullable;
    end if;

    select coalesce(column_default, '') into v_default
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'operational_class';
    if v_default not like '%venta%' then
        raise exception 'CP-POST-MERGE-002 §3: DEFAULT inesperado (%)', v_default;
    end if;

    select count(*) into v_null_count from public.products where operational_class is null;
    if v_null_count <> 0 then
        raise exception 'CP-POST-MERGE-002 §3: quedan % productos sin clasificación', v_null_count;
    end if;
    select count(*) into v_valid_count
    from public.products
    where operational_class not in ('venta','insumo','activo_fijo','util_herramienta');
    if v_valid_count <> 0 then
        raise exception 'CP-POST-MERGE-002 §3: % clasificaciones fuera del enum', v_valid_count;
    end if;

    -- DEFAULT del argumento en las RPCs (pg_get_functiondef contiene la firma).
    select (position('DEFAULT ''venta''' in pg_get_functiondef(p.oid)) > 0
            and position('p_operational_class' in pg_get_functiondef(p.oid)) > 0) into v_create_default
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_master_product';
    select (position('DEFAULT ''venta''' in pg_get_functiondef(p.oid)) > 0
            and position('p_operational_class' in pg_get_functiondef(p.oid)) > 0) into v_activate_default
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'activate_master_product';
    if not v_create_default or not v_activate_default then
        raise exception 'CP-POST-MERGE-002 §3: DEFAULT venta ausente en RPCs (create=%, activate=%)', v_create_default, v_activate_default;
    end if;

    raise notice 'CP-POST-MERGE-002 §3 OK: columna NOT NULL con DEFAULT venta, 0 sin clasificar, RPCs con DEFAULT venta';
end
$$;
