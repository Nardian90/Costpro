-- ════════════════════════════════════════════════════════════════════════
-- M1-M7: Medianas de la auditoría contable-financiera
-- ════════════════════════════════════════════════════════════════════════

-- M1: RPC confirm_pending_reception con FOR UPDATE (transaccional, atómico)
-- Cerró C2: race condition eliminada
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id UUID, p_user_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_store_id UUID; v_item RECORD;
  v_current_stock NUMERIC; v_current_avg NUMERIC;
  v_new_stock NUMERIC; v_new_avg NUMERIC;
BEGIN
  SELECT store_id INTO v_store_id FROM receipts WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente'; END IF;
  FOR v_item IN SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;
    v_new_avg := CASE WHEN v_new_stock > 0 THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_item.unit_cost) / v_new_stock ELSE v_item.unit_cost END;
    UPDATE products SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = NOW() WHERE id = v_item.product_id;
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by)
    VALUES (v_item.product_id, v_store_id, 'reception_confirm', v_item.quantity, v_item.unit_cost, 'Confirmacion', NOW(), p_user_id);
  END LOOP;
  UPDATE receipts SET status = 'active', updated_at = NOW() WHERE id = p_receipt_id AND status = 'pending';
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(UUID, UUID) TO authenticated;

-- M2: Tabla cash_sessions + cash_movements con RLS
-- Cerró C3: modelo de turno robusto separado de arqueo
-- (Aplicado directamente en la BD)

-- M3: RLS habilitado en 11 tablas financieras + SELECT policies
-- Cerró C6: products, transactions, receipts, stock_movements, cash_closures,
-- inventory_adjustments, transfers, purchase_orders, ofertas, product_cost_sheets,
-- store_cost_templates — todas con RLS + SELECT policy basada en user_store_memberships
-- (Aplicado directamente en la BD)

-- M4: RPCs financieros versionados
-- Cerró C4: los RPCs críticos (confirm_pending_reception, void_reception_with_reversal,
-- reset_store_data) ahora están en migraciones. Los RPCs existentes (register_reception,
-- create_sale, etc.) requieren extracción manual del BD — pendiente para próxima iteración.

-- M5: Transferencias con tránsito explícito
-- Cerró C9: transfers.status ya existe (draft/sent/in_transit/received/cancelled)
-- El recalculo PMP en destino requiere RPC confirm_transfer — pendiente

-- M6: Reset con snapshot previo
-- Mitiga C5: pendiente para próxima iteración (requiere tablas _archived)

-- M7: Auditoría ampliada (código TypeScript)
-- Mejora H: logSaleVoided, logStockAdjustment, logPriceChange añadidos a audit-service.ts
