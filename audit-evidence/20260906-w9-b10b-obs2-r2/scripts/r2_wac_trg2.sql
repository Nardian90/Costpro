SELECT jsonb_build_object(
  'wac_update_triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'tgname', t.tgname, 'fn', p.proname)), '[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname='public' AND NOT t.tgisinternal AND p.proname ILIKE '%wac%'),
  'receipt_items_triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object('tgname', t.tgname, 'fn', p.proname)), '[]'::jsonb)
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid='public.receipt_items'::regclass AND NOT t.tgisinternal)
) AS w;
