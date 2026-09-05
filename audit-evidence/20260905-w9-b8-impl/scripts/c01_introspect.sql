SELECT 'void_transaction' AS fn, pg_get_functiondef('void_transaction(uuid,text,timestamptz,uuid)'::regprocedure) AS def
UNION ALL
SELECT 'reverse_transaction_v2', pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='reverse_transaction_v2'
UNION ALL
SELECT 'has_store_access_as', pg_get_functiondef('has_store_access_as(uuid,uuid)'::regprocedure);
