-- DECLARED FINAL STATE (Git) de record_sale_movement
-- fuente: 20260127_canonical_stock_movement.sql stmt#15

CREATE OR REPLACE FUNCTION public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_reference text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := auth.uid(),
    p_quantity := -ABS(p_quantity),
    p_movement_type := 'sale',
    p_reason := p_reference,
    p_sale_id := NULL,
    p_unit_cost := 0
  );
END;
$$
