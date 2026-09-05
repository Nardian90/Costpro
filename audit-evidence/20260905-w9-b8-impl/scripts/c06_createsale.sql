SELECT substring(pg_get_functiondef(p.oid) from 'has_store_access_as[^;]*') AS authz_line
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_sale_v2';
