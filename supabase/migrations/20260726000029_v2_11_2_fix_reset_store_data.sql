-- V2.11.2 — FIX: reset_store_data no borra devolutions ni cotizaciones
--
-- BUG: Al reiniciar tienda (keep_catalog=false), la RPC falla con:
--   "update or delete on table products violates foreign key constraint
--    devolution_items_product_id_fkey on table devolution_items"
--
-- CAUSA: reset_store_data borra transactions, receipts, production_orders,
-- etc. pero NO borra devolutions, devolution_items, quotations,
-- quotation_items, customers, ni bank_statements antes de borrar products.
--
-- FIX: añadir DELETE de estas tablas antes del DELETE de products.

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
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- receipt_items (hija de receipts)
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- V2.11.2 FIX: devolution_items y devolutions (antes de products)
  DELETE FROM devolution_items WHERE devolution_id IN (
    SELECT id FROM devolutions WHERE store_id = target_store_id
  );
  DELETE FROM devolutions WHERE store_id = target_store_id;

  -- V2.11.2 FIX: quotation_items y quotations
  DELETE FROM quotation_items WHERE quotation_id IN (
    SELECT id FROM quotations WHERE store_id = target_store_id
  );
  DELETE FROM quotations WHERE store_id = target_store_id;

  -- V2.11.2 FIX: customers
  DELETE FROM customers WHERE store_id = target_store_id;

  -- V2.11.2 FIX: bank_statements y bank_statement_items
  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
    SELECT id FROM bank_statements WHERE store_id = target_store_id
  );
  DELETE FROM bank_statements WHERE store_id = target_store_id;

  -- V2.11.2 FIX: kardex_entries
  DELETE FROM kardex_entries WHERE store_id = target_store_id;

  -- V2.11.2 FIX: physical_count_items y physical_counts
  DELETE FROM physical_count_items WHERE count_id IN (
    SELECT id FROM physical_counts WHERE store_id = target_store_id
  );
  DELETE FROM physical_counts WHERE store_id = target_store_id;

  -- V2.11.2 FIX: payment_transactions (pagos a proveedores)
  DELETE FROM payment_transactions WHERE store_id = target_store_id;

  -- Movimientos de stock
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- Cierres de caja
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  DELETE FROM cash_sessions WHERE store_id = target_store_id;

  -- Ajustes de inventario
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;

  -- Transferencias
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;

  -- Órdenes de compra
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- Órdenes de producción
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- Comisiones y workers
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;

  -- Sales transactions
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;

  -- Tipos de cambio por tienda
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- ── 2. Si keep_catalog=false, borrar catálogo ──
  IF NOT p_keep_catalog THEN
    -- V2.11.2 FIX: product_lots antes de products
    DELETE FROM product_lots WHERE store_id = target_store_id;

    -- product_variants antes de products
    DELETE FROM product_variants WHERE product_id IN (
      SELECT id FROM products WHERE store_id = target_store_id
    );

    -- Fichas de costo
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;

    -- Productos
    DELETE FROM products WHERE store_id = target_store_id;
  ELSE
    -- keep_catalog=true: solo resetear stock a 0
    UPDATE products SET stock_current = 0, updated_at = NOW() WHERE store_id = target_store_id;
    -- Reset product_lots
    DELETE FROM product_lots WHERE store_id = target_store_id;
  END IF;

  -- ── 3. Reset audit snapshot ──
  DELETE FROM store_reset_snapshots WHERE store_id = target_store_id;

  -- ── 4. Notify ──
  DELETE FROM store_notifications WHERE store_id = target_store_id;

END;
$$;

GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION reset_store_data(UUID, BOOLEAN) IS
'V2.11.2: Reinicia una tienda. Borra TODAS las tablas operacionales (ventas, recepciones, devoluciones, cotizaciones, transferencias, producción, ajustes, kardex, etc.) antes de borrar productos. Fix: añade DELETE de devolutions, quotations, customers, bank_statements, kardex_entries, physical_counts, payment_transactions que faltaban.';

NOTIFY pgrst, 'reload schema';
