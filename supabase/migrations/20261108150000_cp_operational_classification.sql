-- ============================================================================
-- CP-OPERATIONAL-CLASS-001/002 (2026-11-08) — Clasificación operativa del
-- catálogo + remediación de las RPC (misión CP-OPERATIONAL-CLASS-002).
-- ============================================================================
-- La remediación (v2 de esta migración) corrige dos defectos de la primera
-- versión confirmados en la revisión del PR #1587:
--  · P0 RPC: PostgreSQL NO permite cambiar el tipo de retorno con CREATE OR
--    REPLACE (error 42P13 «cannot change return type of existing function»).
--    Se usa el patrón del propio repo (20261101130000): DROP FUNCTION con la
--    firma exacta (SIN CASCADE) + CREATE FUNCTION, con verificación previa de
--    dependencias y restauración explícita de propietario y permisos.
--  · P0 catálogo maestro: la primera versión partió de una definición antigua
--    de get_paginated_products_v2 y habría perdido la visibilidad del catálogo
--    maestro multitienda. AHORA se reproduce EXACTAMENTE la definición VIGENTE
--    (20261101130000_cp_catalogo_visibilidad_maestro.sql): rama
--    «IF v_connected THEN» con maestros activos de la organización (con o sin
--    fila local), source ('local'|'master'), master_product_id, conservación
--    de los productos locales sin vínculo y de la imagen master-first.
--
-- La clasificación operativa es INFORMATIVA: no cambia contabilización,
-- valoración, impuestos, ventas, costeo ni movimientos. NULL = «Sin
-- clasificar»: el histórico NO se reclasifica (sin UPDATE masivo). Para filas
-- exclusivamente maestras (sin fila local en la tienda) se devuelve NULL: la
-- clasificación es un dato POR TIENDA y jamás se comparte entre tiendas.
-- Firma de parámetros de ambas RPC PRESERVADA; solo se añade una columna de
-- retorno, AL FINAL del resultado. RLS intacto.
--
-- Además (CP-OPERATIONAL-CLASS-002 §6): create_master_product y
-- activate_master_product aceptan p_operational_class (DEFAULT NULL,
-- retrocompatible; añadir parámetros no altera el tipo de retorno → CREATE OR
-- REPLACE válido aquí) para persistir la clasificación EN LA MISMA
-- TRANSACCIÓN que crea/activa la fila local.
-- ============================================================================

-- 1) Tipo enumerado (4 valores; ampliable con ALTER TYPE ADD VALUE).
--    CREATE TYPE no admite IF NOT EXISTS: guard idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'product_operational_class'
                   AND n.nspname = 'public') THEN
    CREATE TYPE public.product_operational_class AS ENUM (
      'venta',
      'insumo',
      'activo_fijo',
      'util_herramienta'
    );
  END IF;
END
$$;

COMMENT ON TYPE public.product_operational_class IS
'Clasificación operativa del elemento del catálogo (CP-OPERATIONAL-CLASS-001/002). Informativa: NO cambia contabilización, valoración, impuestos ni reglas de venta/costeo. Independiente de is_service (físico/servicio) y de la categoría comercial.';

-- 2) Columna en la capa operativa. NULL = Sin clasificar (estado inicial de
--    TODO el catálogo existente; sin backfill).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS operational_class public.product_operational_class;

COMMENT ON COLUMN public.products.operational_class IS
'Clasificación operativa del elemento: venta | insumo | activo_fijo | util_herramienta. NULL = Sin clasificar (registros históricos y pendientes; jamás se asigna automáticamente). Dato POR TIENDA: las filas exclusivamente maestras no comparten clasificación entre tiendas. Solo informativa: no afecta contabilidad, impuestos, ventas ni costeo.';

-- 3) Índice parcial para el filtro del Listado de precios / Catálogo.
CREATE INDEX IF NOT EXISTS products_operational_class_store_idx
  ON public.products (store_id, operational_class)
  WHERE operational_class IS NOT NULL;

