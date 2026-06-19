-- ════════════════════════════════════════════════════════════════════════
-- Q1-Q7: Quick Wins de la auditoría contable-financiera
-- ════════════════════════════════════════════════════════════════════════

-- Q1: RPC void_reception_with_reversal — anula recepción CON reversión de stock
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(
  p_receipt_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Anulacion con reversion de inventario'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
BEGIN
  SELECT store_id INTO v_store_id FROM receipts WHERE id = p_receipt_id AND status = 'active';
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id;

    v_new_stock := COALESCE(v_current_stock, 0) - v_item.quantity;
    IF v_new_stock > 0 AND v_current_stock > 0 THEN
      v_new_avg := (v_current_stock * v_current_avg - v_item.quantity * v_item.unit_cost) / v_new_stock;
      IF v_new_avg < 0 THEN v_new_avg := 0; END IF;
    ELSE
      v_new_avg := v_current_avg;
    END IF;

    UPDATE products SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = NOW()
    WHERE id = v_item.product_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at)
    VALUES (v_item.product_id, v_store_id, 'reception_void', -v_item.quantity, v_item.unit_cost, p_reason, NOW());
  END LOOP;

  UPDATE receipts SET status = 'voided', updated_at = NOW()
  WHERE id = p_receipt_id AND status = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(UUID, UUID, TEXT) TO authenticated;

-- Q3: El CTE receipts_pending en get_batch_store_daily_kpis debe contar status='pending' (no 'active')
-- (Aplicado directamente en la BD)

-- Q4: Endurecer audit_logs INSERT policy
DROP POLICY IF EXISTS "audit_logs_insert_authenticated" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Q5: reset_store_data con keepCatalog preserva product_cost_sheets y store_cost_templates
-- (Aplicado directamente en la BD)

-- Q6: .refine(price >= cost) en schemas.ts (código TypeScript, no SQL)

-- Q7: Reconciliación de caja por método de pago (código TypeScript, no SQL)
