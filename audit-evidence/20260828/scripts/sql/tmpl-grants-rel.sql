select c.relname::text as obj, c.relkind as kind, r.rolname as grantee,
       a.privilege_type as priv, a.is_grantable as grantable,
       gr.rolname as grantor
from pg_class c join pg_namespace n on n.oid=c.relnamespace,
     aclexplode(c.relacl) a
     join pg_roles r on r.oid=a.grantee
     join pg_roles gr on gr.oid=a.grantor
where n.nspname='public' and c.relkind in ('r','p','v','m','S')
order by c.relname, r.rolname, a.privilege_type limit __LIMIT__ offset __OFFSET__;
