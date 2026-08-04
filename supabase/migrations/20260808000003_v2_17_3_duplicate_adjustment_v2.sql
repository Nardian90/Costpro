-- ============================================================================
-- Migration: 20260808000003_v2_17_3_duplicate_adjustment_v2.sql
-- Iteración 11.3 — Fix B-11
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.duplicate_inventory_adjustment_v2;

CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment_v2(
  p_original_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
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

  -- 2. Auth
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. INSERT new adjustment
  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, updated_at
  ) VALUES (
    v_new_id, v_original.store_id, 'confirmed',
    'Duplicación de ajuste: ' || COALESCE(v_original.reason, ''),
    v_caller_uid, NOW(), NOW()
  );

  -- 4. FOR each item: copy + register_stock_movement + kardex
  FOR v_item IN SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_original_id LOOP
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity
    );

    -- register_stock_movement (NO UPDATE directo)
    IF v_diff <> 0 THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := v_original.store_id,
        p_user_id := v_caller_uid,
        p_quantity := v_diff,
        p_movement_type := 'adjustment',
        p_reference_doc := v_new_id::text,
        p_unit_cost := 0,
        p_reason := 'Duplicación de ajuste',
        p_operation_date := NOW(),
        p_skip_access_check := TRUE
      );

      -- kardex_entries
      INSERT INTO public.kardex_entries (
        store_id, product_id, movement_type, quantity, unit_cost, total_value,
        reference_type, reference_id, reference_description, created_at, created_by
      ) VALUES (
        v_original.store_id, v_item.product_id, 'adjustment', v_diff, 0, 0,
        'adjustment', v_new_id, 'Duplicación de ajuste',
        NOW(), v_caller_uid
      );
    END IF;
  END LOOP;

  -- 5. Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ADJUSTMENT_DUPLICATED_V2', 'inventory_adjustments', v_new_id::text, v_original.store_id, v_caller_uid,
    jsonb_build_object('original_id', p_original_id, 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','new_adjustment_id',v_new_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2 TO service_role;

COMMENT ON FUNCTION public.duplicate_inventory_adjustment_v2 IS
  'Iteración 11.3 (B-11): Duplicates adjustment using register_stock_movement + audit_logs.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.duplicate_inventory_adjustment_v2;
-- ============================================================================
