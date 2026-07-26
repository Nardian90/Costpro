-- ════════════════════════════════════════════════════════════════════════
-- V2.4.2 — RPC duplicate_inventory_adjustment: atómica, sin race conditions
--
-- PROBLEMA (C3 auditoría): El endpoint /api/inventory/adjustments/duplicate
-- usaba patrón read-modify-write (SELECT stock → UPDATE stock_current = newStock)
-- que pierde actualizaciones bajo concurrencia.
--
-- SOLUCIÓN: Una sola RPC SECURITY DEFINER que:
-- 1. Lee el ajuste original + items
-- 2. Crea el nuevo inventory_adjustment (INSERT)
-- 3. Copia los items (INSERT)
-- 4. Actualiza stock atómicamente: UPDATE products SET stock_current = stock_current + diff
-- 5. Crea kardex entries
-- Todo en una transacción PL/pgSQL (atómica por defecto).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment(
  p_original_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_item RECORD;
  v_diff NUMERIC;
  v_new_stock NUMERIC;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  -- 1. Cargar ajuste original
  SELECT * INTO v_orig FROM public.inventory_adjustments WHERE id = p_original_id;
  IF v_orig IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;

  -- 2. Autorización (si v_uid es NULL → service_role bypass)
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_orig.store_id) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.duplicate_inventory_adjustment(UUID, UUID) IS
'V2.4.2: Duplica un ajuste de inventario de forma atómica. Crea nuevo inventory_adjustment + items + aplica stock (UPDATE stock_current = stock_current + diff, atómico) + kardex entries. Reemplaza al patrón read-modify-write del endpoint /api/inventory/adjustments/duplicate.';
