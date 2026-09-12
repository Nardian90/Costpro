-- REM-INV-1 Fase 1: columnas de las tablas núcleo del modelo inventarial
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('stores','products','inventory','stock_movements','kardex_entries',
                     'warehouse_stock','product_lots','inventory_reservations',
                     'inventory_adjustments','inventory_adjustment_items',
                     'receipts','receipt_items','transfers','transfer_items',
                     'purchase_orders','purchase_order_items','devolutions','devolution_items',
                     'production_orders','production_order_items','transactions',
                     'sales_transactions','transaction_items','product_cost_sheets',
                     'received_services','service_cost_distributions','exchange_rates',
                     'store_exchange_rates','idempotency_keys','idempotency_registry',
                     'physical_counts','physical_count_items')
ORDER BY table_name, ordinal_position;
