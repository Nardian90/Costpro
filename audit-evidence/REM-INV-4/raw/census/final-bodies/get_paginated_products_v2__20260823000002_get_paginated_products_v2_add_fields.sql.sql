-- DECLARED FINAL STATE (Git) de get_paginated_products_v2
-- fuente: 20260823000002_get_paginated_products_v2_add_fields.sql stmt#5

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
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
    -- is_complete: True si tiene name, sku, price, cost_price, category, unit_of_measure
    (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
     AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
     AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
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
  LIMIT p_limit OFFSET p_offset;
END;
$function$
