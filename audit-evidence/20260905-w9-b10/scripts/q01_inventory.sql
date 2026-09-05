SELECT p.proname AS fn, p.oid::bigint AS oid, r.rolname AS owner, p.prosecdef AS secdef,
       COALESCE(array_to_string(p.proconfig, ','), '') AS config,
       COALESCE(array_to_string(p.proacl, ','), 'NULL') AS acl,
       pg_get_function_identity_arguments(p.oid) AS args,
       l.lanname AS lang,
       md5(pg_get_functiondef(p.oid)) AS def_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname='public'
  AND p.proname IN ('reverse_receipt','reverse_receipt_v2','reverse_transfer','reverse_adjustment',
                    'duplicate_inventory_adjustment_v2','reverse_devolution','reverse_production_order')
ORDER BY p.proname;
