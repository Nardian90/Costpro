-- DECLARED FINAL STATE (Git) de validate_post_restore
-- fuente: 20260802000007_v2_12_46_restore_rpc_preview.sql stmt#10

CREATE OR REPLACE FUNCTION public.validate_post_restore(
  p_store_id UUID,
  p_backup_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_inventory_count INTEGER;
  v_movements_count INTEGER;
  v_products_count INTEGER;
  v_kardex_count INTEGER;
  v_inventory_mismatches INTEGER := 0;
  v_trigger_failures INTEGER := 0;
  v_legacy_discrepancies INTEGER := 0;
  v_backup_inventory_count INTEGER := 0;
  v_backup_products_count INTEGER := 0;
  v_inventory_backup_jsonb JSONB;
  v_product_id UUID;
  v_backup_qty NUMERIC;
  v_actual_qty NUMERIC;
  v_row JSONB;
BEGIN
  -- Conteos actuales post-restore
  SELECT COUNT(*) INTO v_inventory_count
  FROM public.inventory WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_movements_count
  FROM public.stock_movements WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_products_count
  FROM public.products WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_kardex_count
  FROM public.kardex_entries WHERE store_id = p_store_id;

  -- Si se proporciona el backup, validar consistencia
  IF p_backup_payload IS NOT NULL THEN
    v_inventory_backup_jsonb := COALESCE(p_backup_payload->'tables'->'inventory', '[]'::jsonb);
    v_backup_inventory_count := jsonb_array_length(v_inventory_backup_jsonb);

    v_backup_products_count := jsonb_array_length(
      COALESCE(p_backup_payload->'tables'->'products', '[]'::jsonb)
    );

    -- CHECK 1 (CRÍTICO): inventory.quantity restaurado == backup
    -- Para cada fila en inventory, verificar que existe en el backup con la misma quantity
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_inventory_backup_jsonb) LOOP
      v_product_id := (v_row->>'product_id')::UUID;
      v_backup_qty := (v_row->>'quantity')::NUMERIC;

      SELECT quantity INTO v_actual_qty
      FROM public.inventory
      WHERE store_id = p_store_id AND product_id = v_product_id;

      IF v_actual_qty IS NULL THEN
        -- Fila del backup no existe en inventory restaurado
        v_inventory_mismatches := v_inventory_mismatches + 1;
      ELSIF v_actual_qty != v_backup_qty THEN
        -- Cantidad no coincide
        v_inventory_mismatches := v_inventory_mismatches + 1;
      END IF;
    END LOOP;

    -- También verificar filas en inventory restaurado que NO están en el backup
    SELECT count(*) INTO v_inventory_mismatches
    FROM public.inventory i
    WHERE i.store_id = p_store_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_inventory_backup_jsonb) AS b
        WHERE (b->>'product_id')::UUID = i.product_id
          AND (b->>'quantity')::NUMERIC = i.quantity
      );

    -- CHECK 2 (HIGH): products.stock_current == inventory.quantity
    SELECT COUNT(*) INTO v_trigger_failures
    FROM public.products p
    JOIN public.inventory i ON i.product_id = p.id AND i.store_id = p.store_id
    WHERE p.store_id = p_store_id
      AND p.stock_current != i.quantity;

    -- CHECK 3 (WARN): inventory != SUM(stock_movements)
    -- Esperado para datos legacy (4 productos en Puerto Padre)
    SELECT COUNT(*) INTO v_legacy_discrepancies
    FROM (
      SELECT i.product_id, i.quantity as inv_qty,
             COALESCE(SUM(sm.quantity_change), 0) as mov_sum
      FROM public.inventory i
      LEFT JOIN public.stock_movements sm
        ON sm.product_id = i.product_id AND sm.store_id = i.store_id
      WHERE i.store_id = p_store_id
      GROUP BY i.product_id, i.quantity
    ) t
    WHERE inv_qty != mov_sum;
  END IF;

  v_result := jsonb_build_object(
    'validated_at', NOW(),
    'store_id', p_store_id,
    'counts', jsonb_build_object(
      'inventory', v_inventory_count,
      'stock_movements', v_movements_count,
      'products', v_products_count,
      'kardex_entries', v_kardex_count
    ),
    'backup_counts', jsonb_build_object(
      'inventory', v_backup_inventory_count,
      'products', v_backup_products_count
    ),
    'checks', jsonb_build_object(
      'inventory_matches_backup', jsonb_build_object(
        'status', CASE WHEN v_inventory_mismatches = 0 THEN 'PASS' ELSE 'FAIL' END,
        'mismatches', v_inventory_mismatches,
        'severity', 'CRITICAL',
        'description', 'inventory.quantity restaurado debe coincidir con el backup'
      ),
      'products_stock_current_consistency', jsonb_build_object(
        'status', CASE WHEN v_trigger_failures = 0 THEN 'PASS' ELSE 'FAIL' END,
        'failures', v_trigger_failures,
        'severity', 'HIGH',
        'description', 'products.stock_current debe ser igual a inventory.quantity'
      ),
      'inventory_movements_legacy_discrepancies', jsonb_build_object(
        'status', 'WARN',
        'discrepancies', v_legacy_discrepancies,
        'severity', 'INFO',
        'description', 'inventory.quantity != SUM(stock_movements) — esperado para datos legacy'
      )
    ),
    'overall_status', CASE
      WHEN v_inventory_mismatches > 0 THEN 'FAIL'
      WHEN v_trigger_failures > 0 THEN 'FAIL'
      ELSE 'PASS'
    END
  );

  RETURN v_result;
END;
$$
