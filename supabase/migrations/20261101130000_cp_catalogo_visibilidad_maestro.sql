-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN COSTPRO-CATALOG-MASTER-002 — VISIBILIDAD GLOBAL DEL CATÁLOGO MAESTRO
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (auditoría 2026-11-01): get_paginated_products_v2 pagina
--   FROM products WHERE store_id = p_store_id — una tienda CONECTADA al
--   catálogo maestro sin filas locales (p.ej. FERROCARRIL VITALLCONS: 0
--   products, 188 maestros activos del tenant) veía 0 productos.
-- MODELO CORRECTO (misión §6): UN PRODUCTO MAESTRO, UNA IDENTIDAD GLOBAL, UNA
--   FUENTE DE IMAGEN Y MÚLTIPLES INVENTARIOS LOCALES INDEPENDIENTES.
--   En una tienda conectada el catálogo = maestros activos de la organización
--   (con o sin fila local) ∪ productos locales sin vínculo (altas locales
--   previas a la conexión — nunca desaparecen).
-- CAMBIOS:
--   1) Índice único parcial products(master_product_id, store_id): el
--      invariant "máx. una fila local por (maestro, tienda)" que
--      activate_master_product ya garantiza en su lógica pasa a ser ley de la
--      base (verificado: producción 188 pares, 0 duplicados).
--   2) get_paginated_products_v2: si la tienda está CONECTADA
--      (is_catalog_store_connected):
--        · Identidad (nombre/sku/código/imagen) → maestro (fuente única).
--        · Operativo (stock/precio/costo/categoría/flags) → fila local.
--        · Filas sin fila local: source='master', operativos en cero, sin
--          precios de otras tiendas (misión §10) e is_complete=false honesto.
--        · Productos locales sin master_product_id: siguen visibles (source
--          'local', master NULL) — altas locales puras de la tienda.
--      Las tiendas NO conectadas conservan el comportamiento exacto anterior.
--   3) get_products_for_pos: la imagen de una fila vinculada se resuelve
--      SIEMPRE desde el maestro (master-first) — el cambio de imagen del
--      maestro se refleja en todas las tiendas sin copias nuevas. El resto de
--      la consulta (precios/stock locales, escaneo) queda intacto.
-- SEGURIDAD: los guards de autenticación/autorización de ambas funciones no
--   cambian; la lectura de maestros respeta can_read_master_catalog vía RLS y
--   la escritura sigue canalizada por las RPC gobernadas (update_master_product,
--   activate_master_product, catalog_governors).
-- IMÁGENES: products.image_url y master_products.image_path comparten el
--   MISMO filename del bucket product-images (verificado 111/111 en
--   producción; cero archivos duplicados). Esta migración no copia archivos ni
--   reescribe datos: solo cambia de dónde se LEE la identidad y la imagen.
-- REVERSIBILIDAD: re-aplicar las definiciones de 20261028120000 restaura las
--   funciones previas; DROP INDEX IF EXISTS revierte el índice.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Invariante relacional: una fila local por (maestro, tienda)
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS products_master_store_unique
  ON public.products (master_product_id, store_id)
  WHERE master_product_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) get_paginated_products_v2 — visibilidad global para tiendas conectadas
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_paginated_products_v2(
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
  master_product_id uuid
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
        m.id AS master_product_id
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
        NULL::uuid
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
      b.source, b.master_product_id
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
    p.master_product_id AS master_product_id
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

-- ─────────────────────────────────────────────────────────────────────────
-- 3) get_products_for_pos — imagen resuelta desde el maestro (fuente única)
--    (CREATE OR REPLACE: firma y permisos intactos; solo cambia la lectura
--     de image_url para filas vinculadas)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_products_for_pos(
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
  is_service boolean
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
        COALESCE(p.is_service, false)
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

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Permisos de ejecución (DROP+CREATE de v2 reinicia privilegios)
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) TO authenticated, service_role;
