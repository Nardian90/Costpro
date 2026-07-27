-- V2.11.4 — Fix: reset_store_data no borraba servicios_recibidos + otras tablas
--
-- BUG: Al reiniciar tienda, received_services, fiscal_closings, abc_classifications,
-- cash_movements, inventory, audit_logs, price_change_history y otras tablas con
-- store_id NO se borraban, dejando datos huérfanos.

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

  -- transaction_items + transactions
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- receipt_items + receipts
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- devolution_items + devolutions
  DELETE FROM devolution_items WHERE devolution_id IN (
    SELECT id FROM devolutions WHERE store_id = target_store_id
  );
  DELETE FROM devolutions WHERE store_id = target_store_id;

  -- quotation_items + quotations
  DELETE FROM quotation_items WHERE quotation_id IN (
    SELECT id FROM quotations WHERE store_id = target_store_id
  );
  DELETE FROM quotations WHERE store_id = target_store_id;

  -- customers
  DELETE FROM customers WHERE store_id = target_store_id;

  -- V2.11.4: received_services + tablas relacionadas
  DELETE FROM service_cost_distributions WHERE service_id IN (
    SELECT id FROM received_services WHERE store_id = target_store_id
  );
  DELETE FROM service_reception_links WHERE service_id IN (
    SELECT id FROM received_services WHERE store_id = target_store_id
  );
  DELETE FROM service_audit_log WHERE service_id IN (
    SELECT id FROM received_services WHERE store_id = target_store_id
  );
  DELETE FROM received_services WHERE store_id = target_store_id;
  DELETE FROM service_types WHERE store_id = target_store_id;

  -- bank_statement_items + bank_statements
  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
    SELECT id FROM bank_statements WHERE store_id = target_store_id
  );
  DELETE FROM bank_statements WHERE store_id = target_store_id;

  -- kardex_entries
  DELETE FROM kardex_entries WHERE store_id = target_store_id;

  -- physical_count_items + physical_counts
  DELETE FROM physical_count_items WHERE count_id IN (
    SELECT id FROM physical_counts WHERE store_id = target_store_id
  );
  DELETE FROM physical_counts WHERE store_id = target_store_id;

  -- payment_transactions
  DELETE FROM payment_transactions WHERE store_id = target_store_id;

  -- stock_movements
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- cash_closures + cash_sessions + cash_movements
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  DELETE FROM cash_sessions WHERE store_id = target_store_id;
  DELETE FROM cash_movements WHERE store_id = target_store_id;

  -- V2.11.4: fiscal_closings
  DELETE FROM fiscal_closings WHERE store_id = target_store_id;

  -- inventory_adjustment_items + inventory_adjustments
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;

  -- transfer_items + transfers
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;

  -- purchase_order_items + purchase_orders
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- production_order_items + production_orders
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- commissions + workers
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;

  -- sales_transactions
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- V2.11.4: abc_classifications
  DELETE FROM abc_classifications WHERE store_id = target_store_id;

  -- V2.11.4: price_change_history + price_commit_log
  DELETE FROM price_change_history WHERE store_id = target_store_id;
  DELETE FROM price_commit_log WHERE store_id = target_store_id;

  -- V2.11.4: inventory + inventory_batches + inventory_snapshots
  DELETE FROM inventory_batches WHERE store_id = target_store_id;
  DELETE FROM inventory_snapshots WHERE store_id = target_store_id;
  DELETE FROM inventory WHERE store_id = target_store_id;

  -- Ofertas + store_exchange_rates
  DELETE FROM ofertas WHERE store_id = target_store_id;
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- V2.11.4: audit_logs + audit_events (opcional — mantener auditoría?)
  -- Decisión: borrar audit_logs del store para limpieza completa
  DELETE FROM audit_logs WHERE store_id = target_store_id;

  -- ── 2. Si keep_catalog=false, borrar catálogo ──
  IF NOT p_keep_catalog THEN
    -- product_lots antes de products
    DELETE FROM product_lots WHERE store_id = target_store_id;
    -- product_variants antes de products
    DELETE FROM product_variants WHERE product_id IN (
      SELECT id FROM products WHERE store_id = target_store_id
    );
    -- Fichas de costo
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    -- V2.11.4: cost_sheet_templates
    DELETE FROM cost_sheet_templates WHERE store_id = target_store_id;
    -- Productos
    DELETE FROM products WHERE store_id = target_store_id;
  ELSE
    -- keep_catalog=true: resetear stock a 0
    UPDATE products SET stock_current = 0, updated_at = NOW() WHERE store_id = target_store_id;
    DELETE FROM product_lots WHERE store_id = target_store_id;
  END IF;

  -- ── 3. Limpieza de snapshots y notificaciones ──
  DELETE FROM store_reset_snapshots WHERE store_id = target_store_id;
  DELETE FROM store_notifications WHERE store_id = target_store_id;

END;
$$;

GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_store_data(UUID, BOOLEAN) TO service_role;

COMMENT ON FUNCTION reset_store_data(UUID, BOOLEAN) IS
'V2.11.4: Reinicia tienda completamente. Borra TODAS las tablas con store_id: ventas, recepciones, devoluciones, cotizaciones, servicios_recibidos, transferencias, producción, ajustes, kardex, cierres fiscales, ABC, cash_movements, inventory, audit_logs, price_history, etc.';

NOTIFY pgrst, 'reload schema';
