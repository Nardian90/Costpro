-- SQL to fix missing get_paginated_products and add get_products_for_pos
-- This script should be run in the Supabase SQL Editor

-- 1. Create or Replace get_paginated_products
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
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  user_role_from_db user_role;
BEGIN
  -- Get the role of the current user from the profiles table
  SELECT role INTO user_role_from_db FROM public.profiles WHERE id = current_user_id;

  -- Server-side check for data integrity for non-admin/non-encargado users
  IF user_role_from_db NOT IN ('admin', 'encargado') AND p_store_id IS NULL THEN
    RAISE EXCEPTION 'p_store_id must be provided for this user role';
  END IF;

  RETURN QUERY
  WITH products_filtered AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.category,
      p.price,
      p.cost_price,
      p.min_stock,
      p.image_url,
      p.description,
      COUNT(*) OVER() as total_records
    FROM public.products p
    WHERE
      (p_search_term IS NULL OR p_search_term = '' OR p.name ILIKE ('%' || p_search_term || '%') OR p.sku ILIKE ('%' || p_search_term || '%'))
      AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
  )
  SELECT
    pf.id,
    pf.name,
    pf.sku,
    pf.category,
    pf.price,
    pf.cost_price,
    pf.min_stock,
    pf.image_url,
    pf.description,
    (
        SELECT COALESCE(SUM(i.quantity), 0)
        FROM public.inventory i
        WHERE i.product_id = pf.id
        AND (
          -- If p_store_id is null and user is admin/encargado, show global stock (sum)
          -- If p_store_id is provided, show only that store's stock
          (p_store_id IS NULL AND user_role_from_db IN ('admin', 'encargado'))
          OR i.store_id = p_store_id
        )
    )::numeric as stock_current,
    p_store_id as store_id,
    pf.total_records as total_count
  FROM products_filtered pf
  ORDER BY pf.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- 2. Create or Replace get_products_for_pos
-- This function is optimized for the Point of Sale, returning variants and all product fields.
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
  product_variants jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  user_role_from_db user_role;
BEGIN
  -- Get the role of the current user from the profiles table
  SELECT role INTO user_role_from_db FROM public.profiles WHERE id = current_user_id;

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
        SELECT COALESCE(SUM(i.quantity), 0)
        FROM public.inventory i
        WHERE i.product_id = p.id
        AND (
          (p_store_id IS NULL AND user_role_from_db IN ('admin', 'encargado'))
          OR i.store_id = p_store_id
        )
    )::numeric as stock_current,
    p.cost_average,
    p.min_stock,
    p_store_id as store_id,
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
    ) as product_variants
  FROM public.products p
  WHERE
    (p_search_term IS NULL OR p_search_term = '' OR p.name ILIKE ('%' || p_search_term || '%') OR p.sku ILIKE ('%' || p_search_term || '%'))
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
  ORDER BY p.name;
END;
$function$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_paginated_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_products TO service_role;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos TO service_role;
