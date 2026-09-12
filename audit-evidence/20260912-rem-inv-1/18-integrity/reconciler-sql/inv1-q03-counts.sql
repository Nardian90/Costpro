-- Fase 1: volúmenes por tabla (estimaciones) para calibrar el reconciliador
SELECT relname AS table_name, n_live_tup AS live_rows
FROM pg_stat_user_tables
WHERE schemaname='public' AND relname IN ('products','inventory','stock_movements','kardex_entries',
  'warehouse_stock','product_lots','transactions','transaction_items','receipts','receipt_items',
  'transfers','transfer_items','purchase_orders','devolutions','production_orders',
  'production_order_items','inventory_adjustments','inventory_reservations','sales_transactions',
  'received_services','service_cost_distributions','physical_counts','idempotency_keys','idempotency_registry',
  'exchange_rates','store_exchange_rates','product_cost_sheets')
ORDER BY n_live_tup DESC;
