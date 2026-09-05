SELECT p.proname, p.oid::bigint AS oid, r.rolname AS owner, p.prosecdef AS secdef,
       COALESCE(array_to_string(p.proacl,','),'NULL') AS acl, md5(pg_get_functiondef(p.oid)) AS md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
WHERE n.nspname='public' AND p.proname IN ('can_reverse_document','reverse_inventory_adjustment_v2');
