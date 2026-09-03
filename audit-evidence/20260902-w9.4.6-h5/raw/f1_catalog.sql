-- W9.4.6 FASE 1 — live catalog of reverse_transaction(+_v2) and ALL overloads in any schema
WITH f AS (
  SELECT p.oid, n.nspname AS schema, p.proname,
         pg_get_userbyid(p.proowner) AS owner,
         p.prokind, p.prosecdef, p.provolatile, p.proparallel, p.proconfig, p.proacl,
         pg_get_function_identity_arguments(p.oid) AS ident_args,
         pg_get_function_arguments(p.oid) AS args,
         pg_get_function_result(p.oid) AS result,
         length(p.prosrc) AS prosrc_len,
         p.oid::regprocedure::text AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname ILIKE 'reverse_transaction%'
)
SELECT json_agg(t ORDER BY t.schema, t.signature) AS catalog
FROM (
  SELECT f.*,
    to_jsonb(f.proconfig) AS proconfig_jsonb,
    to_jsonb(f.proacl)   AS proacl_jsonb
  FROM f
) t;
