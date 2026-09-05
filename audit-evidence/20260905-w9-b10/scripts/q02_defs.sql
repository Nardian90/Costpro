SELECT p.proname AS fn, pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('reverse_receipt_v2','reverse_transfer','reverse_devolution')
ORDER BY p.proname;
