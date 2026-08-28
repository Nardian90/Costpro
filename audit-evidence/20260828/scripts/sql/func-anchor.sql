select p.prokind as kind, count(*) as n
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p','w','a')
group by p.prokind order by p.prokind;
