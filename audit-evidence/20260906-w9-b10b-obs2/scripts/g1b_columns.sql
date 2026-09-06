-- GATE 1b · Columnas de tablas núcleo para reconstruir FKs reales (READ ONLY)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN (
  'stores','products','inventory','stock_movements','kardex_entries',
  'transactions','transaction_items','sales','sale_items','sales_transactions',
  'devolutions','devolution_items',
  'receipts','receipt_items','purchase_orders','purchase_order_items','purchase_items',
  'production_orders','production_order_items',
  'transfers','transfer_items',
  'inventory_adjustments','inventory_adjustment_items',
  'physical_counts','physical_count_items',
  'inventory_snapshots','store_reset_snapshots','migration_history_snapshots',
  'inventory_movements','inventory_batches','product_lots','transaction_item_lots',
  'issue_slips','issue_slip_items','quotations','quotation_items',
  'warehouse_stock','warehouses',
  'pr2_backup_receipts_20260810','pr2_backup_receipt_items_20260810',
  'audit_logs','audit_events','business_events','bulk_ops_log','wac_change_log'
)
ORDER BY table_name, ordinal_position;
