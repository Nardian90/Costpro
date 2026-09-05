SELECT substring(pg_get_functiondef('public.confirm_inventory_adjustment(uuid,uuid)'::regprocedure) from 'FOR UPDATE(.*)') AS body
