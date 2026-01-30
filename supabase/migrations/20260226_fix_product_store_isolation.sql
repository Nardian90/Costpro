-- Migration: Fix Product Store Isolation in RPCs
-- Date: 2026-02-26
-- Description: Ensures that get_paginated_products and get_products_for_pos filter by store_id
-- at the database level, preventing products from other stores from appearing in the results.

BEGIN;

-- 1. Update get_paginated_products
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
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_user_id uuid := auth.uid();
  v_user_role user_role;
BEGIN
  -- Get the role of the current user from the profiles table
  SELECT prof.role INTO v_user_role FROM public.profiles prof WHERE prof.id = v_current_user_id;

  -- Server-side check for data integrity for non-admin/non-encargado users
  IF v_user_role NOT IN ('admin', 'encargado') AND p_store_id IS NULL THEN
    RAISE EXCEPTION 'p_store_id must be provided for this user role';
  END IF;

  RETURN QUERY
  WITH products_filtered AS (
    SELECT
      p.id as prod_id,
      p.name as prod_name,
      p.sku as prod_sku,
      p.category as prod_cat,
      p.price as prod_price,
      p.cost_price as prod_cost,
      p.min_stock as prod_min,
      p.image_url as prod_img,
      p.description as prod_desc,
      p.is_active as prod_active,
      COUNT(*) OVER() as total_records
    FROM public.products p
    WHERE
      -- STORE ISOLATION FIX: Filter by p_store_id if provided
      (p_store_id IS NULL OR p.store_id = p_store_id)
      AND (p_search_term IS NULL OR p_search_term = '' OR p.name ILIKE ('%' || p_search_term || '%') OR p.sku ILIKE ('%' || p_search_term || '%'))
      AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
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
        AND (
          (p_store_id IS NULL AND v_user_role IN ('admin', 'encargado'))
          OR inv.store_id = p_store_id
        )
    )::numeric,
    p_store_id,
    pf.prod_active,
    EXISTS (
        SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pf.prod_id
        UNION ALL
        SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pf.prod_id
        UNION ALL
        SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = pf.prod_id
    ) as has_movements,
    pf.total_records
  FROM products_filtered pf
  ORDER BY pf.prod_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- 2. Update get_products_for_pos
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
  product_variants jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_user_id uuid := auth.uid();
  v_user_role user_role;
BEGIN
  -- Get the role of the current user from the profiles table
  SELECT prof.role INTO v_user_role FROM public.profiles prof WHERE prof.id = v_current_user_id;

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
        AND (
          (p_store_id IS NULL AND v_user_role IN ('admin', 'encargado'))
          OR inv.store_id = p_store_id
        )
    )::numeric,
    p.cost_average,
    p.min_stock,
    p_store_id,
    p.is_active,
    EXISTS (
        SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
        UNION ALL
        SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
        UNION ALL
        SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id
    ) as has_movements,
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
  WHERE
    -- STORE ISOLATION FIX: Filter by p_store_id if provided
    (p_store_id IS NULL OR p.store_id = p_store_id)
    AND (p_search_term IS NULL OR p_search_term = '' OR p.name ILIKE ('%' || p_search_term || '%') OR p.sku ILIKE ('%' || p_search_term || '%'))
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
  ORDER BY p.name;
END;
$function$;

COMMIT;
