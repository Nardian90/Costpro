-- DECLARED FINAL STATE (Git) de apply_physical_count
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#1

CREATE OR REPLACE FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_apply_zero_diffs boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_applied INTEGER := 0;
  v_discrepancies INTEGER := 0;
  v_total_value NUMERIC := 0;
BEGIN
  SELECT * INTO v_count FROM public.physical_counts WHERE id = p_count_id FOR UPDATE;
  IF v_count IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;
  IF v_count.status != 'counted' AND v_count.status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATE: solo se pueden aplicar conteos en estado counted o in_progress';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Aplicar cada item con diferencia
  FOR v_item IN
    SELECT * FROM public.physical_count_items
    WHERE count_id = p_count_id
      AND counted_quantity IS NOT NULL
      AND (p_apply_zero_diffs OR difference != 0)
  LOOP
    -- Actualizar stock del producto
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_count.store_id;

    -- Registrar movimiento de stock
    -- V2.9: skip_access_check=TRUE porque ya validamos con has_store_access_as arriba
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_count.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.difference,
      p_movement_type := 'adjustment',
      p_unit_cost := v_item.unit_cost,
      p_reason := 'Conteo físico ' || v_count.count_number,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_applied := v_applied + 1;
    IF v_item.difference != 0 THEN
      v_discrepancies := v_discrepancies + 1;
      v_total_value := v_total_value + v_item.value_discrepancy;
    END IF;
  END LOOP;

  -- Marcar como aplicado
  UPDATE public.physical_counts
    SET status = 'applied',
        applied_at = NOW(),
        applied_by = v_caller_uid,
        total_discrepancies = v_discrepancies,
        total_value_discrepancy = v_total_value
    WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'count_id', p_count_id,
    'items_applied', v_applied,
    'discrepancies', v_discrepancies,
    'total_value_discrepancy', v_total_value
  );
END;
$function$
