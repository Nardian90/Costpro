-- DECLARED FINAL STATE (Git) de perform_inventory_adjustment
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#12

CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
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
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  -- V2.5 H2a: autorización por TIENDA
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  -- V2.5.5: usar products.stock_current (inventory.quantity tiene trigger inmutable)
  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
    v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;
  END IF;

  -- V2.5.5: UPDATE en products (no en inventory que tiene trigger)
  UPDATE public.products
    SET stock_current = v_nuevo_stock,
        cost_average = CASE WHEN p_quantity_delta > 0 THEN v_nuevo_costo_unitario ELSE cost_average END,
        updated_at = v_effective_date
    WHERE id = p_product_id AND store_id = p_store_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date,
    p_skip_access_check := (v_caller_uid IS NULL)  -- V2.5.5: bypass si service_role
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock, 'new_cost_average', v_costo_promedio_actual);
END;
$function$
