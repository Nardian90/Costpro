-- E5: definiciones restantes del ciclo económico (v2 + devoluciones + WAC)
SELECT p.proname AS fn_name, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('reverse_receipt_v2','reverse_transaction_v2','create_devolution',
    'create_devolution_v2','create_sale_v2','fn_recalc_wac','w62_guard_wac_writer',
    'withdraw_production_item_v3','void_closed_production_order','void_transaction',
    'close_production_order_v2','create_production_order_v2','fn_sync_inventory_on_movement',
    'sync_product_stock','sync_products_stock_current','prevent_direct_inventory_modification',
    'prevent_negative_inventory')
ORDER BY p.proname;
