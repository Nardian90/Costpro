-- E9: definiciones de receive_purchase y update_inventory_after_sale (caminos v1 vivos)
SELECT p.proname AS fn_name, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('receive_purchase','update_inventory_after_sale')
ORDER BY p.proname;
