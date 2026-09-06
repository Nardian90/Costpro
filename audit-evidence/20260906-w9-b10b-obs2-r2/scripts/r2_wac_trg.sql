SELECT jsonb_build_object(
  'wac_triggers_anywhere', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'tgname', t.tgname, 'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND t.tgname ILIKE '%wac%' AND NOT t.tgisinternal)
) AS w;
