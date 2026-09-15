// Builds the final cross-check query JSON with exact escaping and POSTs it.
const PAT = "\\m(INSERT\\s+INTO\\M|UPDATE\\s+(public\\.)?[A-Za-z_\"']|DELETE\\s+FROM\\M|TRUNCATE(\\s+TABLE)?\\M|MERGE\\s+INTO\\M)";
const sql = `with f as (
  select p.proname::text as name, pg_get_function_arguments(p.oid) as args,
         p.prosecdef, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
), m as (select *, def ~ '(INSERT|UPDATE|DELETE)\\s+(INTO|public\\.)' as oldm, def ~* E'${PAT.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' as newm from f)
select
 (select count(*) from m where oldm) as old_total,
 (select count(*) from m where oldm and prosecdef) as old_secdef,
 (select count(*) from m where newm) as new_total,
 (select count(*) from m where newm and prosecdef) as new_secdef,
 (select count(*) from m where oldm and not newm) as old_not_new,
 (select count(*) from m where newm and not oldm and prosecdef) as new_not_old_secdef,
 (select count(*) from m where newm and not oldm and not prosecdef) as new_not_old_invoker`;
const body = JSON.stringify({ query: sql });
require('fs').writeFileSync('/tmp/q-final.json', body);
console.log('query written');
