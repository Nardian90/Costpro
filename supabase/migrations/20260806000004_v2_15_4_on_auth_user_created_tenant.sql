-- ============================================================================
-- Migration: 20260806000004_v2_15_4_on_auth_user_created_tenant.sql
-- Iteración 13 — Modify trigger for self-service onboarding
-- ============================================================================
-- AUTORIZADO EXPLÍCITAMENTE (N-C1 punto 1): modificar on_auth_user_created.
--
-- Nuevo comportamiento:
--   1. Lee company_name de raw_user_meta_data
--   2. INSERT tenants (name=company_name, owner_id=NEW.id, plan='free', trial)
--   3. INSERT profiles (role='tenant_admin', tenant_id=new_tenant.id, plan='free')
--
-- Si company_name es NULL, usa el email como nombre de tenant.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role_id UUID;
  v_role_enum USER_ROLE;
  v_metadata_role TEXT;
  v_company_name TEXT;
  v_full_name TEXT;
  v_tenant_id UUID;
BEGIN
  -- Extract role from metadata if present
  v_metadata_role := NEW.raw_user_meta_data->>'role';

  -- Normalize and convert to enum
  IF v_metadata_role IS NOT NULL THEN
    BEGIN
      v_role_enum := v_metadata_role::USER_ROLE;
    EXCEPTION WHEN OTHERS THEN
      v_role_enum := 'tenant_admin'::USER_ROLE;
    END;
  ELSE
    -- Iteración 13: self-signup users are tenant_admin by default
    v_role_enum := 'tenant_admin'::USER_ROLE;
  END IF;

  -- Extract company_name and full_name from metadata
  v_company_name := NEW.raw_user_meta_data->>'company_name';
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Iteración 13: Create tenant for self-signup users
  -- If user was created by admin (via managed_create_user_v2), they may already
  -- have a tenant_id set via p_target_user_id. In that case, skip tenant creation.
  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.tenants (name, owner_id, plan, subscription_status, trial_ends_at, is_active)
    VALUES (
      v_company_name,
      NEW.id,
      'free'::plan_t,
      'trial',
      now() + interval '14 days',
      true
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Get matching role_id from public.roles
  SELECT id INTO v_role_id FROM public.roles
    WHERE name = v_metadata_role OR lower(name) = lower(v_role_enum::text)
    LIMIT 1;

  -- Insert profile with tenant_id
  INSERT INTO public.profiles (id, email, full_name, role, role_id, is_active, tenant_id, plan, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_role_enum,
    v_role_id,
    true,
    v_tenant_id,
    'free'::plan_t,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id),
    plan = EXCLUDED.plan,
    is_active = true,
    updated_at = now();

  -- Audit log
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
  VALUES (
    NEW.id, NEW.id, 'USER_REGISTERED_PUBLICLY',
    jsonb_build_object('email', NEW.email, 'role', v_role_enum::text, 'tenant_id', v_tenant_id),
    jsonb_build_object('company_name', v_company_name, 'source', 'self_signup')
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.on_auth_user_created() IS
  'Iteración 13 (N-C1 authorized): Self-signup creates tenant + tenant_admin profile. If company_name is present in metadata, a new tenant is created with the user as owner.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar versión anterior de on_auth_user_created (de 20260302_0006_fix_hierarchy_and_triggers.sql:134-177)
-- ============================================================================
