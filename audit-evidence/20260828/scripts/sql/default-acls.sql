select d.defaclrole::regrole::text as target_role,
       coalesce(d.defaclnamespace::regnamespace::text,'') as ns,
       d.defaclobjtype as objtype,
       r.rolname as grantee, a.privilege_type as priv, a.is_grantable as grantable,
       gr.rolname as grantor
from pg_default_acl d,
     aclexplode(d.defaclacl) a
join pg_roles r on r.oid=a.grantee join pg_roles gr on gr.oid=a.grantor
order by 1,2,3,4,5;
