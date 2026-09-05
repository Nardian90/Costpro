SELECT substring(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) from 'stock(.*)') AS stock_part
UNION ALL
SELECT substring(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) from 'FOR UPDATE(.*)')
