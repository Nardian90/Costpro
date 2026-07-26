-- ════════════════════════════════════════════════════════════════════════
-- V2.3.2 — FIX: reverse_adjustment usaba columna inexistente 'quantity_change'
-- La columna real en inventory_adjustment_items es 'difference'
-- (expected_quantity - counted_quantity, negativo si sobra, positivo si falta)
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reverse_adjustment(
  p_adjustment_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- FIX V2.3.2: usar 'difference' (columna real) en vez de 'quantity_change'
  FOR v_item IN
    SELECT product_id, difference FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Invertir el ajuste: si sumó X, ahora resta X (y viceversa)
    UPDATE public.products
      SET stock_current = stock_current - v_item.difference, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_adj.store_id, v_item.product_id, 'adjustment', ABS(v_item.difference), 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_adjustment_id, 'Reversión de ajuste', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'adjustment_id', p_adjustment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_adjustment TO authenticated, service_role;

COMMENT ON FUNCTION public.reverse_adjustment(UUID, TEXT, UUID) IS
'V2.3.2 (fix): Invierte un ajuste de inventario usando la columna "difference" (no quantity_change). Invierte el cambio de stock, marca como reversed.';