-- ============================================================================
-- 4) Análisis de dependencias ANTES del DROP (sin CASCADE: si existiera una
--    vista/regla dependiente de las RPC, la migración FALLA con diagnóstico
--    en lugar de arrastrarla). En el estado vigente el único consumidor de
--    estas RPCs es el cliente Supabase (llamada remota): no hay objetos SQL
--    dependientes en el repo (verificado también por tests estáticos).
-- ============================================================================
DO $$
DECLARE
  v_dependents integer;
BEGIN
  SELECT COUNT(*) INTO v_dependents
  FROM pg_depend d
  JOIN pg_proc p ON p.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_rewrite rw ON rw.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  LEFT JOIN pg_class vw ON vw.oid = rw.ev_class
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_paginated_products_v2', 'get_products_for_pos')
    AND d.refobjsubid = 0
    AND d.deptype IN ('n', 'r', 'i')
    AND (d.classid <> 'pg_rewrite'::regclass OR vw.relkind IN ('v', 'm'));

  IF v_dependents > 0 THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: existen % objeto(s) SQL dependiente(s) de las RPC (vistas/reglas). Resuélvelos antes de aplicar; NO se usará CASCADE.', v_dependents;
  END IF;
END
$$;

-- ============================================================================
-- 5) get_paginated_products_v2 — definición VIGENTE (20261101130000, catálogo
--    maestro multitienda ÍNTEGRO) + operational_class AL FINAL del retorno.
--    DROP SIN CASCADE (el retorno cambia: CREATE OR REPLACE no es posible).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text);

