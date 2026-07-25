-- ════════════════════════════════════════════════════════════════════════
-- Fix reset_store_data RPC + create store_reset_snapshots table
-- ════════════════════════════════════════════════════════════════════════
-- BUG: La RPC reset_store_data existente NO borra production_orders ni
-- production_order_items antes de borrar products, causando FK violation:
--   ERROR: update or delete on table "products" violates foreign key
--   constraint "production_order_items_product_id_fkey" on table
--   "production_order_items"
--
-- Esto hace que el reset de cualquier tienda con órdenes de producción
-- falle con HTTP 500. El snapshot pre-reset en store_reset_snapshots
-- también falla porque esa tabla no existe.
--
-- Esta migración:
--   1. Crea la tabla store_reset_snapshots (referenciada por la API route)
--   2. Reemplaza reset_store_data con una versión que borra TODAS las
--      tablas que referencian products antes de borrar products.
--
-- Tablas adicionales que ahora se borran (faltantes en la RPC anterior):
--   - production_order_items (via order_id IN production_orders)
--   - production_orders (store_id)
--   - sales_transactions (store_id) — ventas manuales para comisiones
--   - commission_payments (store_id)
--   - commission_rules (store_id)
--   - workers (store_id) — después de commissions, sin FK a products
--   - cash_sessions (store_id) — sesiones de caja abiertas
--   - store_exchange_rates (store_id)
--   - store_notifications (store_id) — flush de notificaciones antiguas
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Crear tabla store_reset_snapshots (referenciada por API route)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_reset_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  initiated_by UUID,  -- profiles.id (no FK para evitar fallos si se borra el user)
  keep_catalog BOOLEAN NOT NULL DEFAULT false,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_reset_snapshots_store_id
  ON public.store_reset_snapshots(store_id, created_at DESC);

-- RLS: solo admins pueden leer/escribir snapshots
ALTER TABLE public.store_reset_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_reset_snapshots_admin_all ON public.store_reset_snapshots
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

COMMENT ON TABLE public.store_reset_snapshots IS
'Snapshot pre-reset de una tienda. Se captura ANTES de invocar reset_store_data
para permitir recuperación manual. El snapshot puede ser completo (<=5000 rows)
o solo resumen (counts por tabla) si el volumen es mayor.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Reemplazar reset_store_data RPC
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reset_store_data(
  target_store_id UUID,
  p_keep_catalog BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ── 1. Borrar tablas operacionales hijas (siempre) ──

  -- transaction_items (hija de transactions)
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  -- transactions (ventas POS)
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- receipt_items (hija de receipts)
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  -- receipts (recepciones de proveedores)
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- Movimientos de stock
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- Cierres de caja (turnos)
  DELETE FROM cash_closures WHERE store_id = target_store_id;

  -- Sesiones de caja abiertas
  DELETE FROM cash_sessions WHERE store_id = target_store_id;

  -- Ajustes de inventario
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );

  -- Transferencias (enviadas y recibidas)
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;

  -- Órdenes de compra
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- ── FIX: production_order_items y production_orders ──
  -- ANTES de borrar products, hay que borrar production_order_items (que
  -- tiene FK product_id → products.id) y production_orders.
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- ── FIX: commissions + workers ──
  -- commission_payments y commission_rules tienen FK a workers.
  -- workers tiene FK a stores. Borrar commissions primero, luego workers.
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;

  -- ── FIX: sales_transactions (ventas manuales para comisiones) ──
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;

  -- Tipos de cambio por tienda
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- Fichas de costo y plantillas FC se preservan si p_keep_catalog=true.
  -- Solo se borran si p_keep_catalog=false (borrado completo del catálogo).
  IF NOT p_keep_catalog THEN
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    DELETE FROM store_cost_templates WHERE store_id = target_store_id;
  END IF;

  -- ── 2. Catálogo de productos ──

  IF p_keep_catalog THEN
    -- Mantener catálogo pero resetear SOLO campos operacionales a 0.
    -- NO resetear cost_price ni price (son datos del catálogo).
    -- Solo resetear stock_current y cost_average (operacionales).
    UPDATE products
    SET
      stock_current = 0,
      cost_average = 0,
      updated_at = NOW()
    WHERE store_id = target_store_id;
  ELSE
    -- Borrar catálogo completo
    DELETE FROM product_variants WHERE product_id IN (
      SELECT id FROM products WHERE store_id = target_store_id
    );
    DELETE FROM products WHERE store_id = target_store_id;
  END IF;

  -- ── 3. Notificaciones antiguas de la tienda (opcional, limpieza) ──
  -- Solo se borran las notificaciones de reset (mantenemos otras notificaciones)
  DELETE FROM store_notifications
  WHERE store_id = target_store_id
    AND type = 'store_reset_warning';

  RAISE NOTICE 'Store % reset completed. Keep catalog: %', target_store_id, p_keep_catalog;
END;
$$;

-- ── Permisos ──
GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION reset_store_data(UUID, BOOLEAN) IS
'Resetea los datos operacionales de una tienda.
p_keep_catalog=false (default): borra TODO incluyendo catálogo de productos.
p_keep_catalog=true: mantiene catálogo pero resetea stock a 0.
Usuarios, memberships, audit_logs y stores NUNCA se tocan.

FIX 2026-07-25: ahora borra production_orders, production_order_items,
sales_transactions, commission_payments, commission_rules, workers,
cash_sessions, inventory_adjustment_items, transfer_items,
store_exchange_rates antes de products — antes fallaba con FK violation.';
