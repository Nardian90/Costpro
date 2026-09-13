-- DECLARED FINAL STATE (Git) de get_available_stock
-- fuente: 20260802000004_v2_12_43_get_available_stock.sql stmt#0

CREATE OR REPLACE FUNCTION public.get_available_stock(
  p_store_id UUID,
  p_product_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stock_current NUMERIC;
  v_reserved NUMERIC;
  v_available NUMERIC;
BEGIN
  SELECT stock_current INTO v_stock_current
  FROM public.products
  WHERE id = p_product_id AND store_id = p_store_id;

  IF v_stock_current IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
  FROM public.inventory_reservations
  WHERE store_id = p_store_id
    AND product_id = p_product_id
    AND status = 'ACTIVE';

  v_available := v_stock_current - v_reserved;

  RETURN jsonb_build_object(
    'found', true,
    'stock_current', v_stock_current,
    'stock_reserved', v_reserved,
    'stock_available', v_available
  );
END;
$$
