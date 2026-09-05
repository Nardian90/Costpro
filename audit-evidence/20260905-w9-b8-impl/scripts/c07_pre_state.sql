-- PRE-state de las funciones tocadas por la migración B-8 MODELO C
SELECT p.proname AS fn, p.oid::bigint AS oid, r.rolname AS owner,
       p.prosecdef AS secdef,
       COALESCE(array_to_string(p.proconfig, ','), '') AS config,
       COALESCE(array_to_string(p.proacl, ','), 'NULL') AS acl,
       md5(pg_get_functiondef(p.oid)) AS def_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND (p.proname IN ('void_transaction','reverse_transaction_v2','has_store_access_as')
       OR p.proname IN ('can_pos_undo_transaction','can_admin_reverse_transaction'))
ORDER BY p.proname;
