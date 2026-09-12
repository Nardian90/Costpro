-- R13: grants EXECUTE de la familia económica (¿v1 huérfanas alcanzables por anon/auth?)
SELECT p.proname,
       p.proacl::text AS acl,
       (p.proacl IS NULL) AS acl_default
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('receive_purchase','update_inventory_after_sale','restore_transaction_snapshot',
    'reverse_receipt','reverse_receipt_v2','create_devolution','create_devolution_v2',
    'register_stock_movement','receive_to_warehouse','process_initial_stock','reconcile_stock',
    'deduct_stock','void_transaction','reverse_transaction_v2','process_inventory_adjustment',
    'confirm_inventory_adjustment','reverse_inventory_adjustment_v','create_transfer',
    'confirm_transfer','reverse_transfer','fn_recalc_wac','reset_store_data',
    'receive_production_output','reverse_production_order','close_production_order_v2',
    'void_closed_production_order','withdraw_production_item_v3','create_sale_v2')
ORDER BY p.proname;