CREATE FUNCTION public.get_paginated_products_v2(
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_sort_key text DEFAULT 'name'::text,
  p_sort_dir text DEFAULT 'asc'::text,
  p_stock_filter text DEFAULT 'all'::text,
  p_active_filter text DEFAULT 'all'::text
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  barcode text,
  barcode_type text,
  category text,
  price numeric,
  precio_empresa numeric,
  precio_empresa_currency text,
  price_currency text,
  cost_price numeric,
  min_stock numeric,
  image_url text,
  description text,
  unit_of_measure text,
  supplier text,
  stock_current numeric,
  cost_average numeric,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  visible_en_tienda boolean,
  price_visible boolean,
  stock_visible boolean,
  on_promotion boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_complete boolean,
  is_service boolean,
  total_count bigint,
  -- MISIÓN 002: identidad de la fila para el frontend
  source text,
  master_product_id uuid,
  -- CP-OPERATIONAL-CLASS-002: nuevo campo AL FINAL del resultado.
  -- NULL para filas exclusivamente maestras (p.id IS NULL): la clasificación
  -- es un dato por tienda y no se comparte ni se inventa.
  operational_class public.product_operational_class
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_tenant uuid;
  v_connected boolean;
  v_search text;
BEGIN
  -- Auth checks (sin cambios respecto a la versión anterior)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
  END IF;

  v_tenant := (SELECT s.tenant_id FROM public.stores s WHERE s.id = p_store_id);
  v_connected := v_tenant IS NOT NULL
    AND public.is_catalog_store_connected(v_tenant, p_store_id);
  v_search := COALESCE(p_search_term, '');

  -- ── Tienda CONECTADA: catálogo maestro completo de la organización ──────
  --    ∪ productos locales sin vínculo (altas locales puras).
  IF v_connected THEN
    RETURN QUERY
    WITH base AS (
      -- (a) Maestros activos de la organización (con o sin fila local)
      SELECT
        COALESCE(p.id, m.id) AS id,
        COALESCE(NULLIF(btrim(COALESCE(p.name, '')), ''), m.name) AS name,
        COALESCE(NULLIF(btrim(COALESCE(p.sku, '')), ''), m.sku) AS sku,
        COALESCE(NULLIF(m.barcode, ''), p.barcode) AS barcode,
        COALESCE(NULLIF(m.barcode_type, ''), p.barcode_type) AS barcode_type,
        NULLIF(p.category, '') AS category,
        COALESCE(p.price, 0) AS price,
        p.precio_empresa,
        p.precio_empresa_currency,
        COALESCE(p.price_currency, 'CUP') AS price_currency,
        p.cost_price,
        p.min_stock,
        COALESCE(NULLIF(m.image_path, ''), p.image_url) AS image_url,
        COALESCE(NULLIF(btrim(COALESCE(p.description, '')), ''), m.description) AS description,
        COALESCE(NULLIF(p.unit_of_measure, ''), m.unit_of_measure) AS unit_of_measure,
        p.supplier,
        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                  WHERE inv.product_id = p.id AND inv.store_id = p_store_id), 0)::numeric AS stock_current,
        p.cost_average,
        p_store_id AS store_id,
        COALESCE(p.is_active, true) AS is_active,
        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
        p.visible_en_tienda,
        COALESCE(p.price_visible, true) AS price_visible,
        COALESCE(p.stock_visible, true) AS stock_visible,
        COALESCE(p.on_promotion, false) AS on_promotion,
        COALESCE(p.created_at, m.created_at) AS created_at,
        COALESCE(p.updated_at, m.updated_at) AS updated_at,
        -- Filas solo-maestro: sin alta local completa → is_complete honesto
        (p.id IS NOT NULL
         AND COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
         AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
         AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
        COALESCE(p.is_service, m.is_service) AS is_service,
        CASE WHEN p.id IS NULL THEN 'master' ELSE 'local' END::text AS source,
        m.id AS master_product_id,
        -- CP-OPERATIONAL-CLASS-002: clasificación de la FILA LOCAL de esta
        -- tienda; NULL para filas exclusivamente maestras (p.id IS NULL).
        p.operational_class AS operational_class
      FROM public.master_products m
      LEFT JOIN public.products p
        ON p.master_product_id = m.id
       AND p.store_id = p_store_id
      WHERE m.tenant_id = v_tenant
        AND m.status = 'active'
        AND (p.id IS NULL OR p.tenant_id IS NOT DISTINCT FROM v_tenant)
      UNION ALL
      -- (b) Productos locales SIN vínculo al maestro (altas locales puras:
      --     nunca desaparecen al conectar la tienda al catálogo)
      SELECT
        p.id,
        p.name,
        p.sku,
        p.barcode,
        p.barcode_type,
        NULLIF(p.category, ''),
        p.price,
        p.precio_empresa,
        p.precio_empresa_currency,
        COALESCE(p.price_currency, 'CUP'),
        p.cost_price,
        p.min_stock,
        p.image_url,
        p.description,
        p.unit_of_measure,
        p.supplier,
        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                  WHERE inv.product_id = p.id AND inv.store_id = p_store_id), 0)::numeric,
        p.cost_average,
        p_store_id,
        p.is_active,
        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id),
        p.visible_en_tienda,
        COALESCE(p.price_visible, true),
        COALESCE(p.stock_visible, true),
        COALESCE(p.on_promotion, false),
        p.created_at,
        p.updated_at,
        (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
         AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
         AND COALESCE(p.unit_of_measure, '') <> ''),
        COALESCE(p.is_service, false),
        'local'::text,
        NULL::uuid,
        p.operational_class
      FROM public.products p
      WHERE p.store_id = p_store_id
        AND p.master_product_id IS NULL
        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM v_tenant)
    )
    SELECT
      b.id, b.name, b.sku, b.barcode, b.barcode_type, b.category, b.price,
      b.precio_empresa, b.precio_empresa_currency, b.price_currency,
      b.cost_price, b.min_stock, b.image_url, b.description, b.unit_of_measure,
      b.supplier, b.stock_current, b.cost_average, b.store_id, b.is_active,
      b.has_movements, b.visible_en_tienda, b.price_visible, b.stock_visible,
      b.on_promotion, b.created_at, b.updated_at, b.is_complete, b.is_service,
      COUNT(*) OVER()::bigint AS total_count,
      b.source, b.master_product_id,
      b.operational_class
    FROM base b
    WHERE (v_search = '' OR
           b.name ILIKE ('%' || v_search || '%') OR
           b.sku ILIKE ('%' || v_search || '%') OR
           COALESCE(b.barcode, '') ILIKE ('%' || v_search || '%'))
      AND (p_category IS NULL OR p_category = '' OR b.category = p_category)
      AND (p_active_filter = 'all' OR
           (p_active_filter = 'active' AND b.is_active = true) OR
           (p_active_filter = 'inactive' AND b.is_active = false))
      AND (p_stock_filter = 'all' OR
           (p_stock_filter = 'out' AND b.stock_current <= 0) OR
           (p_stock_filter = 'low' AND b.stock_current > 0
              AND b.stock_current <= COALESCE(b.min_stock, 0)) OR
           (p_stock_filter = 'ok' AND b.stock_current > COALESCE(b.min_stock, 0)))
    ORDER BY
      CASE WHEN p_sort_dir = 'asc' THEN
        CASE p_sort_key
          WHEN 'name' THEN b.name
          WHEN 'sku' THEN COALESCE(b.sku, '')
          WHEN 'price' THEN LPAD(b.price::text, 20, '0')
          WHEN 'cost_price' THEN LPAD(COALESCE(b.cost_price, 0)::text, 20, '0')
          WHEN 'stock_current' THEN LPAD(b.stock_current::text, 20, '0')
          ELSE b.name
        END
      END ASC NULLS LAST,
      CASE WHEN p_sort_dir = 'desc' THEN
        CASE p_sort_key
          WHEN 'name' THEN b.name
          WHEN 'sku' THEN COALESCE(b.sku, '')
          WHEN 'price' THEN LPAD(b.price::text, 20, '0')
          WHEN 'cost_price' THEN LPAD(COALESCE(b.cost_price, 0)::text, 20, '0')
          WHEN 'stock_current' THEN LPAD(b.stock_current::text, 20, '0')
          ELSE b.name
        END
      END DESC NULLS LAST,
      b.id ASC
    LIMIT v_limit OFFSET v_offset;
    RETURN;
  END IF;

  -- ── Tienda NO conectada (o admin sin tienda): comportamiento previo ────
  RETURN QUERY
  SELECT
    p.id, p.name, p.sku, p.barcode, p.barcode_type,
    p.category, p.price, p.precio_empresa, p.precio_empresa_currency, COALESCE(p.price_currency, 'CUP'),
    p.cost_price, p.min_stock, p.image_url, p.description,
    p.unit_of_measure, p.supplier,
    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
              WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric AS stock_current,
    p.cost_average,
    p.store_id, p.is_active,
    EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
            UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
            UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
    p.visible_en_tienda,
    COALESCE(p.price_visible, true),
    COALESCE(p.stock_visible, true),
    COALESCE(p.on_promotion, false),
    p.created_at, p.updated_at,
    (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
     AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
     AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
    COALESCE(p.is_service, false) AS is_service,
    COUNT(*) OVER()::bigint AS total_count,
    'local'::text AS source,
    p.master_product_id AS master_product_id,
    p.operational_class AS operational_class
  FROM public.products p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND public.has_store_access(p.store_id)
    AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
         (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
    AND (p_search_term IS NULL OR p_search_term = '' OR
         p.name ILIKE ('%' || p_search_term || '%') OR
         p.sku ILIKE ('%' || p_search_term || '%') OR
         COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%') OR
         (
           p.master_product_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.master_products m
              WHERE m.id = p.master_product_id
                AND m.barcode = trim(p_search_term)
                AND m.tenant_id = (SELECT s3.tenant_id FROM public.stores s3 WHERE s3.id = p.store_id)
           )
         ))
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
    AND (p_active_filter = 'all' OR
         (p_active_filter = 'active' AND p.is_active = true) OR
         (p_active_filter = 'inactive' AND p.is_active = false))
    AND (p_stock_filter = 'all' OR
         (p_stock_filter = 'out' AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= 0) OR
         (p_stock_filter = 'low' AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > 0 AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= COALESCE(p.min_stock, 0)) OR
         (p_stock_filter = 'ok' AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > COALESCE(p.min_stock, 0)))
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_key
        WHEN 'name' THEN p.name
        WHEN 'sku' THEN COALESCE(p.sku, '')
        WHEN 'price' THEN LPAD(p.price::text, 20, '0')
        WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
        WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
        ELSE p.name
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_key
        WHEN 'name' THEN p.name
        WHEN 'sku' THEN COALESCE(p.sku, '')
        WHEN 'price' THEN LPAD(p.price::text, 20, '0')
        WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
        WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
        ELSE p.name
      END
    END DESC NULLS LAST,
    p.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

-- ============================================================================
-- 6) get_products_for_pos — definición VIGENTE (20261101130000: imagen
--    master-first, guardas y scoping intactos) + operational_class AL FINAL.
--    DROP SIN CASCADE: el retorno cambia (CREATE OR REPLACE no es posible).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_products_for_pos(uuid, text, text, integer, integer);

