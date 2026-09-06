-- R2 · policy functions + register_stock_movement full def (READ ONLY)
SELECT jsonb_build_object(
  'captured_at', now(),
  'can_pos_undo_transaction', (
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_pos_undo_transaction'
  ),
  'can_admin_reverse_transaction', (
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'can_admin_reverse_transaction'
  ),
  'has_store_access_as', (
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_store_access_as' AND p.prokind = 'f'
  ),
  'register_stock_movement', (
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_stock_movement'
  ),
  'trg_validate_tx_transition', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('tgname', t.tgname, 'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid = 'public.transactions'::regclass AND NOT t.tgisinternal
  ),
  'products_triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('tgname', t.tgname, 'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid = 'public.products'::regclass AND NOT t.tgisinternal
  ),
  'stock_movements_triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('tgname', t.tgname, 'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid = 'public.stock_movements'::regclass AND NOT t.tgisinternal
  )
) AS pipeline_defs;
