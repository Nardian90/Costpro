-- W9.5-B8 · GATE 1 — Inventario LIVE de la familia void/reverse/cancel/annul
-- Una sola sentencia → un único objeto jsonb con todas las secciones.
SELECT jsonb_build_object(
  'a_fn_inventory', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT n.nspname AS schema, p.oid, p.proname,
             pg_get_function_identity_arguments(p.oid) AS args,
             p.prosecdef AS security_definer, r.rolname AS owner,
             p.provolatile::text AS volatility, p.proacl, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'public'
        AND (p.proname ILIKE '%void%' OR p.proname ILIKE '%reverse%'
             OR p.proname ILIKE '%cancel%' OR p.proname ILIKE '%annul%')
      ORDER BY p.proname, p.oid
    ) t
  ),
  'b_fn_defs', (
    SELECT coalesce(jsonb_object_agg(p.proname || '#' || p.oid, pg_get_functiondef(p.oid)), '{}'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('void_transaction','reverse_transaction_v2','reverse_receipt',
                        'reverse_receipt_v2','has_store_access_as','register_stock_movement')
  ),
  'c_auth_fn_defs', (
    SELECT coalesce(jsonb_object_agg(n.nspname || '.' || p.proname, pg_get_functiondef(p.oid)), '{}'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname IN ('uid','role')
  ),
  'd_triggers_transactions', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      WHERE t.tgrelid = 'public.transactions'::regclass AND NOT t.tgisinternal
      ORDER BY t.tgname
    ) t
  ),
  'e_trg_fn_defs_state_commissions', (
    SELECT coalesce(jsonb_object_agg(p.proname, pg_get_functiondef(p.oid)), '{}'::jsonb)
    FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE tg.tgrelid = 'public.transactions'::regclass AND NOT tg.tgisinternal
      AND (p.proname ILIKE '%transition%' OR p.proname ILIKE '%commission%')
  ),
  'f_transactions_key_columns', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transactions'
        AND column_name IN ('id','store_id','status','seller_id','user_id','created_by',
                            'void_reason','voided_at','cancelled_at','reversed_at','total_amount','operation_date')
      ORDER BY ordinal_position
    ) t
  ),
  'g_transactions_constraints', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid = 'public.transactions'::regclass
    ) t
  ),
  'h_membership_role_tables', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT c.relname AS table_name, a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS coltype
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (c.relname ILIKE '%member%' OR c.relname ILIKE '%profile%' OR c.relname ILIKE '%role%')
      ORDER BY c.relname, a.attnum
    ) t
  ),
  'i_status_distribution_live', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT status, count(*)::int AS n FROM transactions GROUP BY status ORDER BY n DESC
    ) t
  ),
  'j_roles_in_memberships', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT role, count(*)::int AS n
      FROM user_store_memberships GROUP BY role ORDER BY n DESC
    ) t
  )
) AS gate1;
