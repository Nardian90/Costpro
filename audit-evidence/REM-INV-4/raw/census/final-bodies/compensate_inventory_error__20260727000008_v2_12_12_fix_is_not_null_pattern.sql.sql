-- DECLARED FINAL STATE (Git) de compensate_inventory_error
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#5

CREATE OR REPLACE FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_quantity numeric;
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar movimiento original
  SELECT * INTO v_orig FROM public.stock_movements
  WHERE id = p_original_movement_id AND store_id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MOVEMENT_NOT_FOUND';
  END IF;

  -- Compensación: invertir el quantity_change
  v_new_quantity := -v_orig.quantity_change;

  -- Registrar movimiento compensatorio
  PERFORM public.register_stock_movement(
    p_product_id := v_orig.product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := v_new_quantity,
    p_movement_type := 'adjustment',
    p_unit_cost := v_orig.unit_cost,
    p_reason := 'COMPENSATION: ' || COALESCE(p_reason, 'inventory error'),
    p_operation_date := NOW(),
    p_skip_access_check := (v_caller_uid IS NULL)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'original_movement_id', p_original_movement_id,
    'compensation_quantity', v_new_quantity,
    'product_id', v_orig.product_id
  );
END;
$function$
