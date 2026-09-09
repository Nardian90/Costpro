-- @statement: writers_of_fiscal_closings
SELECT p.proname, p.oid::regprocedure AS signature,
       CASE WHEN pg_get_functiondef(p.oid) ~* 'INSERT\s+INTO\s+(public\.)?fiscal_closings' THEN 'INSERT' ELSE '' END ||
       CASE WHEN pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?fiscal_closings' THEN ' UPDATE' ELSE '' END ||
       CASE WHEN pg_get_functiondef(p.oid) ~* 'DELETE\s+FROM\s+(public\.)?fiscal_closings' THEN ' DELETE' ELSE '' END AS ops
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND pg_get_functiondef(p.oid) ~* 'fiscal_closings'
ORDER BY p.proname;
