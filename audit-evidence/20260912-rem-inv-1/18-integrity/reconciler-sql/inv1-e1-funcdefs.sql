-- E1: definiciones completas de las funciones de dinero (extracción forense)
SELECT p.proname AS fn_name, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('register_stock_movement','receive_to_warehouse','fn_process_receipt',
    'reverse_receipt_v','reverse_receipt','confirm_pending_reception','confirm_reception',
    'distribute_service_cost_v','create_transfer','confirm_transfer','reverse_transfer',
    'reverse_transaction_v','reverse_devolution','process_inventory_adjustment',
    'confirm_inventory_adjustment','reverse_inventory_adjustment_v','perform_inventory_adjustment',
    'receive_production_output','reverse_production_order','close_production_order_v',
    'create_production_order_v','reconcile_stock','deduct_stock','get_available_stock',
    'receive_against_po','process_initial_stock')
ORDER BY p.proname;
