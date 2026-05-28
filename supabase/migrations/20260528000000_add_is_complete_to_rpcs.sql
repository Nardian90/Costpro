-- Update get_paginated_products to include is_complete and visible_en_tienda
CREATE OR REPLACE FUNCTION public.get_paginated_products(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  category text,
  price numeric,
  cost_price numeric,
  min_stock integer,
  image_url text,
  description text,
  stock_current numeric,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  visible_en_tienda boolean,
  is_complete boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
  WITH products_filtered AS (
    SELECT
      p.id AS prod_id,
      p.name AS prod_name,
      p.sku AS prod_sku,
      p.category AS prod_cat,
      p.price AS prod_price,
      p.cost_price AS prod_cost,
      p.min_stock AS prod_min,
      p.image_url AS prod_img,
      p.description AS prod_desc,
      p.store_id AS prod_store_id,
      p.is_active AS prod_active,
      p.visible_en_tienda AS prod_visible,
      p.is_complete AS prod_complete,
      COUNT(*) OVER() AS total_records
    FROM public.products p
    WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
      AND public.has_store_access(p.store_id)
      AND (
        p.tenant_id IS NULL
        OR p.tenant_id IS NOT DISTINCT FROM (
          SELECT s.tenant_id
          FROM public.stores s
          WHERE s.id = p.store_id
        )
      )
      AND (
        p_search_term IS NULL
        OR p_search_term = ''
        OR p.name ILIKE ('%' || p_search_term || '%')
        OR p.sku ILIKE ('%' || p_search_term || '%')
      )
      AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
    ORDER BY p.name ASC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    pf.prod_id,
    pf.prod_name,
    pf.prod_sku,
    pf.prod_cat,
    pf.prod_price,
    pf.prod_cost,
    pf.prod_min,
    pf.prod_img,
    pf.prod_desc,
    (
      SELECT COALESCE(SUM(inv.quantity), 0)
      FROM public.inventory inv
      WHERE inv.product_id = pf.prod_id
        AND inv.store_id = pf.prod_store_id
    )::numeric,
    pf.prod_store_id,
    pf.prod_active,
    EXISTS (
      SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pf.prod_id
      UNION ALL
      SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pf.prod_id
      UNION ALL
      SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = pf.prod_id
    ) AS has_movements,
    pf.prod_visible,
    pf.prod_complete,
    pf.total_records
  FROM products_filtered pf;
END;
$function$;

-- Update get_products_for_pos to include is_complete and visible_en_tienda
CREATE OR REPLACE FUNCTION public.get_products_for_pos(
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text
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
  visible_en_tienda boolean,
  is_complete boolean,
  product_variants jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
    p.id,
    p.name,
    p.description,
    p.sku,
    p.price,
    p.cost_price,
    p.image_url,
    p.category,
    p.unit_of_measure,
    p.supplier,
    p.created_at,
    p.updated_at,
    (
      SELECT COALESCE(SUM(inv.quantity), 0)
      FROM public.inventory inv
      WHERE inv.product_id = p.id
        AND inv.store_id = p.store_id
    )::numeric,
    p.cost_average,
    p.min_stock,
    p.store_id,
    p.is_active,
    EXISTS (
      SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
      UNION ALL
      SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
      UNION ALL
      SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id
    ) AS has_movements,
    p.visible_en_tienda,
    p.is_complete,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', pv.id,
          'name', pv.name,
          'sku', pv.sku,
          'price', pv.price,
          'conversion_factor', pv.conversion_factor
        ))
        FROM public.product_variants pv
        WHERE pv.product_id = p.id
      ),
      '[]'::jsonb
    )
  FROM public.products p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND public.has_store_access(p.store_id)
    AND (
      p.tenant_id IS NULL
      OR p.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = p.store_id
      )
    )
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR p.name ILIKE ('%' || p_search_term || '%')
      OR p.sku ILIKE ('%' || p_search_term || '%')
    )
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
  ORDER BY p.name ASC;
END;
$function$;
