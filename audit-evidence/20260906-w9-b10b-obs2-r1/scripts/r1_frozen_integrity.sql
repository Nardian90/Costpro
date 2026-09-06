-- R1 · Frozen integrity check (READ ONLY) — A10/A11 abort criteria
-- Compares current function/trigger definitions against design pack frozen raw/
SELECT jsonb_build_object(
  'db_now', now(),
  'current_user', current_user,
  'session_user', session_user,
  'functions', (
    SELECT jsonb_object_agg(p.proname, pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('register_stock_movement','fn_recalc_wac','fn_sync_inventory_on_movement','reverse_devolution','has_store_access','is_admin')
  ),
  'trigger_functions', (
    SELECT jsonb_object_agg(p.proname, pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fn_sync_inventory_on_movement','trg_auto_kardex_fn','fn_process_kardex_entry',
        'trg_sync_products_stock_current_fn','fn_update_product_stock_current',
        'trg_prevent_negative_inventory_fn','trigger_prevent_inventory_update_fn',
        'trg_guard_wac_writer_fn','fn_recalc_wac','audit_trigger_function','fn_audit_log'
      )
  ),
  'triggers', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table', c.relname, 'name', t.tgname, 'def', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled = 'O') ORDER BY c.relname, t.tgname), '[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND c.relname IN ('products','inventory','stock_movements','kardex_entries','business_events','audit_logs')
  )
) AS frozen_integrity;
