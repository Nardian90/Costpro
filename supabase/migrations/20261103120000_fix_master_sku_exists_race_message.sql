-- COSTPRO-E2E-REACTIVATION-001 · 2026-11-03
-- Fix del contrato de error bajo carrera (hallazgo del E2E C08,
-- e2e/flows/master-catalog-full.spec.ts): en el handler unique_violation
-- de create_master_product, COALESCE(v_existing_master, '(texto)') mezcla
-- uuid y text — Postgres resuelve el tipo común a uuid y el literal se
-- castea en tiempo de ejecución, por lo que el PROPIO handler falla con
-- 22P02 («invalid input syntax for type uuid») y el mensaje contractual
-- ERR_MASTER_SKU_EXISTS nunca llega al cliente. Fix: cast explícito ::text.
-- Cambio único y mínimo: sin cambios de firma, permisos ni comportamiento
-- en el camino sin carrera.
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
      RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', COALESCE(v_existing_master::text, '(carrera de unicidad, revise y vincule)');
  END;

  -- Fila local de ESTA tienda (valores por defecto del alta manual local;
  -- el trigger de identidad garantiza SKU/nombre = maestro)
  INSERT INTO public.products
    (store_id, tenant_id, master_product_id, sku, name, description, image_url,
     unit_of_measure, is_service, price, price_currency, cost_price, min_stock,
     stock_current, is_active, is_complete, category, supplier)
  VALUES
    (p_store_id, v_tenant, v_master_id, v_sku, v_name, p_description, p_image_path,
     COALESCE(NULLIF(btrim(COALESCE(p_unit_of_measure, '')), ''), 'unidad'),
     p_is_service, v_price, v_currency, v_cost, v_min_stock,
     0, true, true, NULLIF(btrim(COALESCE(p_local->>'category', '')), ''), NULLIF(btrim(COALESCE(p_local->>'supplier', '')), ''))
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
