-- GATE 5/10/12 · Trigger function bodies + access control (READ ONLY)
SELECT jsonb_build_object(
  'trigger_fns', (
    SELECT COALESCE(jsonb_object_agg(name, def), '{}'::jsonb) FROM (
      SELECT p.proname AS name, max(pg_get_functiondef(p.oid)) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'tr_sync_inventory_after_movement','trg_auto_kardex_fn','trg_sync_product_stock_fn',
        'trg_sync_products_stock_current_fn','trigger_prevent_inventory_update_fn',
        'trg_guard_wac_writer_fn','trg_prevent_negative_inventory_fn',
        'trigger_audit_product_changes_fn','has_store_access','log_audit','fn_log_audit'
      ) GROUP BY p.proname
    ) t
  ),
  'all_trigger_fn_names', (
    SELECT COALESCE(jsonb_agg(DISTINCT p.proname ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'trg%'
  ),
  'audit_logs_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'null',is_nullable,'def',column_default) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs'
  ),
  'audit_trigger_def', (
    SELECT COALESCE(max(pg_get_functiondef(p.oid)),'NOT_FOUND') FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE '%audit%product%'
  ),
  'tg_config', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'fn',tgfoid::regproc::text,'enabled',tgenabled) ORDER BY tgrelid::regclass::text, tgname), '[]'::jsonb)
    FROM pg_trigger WHERE NOT tgisinternal
      AND tgrelid::regclass::text IN ('stock_movements','inventory','products')
  )
) AS evidence;
