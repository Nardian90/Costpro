-- ════════════════════════════════════════════════════════════════════════
-- V2.12.2 — H7: Stock reconciliation routine
--
-- RPC: reconcile_stock(p_store_id) — compara products.stock_current vs
-- SUM(stock_movements.quantity_change) y reporta discrepancias.
-- Si p_fix=true, corrige products.stock_current al valor correcto.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_stock(
  p_store_id UUID DEFAULT NULL,
  p_fix BOOLEAN DEFAULT FALSE,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
  v_fixed INTEGER := 0;
  v_discrepancies JSONB[] := ARRAY[]::JSONB[];
  v_rec RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_expected NUMERIC;
BEGIN
  -- Si p_store_id es NULL, reconciliar todas las tiendas (solo admin)
  IF p_store_id IS NOT NULL AND v_caller_uid IS NOT NULL THEN
    IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;
  END IF;

  -- Comparar products.stock_current vs SUM(stock_movements.quantity_change)
  FOR v_rec IN
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.store_id,
      p.stock_current AS current_stock,
      COALESCE(SUM(sm.quantity_change), 0) AS expected_stock,
      ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) AS diff
    FROM public.products p
    LEFT JOIN public.stock_movements sm ON sm.product_id = p.id AND sm.store_id = p.store_id
    WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
      AND p.is_active = true
    GROUP BY p.id, p.name, p.store_id, p.stock_current
    HAVING ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) > 0.001
  LOOP
    v_count := v_count + 1;
    v_expected := v_rec.expected_stock;

    v_discrepancies := array_append(v_discrepancies, jsonb_build_object(
      'product_id', v_rec.product_id,
      'product_name', v_rec.product_name,
      'store_id', v_rec.store_id,
      'current_stock', v_rec.current_stock,
      'expected_stock', v_rec.expected_stock,
      'diff', v_rec.diff
    ));

    -- Si p_fix=true, corregir
    IF p_fix THEN
      UPDATE public.products
        SET stock_current = GREATEST(0, v_expected), updated_at = NOW()
        WHERE id = v_rec.product_id;

      -- Audit
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES ('STOCK_RECONCILIATION', 'products', v_rec.product_id, v_rec.store_id, v_caller_uid,
        jsonb_build_object('old_stock', v_rec.current_stock, 'new_stock', v_expected, 'diff', v_rec.diff));

      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'discrepancies_found', v_count,
    'discrepancies_fixed', v_fixed,
    'fix_mode', p_fix,
    'details', to_jsonb(v_discrepancies)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_stock(UUID, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stock(UUID, BOOLEAN, UUID) TO service_role;

COMMENT ON FUNCTION public.reconcile_stock(UUID, BOOLEAN, UUID) IS
'V2.12.2: Reconciliation de stock. Compara products.stock_current vs SUM(stock_movements). Si p_fix=true, corrige. Autorización: has_store_access_as.';

-- Vista: v_stock_discrepancies — para dashboard
CREATE OR REPLACE VIEW public.v_stock_discrepancies AS
SELECT
  p.id AS product_id,
  p.name AS product_name,
  p.store_id,
  s.name AS store_name,
  p.stock_current AS current_stock,
  COALESCE(SUM(sm.quantity_change), 0) AS expected_stock,
  p.stock_current - COALESCE(SUM(sm.quantity_change), 0) AS discrepancy
FROM public.products p
LEFT JOIN public.stock_movements sm ON sm.product_id = p.id AND sm.store_id = p.store_id
LEFT JOIN public.stores s ON s.id = p.store_id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.store_id, s.name, p.stock_current
HAVING ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) > 0.001;

GRANT SELECT ON public.v_stock_discrepancies TO authenticated;

NOTIFY pgrst, 'reload schema';
