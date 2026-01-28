-- Migration: Atomic Inventory Adjustment with WAC calculation
-- Author: Jules
-- Date: 2026-01-28

BEGIN;

-- 1. Create the atomic adjustment function
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(
  p_product_id uuid,
  p_store_id uuid,
  p_user_id uuid,
  p_quantity_delta integer,
  p_unit_cost_adjustment numeric,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_actual integer;
  v_costo_promedio_actual numeric;
  v_costo_total_actual numeric;
  v_nuevo_stock integer;
  v_nuevo_costo_total numeric;
  v_nuevo_costo_unitario numeric;
  v_costo_unitario_movimiento numeric;
BEGIN
  -- 1. Get current values
  -- Get stock from active store
  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory
  WHERE store_id = p_store_id AND product_id = p_product_id;

  -- Get global average cost
  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products
  WHERE id = p_product_id;

  v_costo_total_actual := v_stock_actual * v_costo_promedio_actual;

  -- 2. Calculate New Values (Weighted Average Cost Logic)
  -- Límite en 0 para stock
  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    -- CASO: Reducción de Stock
    -- Si p_unit_cost_adjustment es NULL, usar promedio actual (Salida Estándar)
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := GREATEST(0, v_costo_total_actual - (ABS(p_quantity_delta) * v_costo_unitario_movimiento));
  ELSIF p_quantity_delta > 0 THEN
    -- CASO: Incremento de Stock
    -- Si p_unit_cost_adjustment es NULL, usar 0 (Dilución)
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, 0);
    v_nuevo_costo_total := v_costo_total_actual + (p_quantity_delta * v_costo_unitario_movimiento);
  ELSE
    -- CASO: Ajuste de solo valor
    v_costo_unitario_movimiento := p_unit_cost_adjustment;
    v_nuevo_costo_total := v_stock_actual * v_costo_unitario_movimiento;
  END IF;

  -- Guardrail: Stock Cero = Valor Cero
  IF v_nuevo_stock = 0 THEN
    v_nuevo_costo_total := 0;
  END IF;

  -- Cálculo de nuevo costo unitario promedio
  IF v_nuevo_stock > 0 THEN
    v_nuevo_costo_unitario := v_nuevo_costo_total / v_nuevo_stock;
  ELSE
    v_nuevo_costo_unitario := 0;
  END IF;

  -- 3. Register Stock Movement
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := p_user_id,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_reason := p_reason,
    p_sale_id := NULL,
    p_unit_cost := v_costo_unitario_movimiento,
    p_notes := 'Ajuste manual: ' || p_reason
  );

  -- 4. Update Product Catalog (Global Average Cost)
  UPDATE public.products
  SET cost_average = v_nuevo_costo_unitario,
      updated_at = now()
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'nuevo_stock', v_nuevo_stock,
    'nuevo_costo_total', v_nuevo_costo_total,
    'nuevo_costo_unitario', v_nuevo_costo_unitario,
    'movimiento_registrado', true
  );
END;
$$;

COMMIT;
