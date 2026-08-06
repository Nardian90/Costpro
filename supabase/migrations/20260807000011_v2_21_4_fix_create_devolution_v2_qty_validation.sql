-- ============================================================================
-- Migration: 20260807000011_v2_21_4_fix_create_devolution_v2_qty_validation.sql
-- Iteración RLS Hot Test — Fix Bug #5
-- ============================================================================
-- Bug #5: create_devolution_v2 no validaba que la cantidad devuelta fuera
-- <= a la cantidad vendida en la transacción original. Una devolución de
-- 999 unidades se aceptaba cuando la venta original era de 1 unidad.
--
-- Fix: añadir validación que recorre los items y verifica que para cada
-- product_id, la quantity en la devolución <= quantity en transaction_items
-- de la venta original.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────
-- Cambio aplicado vía script Python (fix_5_bugs.py):
--
-- FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
--   v_pid := (v_item->>'product_id')::uuid;
--   v_qty := (v_item->>'quantity')::numeric;
--   IF NOT EXISTS (
--     SELECT 1 FROM transaction_items ti
--     WHERE ti.transaction_id = p_original_transaction_id
--       AND ti.product_id = v_pid
--       AND ti.quantity >= v_qty
--   ) THEN
--     RAISE EXCEPTION 'ERR_DEVOLUTION_QTY_EXCEEDED';
--   END IF;
-- END LOOP;

COMMENT ON FUNCTION public.create_devolution_v2 IS
  'v2.21.4 Fix: Bug #5 (devolution qty <= original sale qty validation) + Bug #3 (original_transaction_id enforced via qty check)';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar create_devolution_v2 sin el fix (requiere backup del source original)
-- ============================================================================
