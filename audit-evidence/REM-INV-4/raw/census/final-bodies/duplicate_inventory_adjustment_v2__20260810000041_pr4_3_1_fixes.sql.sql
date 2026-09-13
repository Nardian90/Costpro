-- DECLARED FINAL STATE (Git) de duplicate_inventory_adjustment_v2
-- fuente: 20260810000041_pr4_3_1_fixes.sql stmt#8

CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment_v2(
  p_original_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_new_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
BEGIN
  -- 1. SELECT FOR UPDATE original
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND';
  END IF;

  -- 2. Autorización (patrón canónico v2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. INSERT new adjustment
  --    PR-4.3.1 Fix: usar 'reason' (enum) en vez de 'adjustment_type' (inexistente)
  --    No incluir 'updated_at' (no existe en inventory_adjustments)
  --    No incluir 'difference' (es GENERATED en inventory_adjustment_items)
  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_new_id, v_original.store_id, 'confirmed',
    v_original.reason,
    v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  -- 4. FOR each item: copy + register_stock_movement (NO INSERT directo a kardex)
  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_original_id
  LOOP
    -- PR-4.3.1 Fix: usar expected_quantity, counted_quantity (no expected_qty, counted_qty)
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);

    IF v_diff = 0 THEN
      CONTINUE;
    END IF;

    -- PR-4.3.1 Fix: no incluir difference en el INSERT (es GENERATED)
    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity
    );

    -- register_stock_movement genera stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_new_id,
      p_unit_cost := 0,
      p_reason := 'Duplicación de ajuste'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement genera la kardex con
    -- movement_type='adjustment'
  END LOOP;

  -- 5. Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ADJUSTMENT_DUPLICATED_V2', 'inventory_adjustments', v_new_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('original_id', p_original_id, 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','new_adjustment_id',v_new_id);
END;
$function$
