select p.oid::regprocedure::text as obj, coalesce(r.rolname,'public') as grantee,
       a.privilege_type as priv, a.is_grantable as grantable
from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
     aclexplode(p.proacl) a left join pg_roles r on r.oid=a.grantee
where n.nspname='public' and p.proacl is not null
order by p.oid::regprocedure::text, 2, 3 limit __LIMIT__ offset __OFFSET__;
