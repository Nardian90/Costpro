SELECT substring(pg_get_functiondef('public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)'::regprocedure) from 'BEGIN(.*)') AS body
