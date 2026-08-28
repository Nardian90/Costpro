select n.nspname as obj, r.rolname as grantee, a.privilege_type as priv, a.is_grantable as grantable, gr.rolname as grantor
from pg_namespace n, aclexplode(n.nspacl) a
join pg_roles r on r.oid=a.grantee join pg_roles gr on gr.oid=a.grantor
where n.nspname='public' order by 1,2,3;