CREATE FUNCTION public.get_products_for_pos(
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  sku text,
  price numeric,
  cost_price numeric,
  image_url text,
  category text,
  unit_of_measure text,
  supplier text,
  created_at timestamptz,
  updated_at timestamptz,
  stock_current numeric,
  cost_average numeric,
  min_stock integer,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  product_variants jsonb,
  price_currency text,
  barcode text,
  barcode_type text,
  visible_en_tienda boolean,
  precio_empresa numeric,
  precio_empresa_currency text,
  on_promotion boolean,
  is_service boolean,
  -- CP-OPERATIONAL-CLASS-002: nuevo campo AL FINAL del resultado
  -- (NULL = Sin clasificar; siempre de la fila local de la tienda).
  operational_class public.product_operational_class
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    DECLARE
      v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
      v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
      v_search text := trim(coalesce(p_search_term, ''));
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
      END IF;
      IF p_store_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
      END IF;
      IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
      END IF;

      RETURN QUERY
      SELECT
        p.id, p.name, p.description, p.sku, p.price, p.cost_price,
        -- MISIÓN 002: imagen master-first para filas vinculadas (una sola
        -- fuente; el cambio del maestro se refleja sin copias por tienda)
        COALESCE(
          NULLIF((SELECT mm.image_path FROM public.master_products mm WHERE mm.id = p.master_product_id), ''),
          p.image_url
        ) AS image_url,
        p.category, p.unit_of_measure, p.supplier, p.created_at, p.updated_at,
        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
        p.cost_average, p.min_stock::integer, p.store_id, p.is_active,
        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price, 'conversion_factor', pv.conversion_factor)) FROM public.product_variants pv WHERE pv.product_id = p.id), '[]'::jsonb),
        COALESCE(p.price_currency, 'CUP'),
        p.barcode,
        p.barcode_type,
        p.visible_en_tienda,
        p.precio_empresa,
        p.precio_empresa_currency,
        COALESCE(p.on_promotion, false),
        COALESCE(p.is_service, false),
        -- CP-OPERATIONAL-CLASS-002: clasificación operativa de la fila local
        -- (NULL = Sin clasificar; nunca se comparte entre tiendas).
        p.operational_class AS operational_class
      FROM public.products p
      WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
        AND public.has_store_access(p.store_id)
        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
        AND (
          v_search = ''
          OR p.name ILIKE ('%' || v_search || '%')
          OR p.sku ILIKE ('%' || v_search || '%')
          OR COALESCE(p.barcode, '') = v_search
          OR (
            p.master_product_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.master_products m
               WHERE m.id = p.master_product_id
                 AND m.barcode = v_search
                 AND m.tenant_id = (SELECT s2.tenant_id FROM public.stores s2 WHERE s2.id = p.store_id)
            )
          )
        )
        AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
      ORDER BY p.name
      LIMIT v_limit OFFSET v_offset;
    END;
