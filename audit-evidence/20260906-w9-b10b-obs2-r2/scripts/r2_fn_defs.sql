-- R2 · live canonical pipeline function definitions + ACL (READ ONLY)
SELECT jsonb_build_object(
  'captured_at', now(),
  'create_sale_v2', (
    SELECT jsonb_build_object('def', pg_get_functiondef(p.oid), 'acl', coalesce(array_to_string(p.proacl, ','), 'NULL'), 'secdef', p.prosecdef, 'owner', pg_get_userbyid(p.proowner))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_sale_v2'
  ),
  'void_transaction', (
    SELECT jsonb_build_object('def', pg_get_functiondef(p.oid), 'acl', coalesce(array_to_string(p.proacl, ','), 'NULL'), 'secdef', p.prosecdef, 'owner', pg_get_userbyid(p.proowner))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'void_transaction'
  ),
  'reverse_transaction_v2', (
    SELECT jsonb_build_object('def', pg_get_functiondef(p.oid), 'acl', coalesce(array_to_string(p.proacl, ','), 'NULL'), 'secdef', p.prosecdef, 'owner', pg_get_userbyid(p.proowner))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reverse_transaction_v2'
  ),
  'register_stock_movement', (
    SELECT jsonb_build_object('acl', coalesce(array_to_string(p.proacl, ','), 'NULL'), 'secdef', p.prosecdef)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_stock_movement'
  ),
  'overloads', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('fn', p.proname, 'args', pg_get_function_arguments(p.oid))), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('create_sale_v2','void_transaction','reverse_transaction_v2')
  )
) AS fn_defs;
