-- GATE 22: recaptura POST para comparación de no-drift
SELECT jsonb_build_object(
  'reverse_devolution', (
    SELECT jsonb_build_object('oid',p.oid,'owner',pg_get_userbyid(p.proowner),
      'security_definer',p.prosecdef,'search_path_cfg',p.proconfig,'acl',p.proacl,
      'definition',pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='reverse_devolution'),
  'register_stock_movement', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oid',p.oid,'acl',p.proacl,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='register_stock_movement'),
  'fn_recalc_wac', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_recalc_wac'),
  'auto_kardex_on_stock_movement', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid))),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='auto_kardex_on_stock_movement'),
  'fn_sync_inventory_on_movement', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('def',pg_get_functiondef(t.tgfoid))),'[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid='public.stock_movements'::regclass AND NOT tgisinternal
      AND t.tgfoid::regproc::text='fn_sync_inventory_on_movement'),
  'sync_product_stock', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('def',pg_get_functiondef(t.tgfoid))),'[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid='public.stock_movements'::regclass AND NOT tgisinternal
      AND t.tgfoid::regproc::text='sync_product_stock'),
  'can_reverse_document', (
    SELECT jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='can_reverse_document'),
  'enum_movement_type', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('label',e.enumlabel,'order',e.enumsortorder) ORDER BY e.enumsortorder),'[]'::jsonb)
    FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='movement_type' AND t.typnamespace='public'::regnamespace),
  'triggers_still_enabled', (
    SELECT count(*) FROM pg_trigger t
    WHERE tgrelid='public.stock_movements'::regclass AND NOT tgisinternal AND tgenabled='O')
) AS post;
