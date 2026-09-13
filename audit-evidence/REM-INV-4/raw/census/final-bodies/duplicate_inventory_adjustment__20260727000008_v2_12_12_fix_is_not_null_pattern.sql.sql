-- DECLARED FINAL STATE (Git) de duplicate_inventory_adjustment
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#11

CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_item RECORD;
  v_diff NUMERIC;
  v_new_stock NUMERIC;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  -- 1. Cargar ajuste original
  SELECT * INTO v_orig FROM public.inventory_adjustments WHERE id = p_original_id;
  IF v_orig IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;

  -- 2. Autorización (si v_uid es NULL → service_role bypass)
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_orig.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Crear nuevo ajuste (mismo reason, notes indicando duplicación)
  INSERT INTO public.inventory_adjustments (store_id, created_by, status, reason, notes)
  VALUES (
    v_orig.store_id,
    v_uid,
    'confirmed',
    v_orig.reason,
    COALESCE('Duplicada de ' || LEFT(p_original_id::text, 8) || ' — ' || COALESCE(v_orig.notes, ''), '')
  )
  RETURNING id INTO v_new_id;

  -- 4. Copiar items + aplicar stock atómicamente
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_original_id
  LOOP
    v_diff := v_item.counted_quantity - v_item.expected_quantity;

    -- Insert item (difference es GENERATED, no se especifica)
    INSERT INTO public.inventory_adjustment_items
      (adjustment_id, product_id, expected_quantity, counted_quantity)
    VALUES (v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity);

    -- Actualizar stock ATÓMICAMENTE (UPDATE stock_current = stock_current + diff)
    -- Esto evita race conditions: la DB garantiza serialización del UPDATE
    UPDATE public.products
      SET stock_current = stock_current + v_diff,
          updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_orig.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Kardex entry
    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value,
      reference_type, reference_id, reference_description, created_by
    )
    SELECT
      v_orig.store_id, v_item.product_id, 'adjustment', ABS(v_diff),
      COALESCE(p.cost_average, 0), ABS(v_diff) * COALESCE(p.cost_average, 0),
      COALESCE(v_new_stock, 0), COALESCE(p.cost_average, 0),
      COALESCE(v_new_stock, 0) * COALESCE(p.cost_average, 0),
      'adjustment', v_new_id,
      'Ajuste duplicado de ' || LEFT(p_original_id::text, 8), v_uid
    FROM public.products p
    WHERE p.id = v_item.product_id AND p.store_id = v_orig.store_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', v_new_id,
    'adjustment_number', LEFT(v_new_id::text, 8),
    'items_duplicated', v_count
  );
END;
$function$
