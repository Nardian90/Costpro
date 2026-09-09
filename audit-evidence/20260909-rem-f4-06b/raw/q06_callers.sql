-- @statement: callers_of_ensure_fiscal_period
SELECT p.proname, p.oid::regprocedure AS signature
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND pg_get_functiondef(p.oid) ~ 'ensure_fiscal_period';

-- @statement: who_sets_status_closed
SELECT p.proname, p.oid::regprocedure AS signature
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND pg_get_functiondef(p.oid) ~* "status\\s*=\\s*'closed'"
  AND pg_get_functiondef(p.oid) ~* 'fiscal';
