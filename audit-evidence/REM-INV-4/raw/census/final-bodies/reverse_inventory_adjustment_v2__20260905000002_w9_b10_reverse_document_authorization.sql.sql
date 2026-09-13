-- DECLARED FINAL STATE (Git) de reverse_inventory_adjustment_v2
-- fuente: 20260905000002_w9_b10_reverse_document_authorization.sql stmt#1

CREATE OR REPLACE FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_counter_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_original.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_original.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo ajustes confirmed pueden revertirse (status=%)', v_original.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.can_reverse_document(v_caller_uid, v_original.store_id, 'adjustment') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de ajuste requiere rol admin/manager/encargado en la tienda';
  END IF;

  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_counter_id, v_original.store_id, 'confirmed',
    v_original.reason, v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);
    IF v_diff = 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_counter_id, v_item.product_id, v_item.counted_quantity, v_item.expected_quantity
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_counter_id,
      p_unit_cost := 0,
      p_reason := 'Reversión de ajuste: ' || COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = NOW(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_ADJUSTMENT_V2', 'inventory_adjustments', p_adjustment_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'counter_adjustment_id', v_counter_id,
      'items_reversed', v_count, 'old_status', v_original.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_ADJUSTMENT'));

  RETURN jsonb_build_object('status', 'success', 'adjustment_id', p_adjustment_id,
    'counter_adjustment_id', v_counter_id, 'items_reversed', v_count);
END;
$function$
