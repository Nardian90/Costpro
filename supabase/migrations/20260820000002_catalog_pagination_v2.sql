-- ============================================================================
-- Migration: 20260820000002_catalog_pagination_v2.sql
-- v2 — Server-side sort + filter para paginación consistente entre páginas
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.get_paginated_products_v2(
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_sort_key text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc',
  p_stock_filter text DEFAULT 'all',
  p_active_filter text DEFAULT 'all'
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  category text,
  price numeric,
  cost_price numeric,
  min_stock numeric,
  image_url text,
  description text,
  stock_current numeric,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  -- Auth checks
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
    p.id, p.name, p.sku, p.category,
    p.price, p.cost_price, p.min_stock,
    p.image_url, p.description,
    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
              WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric AS stock_current,
    p.store_id, p.is_active,
    EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
            UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
            UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
    COUNT(*) OVER()::bigint AS total_count
  FROM public.products p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND public.has_store_access(p.store_id)
    AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
         (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
    AND (p_search_term IS NULL OR p_search_term = '' OR
         p.name ILIKE ('%' || p_search_term || '%') OR
         p.sku ILIKE ('%' || p_search_term || '%') OR
         COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%'))
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
    -- Dynamic sort: CASE returns text for all columns (cast numerics to text with LPAD
    -- for correct numeric ordering as text). Tiebreaker by id for stable sort across pages.
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
    p.id ASC  -- tiebreaker estable
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_paginated_products_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.get_paginated_products_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_products_v2 TO service_role;

COMMENT ON FUNCTION public.get_paginated_products_v2 IS
  'v2: Server-side sort + filter para paginación consistente. Sort keys: name|sku|price|cost_price|stock_current. Stock filters: all|out|low|ok. Active filters: all|active|inactive. Tiebreaker por id para sort estable entre páginas.';
