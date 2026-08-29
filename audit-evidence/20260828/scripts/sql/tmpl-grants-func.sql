select p.oid::regprocedure::text as obj, r.rolname as grantee,
       a.privilege_type as priv, a.is_grantable as grantable,
       gr.rolname as grantor
from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
     aclexplode(p.proacl) a
     join pg_roles r on r.oid=a.grantee
     join pg_roles gr on gr.oid=a.grantor
where n.nspname='public'
order by p.oid::regprocedure::text, r.rolname, a.privilege_type limit __LIMIT__ offset __OFFSET__;
