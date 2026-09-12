-- Fase 1: inventario de triggers sobre tablas del modelo económico
SELECT event_object_table AS tbl, trigger_name, action_timing, event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema='public'
  AND event_object_table IN ('inventory','stock_movements','kardex_entries','products',
    'receipts','receipt_items','transfers','transfer_items','transactions','transaction_items',
    'production_orders','production_order_items','inventory_adjustments','devolutions',
    'warehouse_stock','product_lots','purchase_orders','purchase_order_items','physical_counts',
    'received_services','service_cost_distributions')
ORDER BY event_object_table, trigger_name;
