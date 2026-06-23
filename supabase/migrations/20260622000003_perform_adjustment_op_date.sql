-- ============================================================================
-- Extensión de p_operation_date a perform_inventory_adjustment
-- ----------------------------------------------------------------------------
-- perform_inventory_adjustment es el RPC usado por InventoryAdjustmentModal.
-- No estaba cubierto en la migración anterior (20260622000002).
-- Aquí añadimos el parámetro + validación + propagación a register_stock_movement.
-- ============================================================================

DROP FUNCTION IF EXISTS public.perform_inventory_adjustment(
  UUID, UUID, NUMERIC, TEXT, UUID, NUMERIC
);

CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(
  p_store_id UUID,
  p_product_id UUID,
  p_quantity_delta NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_unit_cost_adjustment NUMERIC DEFAULT NULL,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_nuevo_costo_total NUMERIC;
  v_nuevo_costo_unitario NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date);

  IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory WHERE store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := GREATEST(0, (v_stock_actual * v_costo_promedio_actual) - (ABS(p_quantity_delta) * v_costo_unitario_movimiento));
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, 0);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
  END IF;

  v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;

  -- Pasar p_operation_date a register_stock_movement para que el movimiento
  -- tenga la misma fecha efectiva que el ajuste.
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := p_user_id,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_reason := p_reason,
    p_unit_cost := v_costo_unitario_movimiento,
    p_operation_date := v_effective_date
  );

  UPDATE public.products
  SET cost_average = v_nuevo_costo_unitario, updated_at = v_effective_date
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'nuevo_stock', v_nuevo_stock,
    'nuevo_costo_total', v_nuevo_costo_total,
    'nuevo_costo_unitario', v_nuevo_costo_unitario,
    'movimiento_registrado', true
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(
  UUID, UUID, NUMERIC, TEXT, UUID, NUMERIC, TIMESTAMP WITH TIME ZONE
) TO authenticated;

COMMENT ON FUNCTION public.perform_inventory_adjustment(
  UUID, UUID, NUMERIC, TEXT, UUID, NUMERIC, TIMESTAMP WITH TIME ZONE
) IS
'RPC de ajuste de inventario (modal). p_operation_date (opcional) sujeto a validación forward-only. Si es NULL, usa NOW().';

-- Verificación
SELECT proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE proname = 'perform_inventory_adjustment' AND n.nspname = 'public';
