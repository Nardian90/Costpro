SELECT substring(pg_get_functiondef(p.oid) from 'BEGIN(.*)') AS body
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='register_stock_movement';
