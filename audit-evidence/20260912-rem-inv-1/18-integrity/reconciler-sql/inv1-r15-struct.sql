-- R15: purchase_items existe? trigger en transaction_items? unit_cost nulos por tipo?
SELECT 'table_purchase_items' AS metric, to_jsonb(COUNT(*))#>>'{}' AS value
FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_items'
UNION ALL
SELECT 'trigger_on_transaction_items', to_jsonb(COUNT(*))#>>'{}'
FROM information_schema.triggers WHERE event_object_table='transaction_items' AND trigger_schema='public'
UNION ALL
SELECT 'trigger_on_transactions', to_jsonb(COUNT(*))#>>'{}'
FROM information_schema.triggers WHERE event_object_table='transactions' AND trigger_schema='public'
UNION ALL
SELECT 'movement_unit_cost_null_by_type:'||movement_type, COUNT(*)::text
FROM stock_movements WHERE unit_cost IS NULL GROUP BY movement_type
UNION ALL
SELECT 'movement_unit_cost_zero_by_type:'||movement_type, COUNT(*)::text
FROM stock_movements WHERE unit_cost=0 GROUP BY movement_type
ORDER BY 1;
