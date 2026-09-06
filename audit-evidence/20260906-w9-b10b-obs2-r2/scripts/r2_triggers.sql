SELECT jsonb_build_object(
  'fn_sync_inventory_on_movement', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_sync_inventory_on_movement'),
  'auto_kardex_on_stock_movement', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='auto_kardex_on_stock_movement'),
  'sync_product_stock', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_product_stock'),
  'trg_validate_tx_transition_fn', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='validate_tx_transition'),
  'reverse_commissions_on_sale_void_fn', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reverse_commissions_on_sale_void')
) AS trig_defs;
