-- ============================================================================
-- FIX: confirm_pending_reception debe usar reception_date del receipt como fallback
-- ----------------------------------------------------------------------------
-- Bug: cuando se confirma una recepción pendiente, los stock_movements se
-- crean con NOW() en lugar del reception_date del receipt.
--
-- Esto hace que la fecha MAX de la tienda sea hoy (cuando se confirmó)
-- en lugar de la fecha real de la recepción.
--
-- Fix:
-- 1. Modificar confirm_pending_reception para hacer COALESCE(p_operation_date, reception_date, NOW())
-- 2. Actualizar los stock_movements existentes que tienen fecha incorrecta
-- ============================================================================

-- ============================================================
-- 1. Fix confirm_pending_reception: usar reception_date como fallback
-- ============================================================

DROP FUNCTION IF EXISTS public.confirm_pending_reception(UUID, UUID, TIMESTAMP WITH TIME ZONE);

CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id UUID,
  p_user_id UUID,
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_store_id UUID;
  v_receipt_date TIMESTAMP WITH TIME ZONE;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- FIX: obtener reception_date del receipt para usar como fallback
  SELECT store_id, reception_date INTO v_store_id, v_receipt_date
  FROM receipts WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  -- FIX: prioridad: p_operation_date > reception_date del receipt > NOW()
  v_effective_date := COALESCE(p_operation_date, v_receipt_date, NOW());

  -- Validación forward-only per-store
  PERFORM public.validate_operation_date(v_effective_date, v_store_id);

  FOR v_item IN SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;
    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_item.unit_cost) / v_new_stock
      ELSE v_item.unit_cost END;
    UPDATE products SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    -- FIX: usar v_effective_date (que incluye reception_date) en movement_date y created_at
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_item.quantity, v_item.unit_cost,
            'Confirmacion recepcion', v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  -- FIX: actualizar el receipt con la fecha efectiva
  UPDATE receipts SET status = 'active', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(UUID, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 2. Fix datos existentes: actualizar stock_movements con fecha incorrecta
-- ============================================================
-- Los stock_movements creados por "Confirmacion recepcion" tienen
-- movement_date = NOW() (fecha de confirmación) en lugar de
-- reception_date (fecha real de la recepción).
-- Los actualizamos para que coincidan con el reception_date del receipt.

UPDATE stock_movements sm
SET
  movement_date = r.reception_date,
  created_at = r.reception_date
FROM receipts r
WHERE sm.reference_doc = 'Confirmacion recepcion'
  AND sm.store_id = r.store_id
  AND r.reception_date IS NOT NULL
  AND sm.movement_date::date != r.reception_date::date;

-- ============================================================
-- 3. Verificación
-- ============================================================

SELECT
  'stock_movements_after_fix' AS check_name,
  COUNT(*) AS total_updated,
  MIN(movement_date)::text AS min_date,
  MAX(movement_date)::text AS max_date
FROM stock_movements
WHERE reference_doc = 'Confirmacion recepcion';
