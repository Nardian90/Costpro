-- DECLARED FINAL STATE (Git) de get_low_stock_count
-- fuente: 20260630120000_create_get_low_stock_count_rpc.sql stmt#0

CREATE OR REPLACE FUNCTION public.get_low_stock_count(p_store_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.products
  WHERE
    (p_store_id IS NULL OR store_id = p_store_id)
    AND is_active = true
    AND stock_current > 0
    AND min_stock IS NOT NULL
    AND min_stock > 0
    AND stock_current <= min_stock;
$$
