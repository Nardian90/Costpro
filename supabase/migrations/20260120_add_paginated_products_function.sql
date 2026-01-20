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
  store_id uuid, -- This will be the p_store_id passed in, for client context
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  user_role_from_db text;
BEGIN
  -- Get the role of the current user from the profiles table
  -- Use coalesce to handle cases where a profile might not exist, defaulting to a restrictive role
  SELECT COALESCE(role, 'clerk') INTO user_role_from_db FROM public.profiles WHERE id = current_user_id;

  -- Server-side check for data integrity for non-admin users
  IF user_role_from_db <> 'admin' AND p_store_id IS NULL THEN
    RAISE EXCEPTION 'p_store_id must be provided for non-admin users';
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
      COUNT(*) OVER() as total_records -- Use window function to count total matching rows efficiently
    FROM public.products p
    WHERE
      -- Search filter for name and SKU (case-insensitive)
      (p_search_term IS NULL OR p_search_term = '' OR p.name ILIKE ('%' || p_search_term || '%') OR p.sku ILIKE ('%' || p_search_term || '%'))
      -- Category filter
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
    -- Calculate stock for the filtered and paginated products
    (
        SELECT COALESCE(SUM(i.quantity), 0)
        FROM public.inventory i
        WHERE i.product_id = pf.id
        AND (user_role_from_db = 'admin' OR i.store_id = p_store_id)
    )::numeric as stock_current,
    p_store_id as store_id,
    pf.total_records as total_count
  FROM products_filtered pf
  ORDER BY pf.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
