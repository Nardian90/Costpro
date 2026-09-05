SELECT substring(pg_get_functiondef('public.create_devolution_v2(uuid,uuid,text,jsonb)'::regprocedure) from 'auth(.*)') AS authpart
