select p.oid::bigint as oid, p.oid::regprocedure::text as sig, p.prokind as kind,
       pg_get_userbyid(p.proowner) as owner,
       pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p','w')
order by p.oid limit __LIMIT__ offset __OFFSET__;
