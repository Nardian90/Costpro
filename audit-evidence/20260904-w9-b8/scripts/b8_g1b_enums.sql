-- W9.5-B8 · GATE 1b — enums, FKs de profiles, distribución de roles globales
SELECT jsonb_build_object(
  'a_enums', (
    SELECT jsonb_build_object(
      'transaction_status', (SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='transaction_status'),
      'user_role',          (SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='user_role'),
      'membership_status',  (SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='membership_status'),
      'payment_method_enum',(SELECT jsonb_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='payment_method_enum')
    )
  ),
  'b_profiles_constraints', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass
    ) t
  ),
  'c_usm_constraints', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid = 'public.user_store_memberships'::regclass
    ) t
  ),
  'd_profiles_role_distribution', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT role, is_active, count(*)::int AS n FROM profiles GROUP BY role, is_active ORDER BY n DESC
    ) t
  ),
  'e_usm_status_distribution', (
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT status, count(*)::int AS n FROM user_store_memberships GROUP BY status
    ) t
  ),
  'f_has_store_access_as_users', (
    SELECT jsonb_build_object(
      'uses_profiles', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_store_access_as' AND pg_get_functiondef(p.oid) ILIKE '%profiles%'),
      'uses_usm', (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_store_access_as' AND pg_get_functiondef(p.oid) ILIKE '%user_store_memberships%')
    )
  ),
  'g_current_runtime', (
    SELECT jsonb_build_object(
      'session_user', session_user::text,
      'current_user', current_user::text,
      'is_superuser', (SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
      'has_authenticated_member', pg_has_role(current_user, 'authenticated', 'member'),
      'has_service_role_member', pg_has_role(current_user, 'service_role', 'member'),
      'server_version', current_setting('server_version')
    )
  )
) AS gate1b;
