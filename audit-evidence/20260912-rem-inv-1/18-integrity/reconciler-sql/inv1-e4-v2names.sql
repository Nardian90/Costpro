-- E4: familias exactas reverse/close/create v2 (nombres reales)
SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosecdef AS secdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ~* '^reverse_transaction|^reverse_receipt|^close_production|^create_production|^void_transaction|^reverse_vale')
ORDER BY p.proname;
