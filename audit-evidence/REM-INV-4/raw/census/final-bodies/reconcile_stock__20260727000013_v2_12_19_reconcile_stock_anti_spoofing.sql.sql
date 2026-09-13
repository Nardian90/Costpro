-- DECLARED FINAL STATE (Git) de reconcile_stock
-- fuente: 20260727000013_v2_12_19_reconcile_stock_anti_spoofing.sql stmt#2

CREATE OR REPLACE FUNCTION public.reconcile_stock(
  p_store_id uuid DEFAULT NULL,
  p_fix boolean DEFAULT FALSE,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_fixed INTEGER := 0;
  v_skipped_negative INTEGER := 0;
  v_truncated BOOLEAN := FALSE;
  v_discrepancies JSONB[] := ARRAY[]::JSONB[];
  v_rec RECORD;
  -- V2.12.19: anti-spoofing guard V2.12.9
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_expected NUMERIC;
  v_user_is_admin BOOLEAN;
  v_max_details INTEGER := 500;
  v_inspection_logged BOOLEAN := FALSE;
BEGIN
  -- V2.12.10 (preservado): admin check + has_store_role check
  -- V2.12.19: anti-spoofing guard aplicado a v_caller_uid
  v_user_is_admin := public.is_admin();

  IF p_store_id IS NULL THEN
    -- Reconciliar todas las tiendas → requiere admin global
    -- V2.12.19: IS NULL OR NOT (consistencia V2.12.12 + V2.12.18)
    IF v_caller_uid IS NULL OR NOT v_user_is_admin THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_GLOBAL_RECONCILE';
    END IF;
  ELSE
    -- Reconciliar una tienda → requiere admin global o admin/manager de la tienda
    -- V2.12.19: IS NULL OR NOT (consistencia)
    IF v_caller_uid IS NULL OR NOT v_user_is_admin THEN
      IF NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text]) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
      END IF;
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

    IF array_length(v_discrepancies, 1) IS NULL OR array_length(v_discrepancies, 1) < v_max_details THEN
      v_discrepancies := array_append(v_discrepancies, jsonb_build_object(
        'product_id', v_rec.product_id,
        'product_name', v_rec.product_name,
        'store_id', v_rec.store_id,
        'current_stock', v_rec.current_stock,
        'expected_stock', v_rec.expected_stock,
        'diff', v_rec.diff,
        'skipped', (v_expected < 0)
      ));
    ELSE
      v_truncated := TRUE;
    END IF;

    -- H7-4: NO silenciar corrupción negativa con GREATEST(0, v_expected).
    IF v_expected < 0 THEN
      v_skipped_negative := v_skipped_negative + 1;

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'STOCK_RECONCILIATION_NEGATIVE',
        'products',
        v_rec.product_id,
        v_rec.store_id,
        v_caller_uid,
        jsonb_build_object(
          'current_stock', v_rec.current_stock,
          'expected_stock', v_rec.expected_stock,
          'diff', v_rec.diff,
          'fix_mode', p_fix,
          'reason', 'Negative expected stock — possible fraud or bug, manual review required'
        )
      );

      CONTINUE;
    END IF;

    IF p_fix THEN
      UPDATE public.products
        SET stock_current = v_expected, updated_at = NOW()
        WHERE id = v_rec.product_id;

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES ('STOCK_RECONCILIATION', 'products', v_rec.product_id, v_rec.store_id, v_caller_uid,
        jsonb_build_object('old_stock', v_rec.current_stock, 'new_stock', v_expected, 'diff', v_rec.diff));

      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  -- H7-7: Audit log resumen en modo inspección (p_fix=false)
  IF NOT p_fix AND v_count > 0 THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES (
      'STOCK_RECONCILIATION_INSPECT',
      'products',
      NULL,
      p_store_id,
      v_caller_uid,
      jsonb_build_object(
        'discrepancies_found', v_count,
        'discrepancies_skipped_negative', v_skipped_negative,
        'scope', CASE WHEN p_store_id IS NULL THEN 'all_stores' ELSE 'single_store' END,
        'reason', 'Stock reconciliation inspection — no fixes applied'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'discrepancies_found', v_count,
    'discrepancies_fixed', v_fixed,
    'discrepancies_skipped_negative', v_skipped_negative,
    'discrepancies_truncated', v_truncated,
    'fix_mode', p_fix,
    'details', to_jsonb(v_discrepancies)
  );
END;
$function$
