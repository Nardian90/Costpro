-- GATE 1 v2: captura forense PRE como UN unico documento jsonb
SELECT jsonb_build_object(
  'captured_at', now(),
  'server_version', current_setting('server_version'),
  'reverse_devolution', (
    SELECT jsonb_build_object(
      'oid', p.oid,
      'owner', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'search_path_cfg', p.proconfig,
      'identity_args', pg_get_function_identity_arguments(p.oid),
      'return_type', pg_get_function_result(p.oid),
      'acl', p.proacl,
      'definition', pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='reverse_devolution'),
  'register_stock_movement', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oid',p.oid,
      'identity_args',pg_get_function_identity_arguments(p.oid),
      'acl',p.proacl,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='register_stock_movement'),
  'fn_recalc_wac', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oid',p.oid,
      'identity_args',pg_get_function_identity_arguments(p.oid),
      'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_recalc_wac'),
  'auto_kardex_on_stock_movement', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='auto_kardex_on_stock_movement'),
  'triggers_inventory_chain', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,
      'enabled',tgenabled,'def',pg_get_triggerdef(t.oid))),'[]'::jsonb)
    FROM pg_trigger t
    WHERE tgrelid IN ('public.stock_movements'::regclass,'public.inventory'::regclass,
                      'public.products'::regclass,'public.kardex_entries'::regclass,
                      'public.devolutions'::regclass,'public.devolution_items'::regclass)
      AND NOT tgisinternal),
  'trigger_functions_defs', (
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('fn',t.tgfoid::regproc::text,
      'def',pg_get_functiondef(t.tgfoid))),'[]'::jsonb)
    FROM pg_trigger t
    WHERE tgrelid IN ('public.stock_movements'::regclass,'public.inventory'::regclass,'public.products'::regclass)
      AND NOT tgisinternal),
  'enum_movement_type', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label',e.enumlabel,'order',e.enumsortorder)
      ORDER BY e.enumsortorder),'[]'::jsonb)
    FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='movement_type' AND t.typnamespace='public'::regnamespace),
  'tables_shape', (
    SELECT jsonb_object_agg(table_name, cols) FROM (
      SELECT table_name, jsonb_agg(jsonb_build_object('col',column_name,'type',data_type,
        'udt',udt_name,'nullable',is_nullable,'default',column_default) ORDER BY ordinal_position) AS cols
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN
        ('stock_movements','inventory','products','kardex_entries','devolutions','devolution_items')
      GROUP BY table_name) t),
  'can_reverse_document', (
    SELECT jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='can_reverse_document'),
  'counts_real_data', jsonb_build_object(
    'devolutions_total', (SELECT count(*) FROM public.devolutions),
    'devolutions_by_status', (SELECT jsonb_object_agg(status,c) FROM (SELECT status,count(*) c FROM public.devolutions GROUP BY status) s),
    'stock_movements_total', (SELECT count(*) FROM public.stock_movements),
    'products_total', (SELECT count(*) FROM public.products),
    'kardex_entries_total', (SELECT count(*) FROM public.kardex_entries),
    'inventory_total', (SELECT count(*) FROM public.inventory),
    'audit_logs_total', (SELECT count(*) FROM public.audit_logs))
) AS capture;
