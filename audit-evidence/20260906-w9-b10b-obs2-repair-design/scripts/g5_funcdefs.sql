-- GATE 5/6 · Canonical writers inspection (READ ONLY)
SELECT jsonb_build_object(
  'functions', (
    SELECT COALESCE(jsonb_object_agg(proname, jsonb_build_array(defs)), '[]'::jsonb) FROM (
      SELECT p.proname, pg_get_functiondef(p.oid) AS defs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('register_stock_movement','fn_recalc_wac','fn_sync_inventory_on_movement')
    ) t
  ),
  'enums', (
    SELECT COALESCE(jsonb_object_agg(typname, vals), '{}'::jsonb) FROM (
      SELECT t.typname, jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS vals
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
    ) e2
  ),
  'stock_movements_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'null',is_nullable,'def',column_default) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_movements'
  ),
  'inventory_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'null',is_nullable,'def',column_default) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory'
  ),
  'audit_logs_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'null',is_nullable,'def',column_default) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs'
  ),
  'triggers', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('table',event_object_table,'trigger',trigger_name,'timing',action_timing,'event',event_manipulation) ORDER BY event_object_table, trigger_name), '[]'::jsonb)
    FROM information_schema.triggers WHERE trigger_schema='public'
      AND event_object_table IN ('stock_movements','inventory','products')
  ),
  'products_columns', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'null',is_nullable,'def',column_default) ORDER BY ordinal_position), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='products'
  )
) AS evidence;
