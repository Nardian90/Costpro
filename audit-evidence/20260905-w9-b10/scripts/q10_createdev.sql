SELECT substring(pg_get_functiondef('public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text)'::regprocedure) from 'has_store_access_as[^;]*') AS authz
UNION ALL
SELECT substring(pg_get_functiondef('public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text)'::regprocedure) from 'CREATE OR REPLACE FUNCTION public.create_devolution_v2[^;]*') AS sig2
