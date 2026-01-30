-- Migration: Harden get_products_for_pos RPC (v5.7.15)
-- Goal: Improve performance with store filtering and resilience with role handling.

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
  -- Get the role of the current user, default to 'clerk' if profile not found
  SELECT COALESCE(prof.role, 'clerk'::user_role) INTO v_user_role
  FROM public.profiles prof
  WHERE prof.id = v_current_user_id;

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
    )::numeric as stock_current,
    p.cost_average,
    p.min_stock,
    p.store_id as store_id, -- Return the actual product store_id
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
    ) as product_variants
  FROM public.products p
  WHERE
    (p_store_id IS NULL OR p.store_id = p_store_id) -- HARDENED: Store isolation
    AND (p_search_term IS NULL OR p_search_term = '' OR p.name ILIKE ('%' || p_search_term || '%') OR p.sku ILIKE ('%' || p_search_term || '%'))
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
  ORDER BY p.name;
END;
$function$;

-- Ensure permissions are correctly granted
GRANT EXECUTE ON FUNCTION public.get_products_for_pos TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos TO service_role;