$function$;

-- ============================================================================
-- 7) Restauración explícita de propietario y permisos (DROP+CREATE reinicia
--    los privilegios; contrato de 20261101130000 + hardening 20261020000002).
-- ============================================================================
ALTER FUNCTION public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) TO authenticated, service_role;

-- ============================================================================
-- 8) CP-OPERATIONAL-CLASS-002 §6 — persistencia TRANSACCIONAL de la
--    clasificación en el ciclo de vida del maestro. Ambos RPCs reciben
--    p_operational_class (DEFAULT NULL: retrocompatible).
--    ATENCIÓN (hallazgo verificado en PostgreSQL real): CREATE OR REPLACE con
--    parámetros NUEVOS NO reemplaza — crea una SOBRECARGA y la firma vieja
--    seguiría resolviendo las llamadas sin clasificación. Por eso se DROP-ea
--    la firma antigua (SIN CASCADE) antes de crear la nueva (patrón
--    sec005_drop_dead_overloads / 20261101130000). El resto de la lógica
--    vigente (20261028112100) queda INTACTA: solo se añade la columna al
--    INSERT de la fila local y, en activación, el caso idempotente
--    already_active aplica la clasificación pedida (re-intento correctivo).
-- ============================================================================
-- Idempotente: normaliza CUALQUIER estado previo (solo la vieja, solo la
-- nueva por una corrida interrumpida, o ambas).
DROP FUNCTION IF EXISTS public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class);

