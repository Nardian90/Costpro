SELECT p.proname AS fn, pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('reverse_adjustment','duplicate_inventory_adjustment_v2','reverse_production_order','reverse_receipt')
ORDER BY p.proname;
