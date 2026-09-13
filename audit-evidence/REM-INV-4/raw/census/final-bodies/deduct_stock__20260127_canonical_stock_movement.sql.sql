-- DECLARED FINAL STATE (Git) de deduct_stock
-- fuente: 20260127_canonical_stock_movement.sql stmt#11

CREATE OR REPLACE FUNCTION public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := auth.uid(),
    p_quantity := -p_quantity,
    p_movement_type := 'adjustment',
    p_reason := 'Direct deduction via deduct_stock',
    p_sale_id := NULL,
    p_unit_cost := 0
  );
END;
$$