CREATE FUNCTION public.create_master_product(
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
  p_operational_class public.product_operational_class DEFAULT NULL
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

DROP FUNCTION IF EXISTS public.activate_master_product(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.activate_master_product(uuid, uuid, uuid, public.product_operational_class);

CREATE FUNCTION public.activate_master_product(
  p_master_id uuid,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_operational_class public.product_operational_class DEFAULT NULL
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

-- 8b) Permisos de las firmas nuevas del ciclo de vida (el DROP reinicia ACL;
--     contrato de hardening del repo: solo sesiones autenticadas/servicio).
REVOKE EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_master_product(uuid, text, text, text, text, text, text, text, boolean, jsonb, uuid, public.product_operational_class) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_master_product(uuid, uuid, uuid, public.product_operational_class) TO authenticated, service_role;

-- ============================================================================
-- 9) Verificación final de integridad (solo lectura + NOTICE; ningún dato se
--    modifica fuera de la definición de objetos).
-- ============================================================================
DO $$
DECLARE
  v_column_type text;
  v_enum_values text;
  v_unclassified bigint;
  v_classified bigint;
  v_v2_has_class boolean;
  v_pos_has_class boolean;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_column_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'products'
    AND a.attname = 'operational_class' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_column_type IS NULL THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: la columna products.operational_class no fue creada';
  END IF;
  -- format_type omite el esquema cuando el tipo es visible en search_path.
  IF v_column_type NOT IN ('public.product_operational_class', 'product_operational_class') THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: tipo inesperado % (se esperaba product_operational_class)', v_column_type;
  END IF;

  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_enum_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'product_operational_class';
  IF v_enum_values IS DISTINCT FROM 'venta,insumo,activo_fijo,util_herramienta' THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: valores del enum inesperados: %', v_enum_values;
  END IF;

  -- Firmas: el retorno de ambas RPCs incluye operational_class (al final).
  SELECT position('operational_class' IN pg_get_function_result(p.oid)) > 0 INTO v_v2_has_class
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_paginated_products_v2';
  SELECT position('operational_class' IN pg_get_function_result(p.oid)) > 0 INTO v_pos_has_class
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_products_for_pos';
  IF NOT v_v2_has_class OR NOT v_pos_has_class THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS-002: las RPC no exponen operational_class (v2=%, pos=%)', v_v2_has_class, v_pos_has_class;
  END IF;

  -- Inventario del estado de clasificación (NINGÚN dato se modifica aquí).
  SELECT COUNT(*) INTO v_classified FROM public.products WHERE operational_class IS NOT NULL;
  SELECT COUNT(*) INTO v_unclassified FROM public.products WHERE operational_class IS NULL;
  RAISE NOTICE 'CP-OPERATIONAL-CLASS-002 OK: % fila(s) clasificada(s), % Sin clasificar (histórico intacto, sin backfill); RPCs recreadas con catálogo maestro íntegro', v_classified, v_unclassified;
END
$$;
