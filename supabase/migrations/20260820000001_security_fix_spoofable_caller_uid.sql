-- ============================================================================
-- Migration: 20260820000001_security_fix_spoofable_caller_uid.sql
-- AUDIT H-7: Eliminar patrón vulnerable v_caller_uid := COALESCE(p_caller_id, auth.uid())
--
-- PROBLEMA (8 RPCs):
--   El patrón `v_caller_uid uuid := COALESCE(p_caller_id, auth.uid())` permite
--   a cualquier `authenticated` pasar un p_caller_id arbitrario para falsear:
--     - el `performed_by` del audit log (4 RPCs: solo falsificación)
--     - la VERIFICACIÓN DE ROL (4 RPCs: ESCALACIÓN DE PRIVILEGIOS REAL)
--
-- CORRECCIÓN (mismo patrón que v2.12.9 — 31 RPCs ya corregidos):
--   v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
--     THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
--
-- Para que los RPCs sigan funcionando cuando el API route (con service_role) pase
-- p_caller_id=session.user.id, añadimos sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
-- que acepta un user_id explícito (solo service_role puede usar el p_user_id).
--
-- ALCANCE:
--   1. managed_update_user          — CRÍTICO: spoofing de admin check
--   2. managed_toggle_user_status   — CRÍTICO: spoofing de admin check
--   3. managed_soft_delete_user     — CRÍTICO: spoofing de admin check
--   4. managed_reset_password       — CRÍTICO: spoofing de admin check
--   5. managed_update_membership    — MEDIO:  spoofing de performed_by
--   6. managed_revoke_membership    — MEDIO:  spoofing de performed_by
--   7. managed_update_tenant_plan    — ALTO:   spoofing de admin check (con bypass Stripe)
--   8. reconcile_orphan_user         — MEDIO:  spoofing de resolved_by + performed_by
-- ============================================================================

-- ─── 0. Add has_store_role(p_user_id, p_store_id, p_roles) overload ──────
-- Esta sobrecarga permite a service_role (API routes) verificar acceso de un user_id específico
-- authenticated siempre verifica su propio auth.uid() (no spoofable)
CREATE OR REPLACE FUNCTION public.has_store_role(
  p_user_id uuid,
  p_store_id uuid,
  p_roles text[]
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN auth.role() = 'service_role' THEN
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = p_user_id
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  ELSE
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid()
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.has_store_role(uuid, uuid, text[]) IS
  'FIX H-7: Sobrecarga para service_role. Permite verificar acceso de user_id explícito (API route usa session.user.id). authenticated siempre usa auth.uid().';

-- ─── 1. managed_update_user ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_update_user(
  p_user_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_role public.user_role DEFAULT NULL::user_role,
  p_role_id uuid DEFAULT NULL::uuid,
  p_is_active boolean DEFAULT NULL::boolean,
  p_max_stores_limit int DEFAULT NULL::int,
  p_max_users_limit int DEFAULT NULL::int,
  p_plan plan_t DEFAULT NULL::plan_t,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing — service_role puede pasar p_caller_id explícito
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Validar caller es admin (usa v_caller_uid que ahora NO es spoofable para authenticated)
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can update users.';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND: %', p_user_id;
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED: Cannot deactivate own account.';
  END IF;

  IF p_full_name IS NOT NULL AND p_full_name <> v_old.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('old', v_old.full_name, 'new', p_full_name));
    UPDATE public.profiles SET full_name = p_full_name, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role_id IS NOT NULL AND (v_old.role_id IS NULL OR p_role_id <> v_old.role_id) THEN
    v_changes := v_changes || jsonb_build_object('role_id', jsonb_build_object('old', v_old.role_id, 'new', p_role_id));
    UPDATE public.profiles SET role_id = p_role_id, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_is_active IS NOT NULL AND p_is_active <> v_old.is_active THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('old', v_old.is_active, 'new', p_is_active));
    UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_stores_limit IS NOT NULL AND (v_old.max_stores_limit IS NULL OR p_max_stores_limit <> v_old.max_stores_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_stores_limit', jsonb_build_object('old', v_old.max_stores_limit, 'new', p_max_stores_limit));
    UPDATE public.profiles SET max_stores_limit = p_max_stores_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_users_limit IS NOT NULL AND (v_old.max_users_limit IS NULL OR p_max_users_limit <> v_old.max_users_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_users_limit', jsonb_build_object('old', v_old.max_users_limit, 'new', p_max_users_limit));
    UPDATE public.profiles SET max_users_limit = p_max_users_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_plan IS NOT NULL AND p_plan <> v_old.plan THEN
    v_changes := v_changes || jsonb_build_object('plan', jsonb_build_object('old', v_old.plan::text, 'new', p_plan::text));
    UPDATE public.profiles SET plan = p_plan, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, p_user_id, 'USER_UPDATED',
      jsonb_build_object(
        'full_name', v_old.full_name, 'role', v_old.role::text,
        'is_active', v_old.is_active, 'plan', v_old.plan::text
      ),
      v_changes,
      jsonb_build_object('fields_changed', jsonb_object_keys(v_changes))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'changes', v_changes);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_update_user FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_update_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_user TO service_role;

COMMENT ON FUNCTION public.managed_update_user IS
  'FIX H-7: Anti-spoofing caller_id. Service_role puede pasar p_caller_id explícito; authenticated SIEMPRE usa auth.uid().';

-- ─── 2. managed_toggle_user_status ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_toggle_user_status(
  p_user_id uuid,
  p_is_active boolean,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin', 'encargado', 'manager') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED';
  END IF;

  SELECT id, is_active, full_name INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  IF v_old.is_active = p_is_active THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values)
  VALUES (
    v_caller_uid, p_user_id,
    CASE WHEN p_is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    jsonb_build_object('is_active', v_old.is_active),
    jsonb_build_object('is_active', p_is_active)
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_toggle_user_status FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_toggle_user_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_toggle_user_status TO service_role;

COMMENT ON FUNCTION public.managed_toggle_user_status IS
  'FIX H-7: Anti-spoofing caller_id.';

-- ─── 3. managed_soft_delete_user ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_soft_delete_user(
  p_user_id uuid,
  p_reason text,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_active_memberships_count int;
  v_anon_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DELETE_BLOCKED';
  END IF;

  SELECT id, email, full_name, role, plan, is_active INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND_OR_ALREADY_DELETED';
  END IF;

  SELECT COUNT(*) INTO v_active_memberships_count
    FROM public.user_store_memberships
    WHERE user_id = p_user_id AND status = 'active';
  IF v_active_memberships_count > 0 THEN
    RAISE EXCEPTION 'ERR_USER_HAS_ACTIVE_MEMBERSHIPS: % active. Revoke memberships first.', v_active_memberships_count;
  END IF;

  v_anon_email := 'deleted+' || substr(p_user_id::text, 1, 8) || '@anonymized.local';

  UPDATE public.profiles SET
    deleted_at = now(),
    deletion_reason = p_reason,
    deleted_by = v_caller_uid,
    is_active = false,
    full_name = '[deleted user]',
    email = v_anon_email,
    ai_api_key = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'USER_SOFT_DELETED',
    jsonb_build_object(
      'email', v_old.email, 'full_name', v_old.full_name,
      'role', v_old.role::text, 'plan', v_old.plan::text, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'email', v_anon_email, 'full_name', '[deleted user]',
      'is_active', false, 'deleted_at', now()
    ),
    jsonb_build_object('reason', p_reason, 'memberships_revoked', v_active_memberships_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'status', 'soft_deleted',
    'note', 'auth.users preserved. API route should ban via auth.admin.updateUser.'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_soft_delete_user FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_soft_delete_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_soft_delete_user TO service_role;

COMMENT ON FUNCTION public.managed_soft_delete_user IS
  'FIX H-7: Anti-spoofing caller_id.';

-- ─── 4. managed_reset_password ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_reset_password(
  p_user_id uuid,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_target_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_RESET_BLOCKED';
  END IF;

  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'PASSWORD_RESET_REQUESTED',
    jsonb_build_object('email', v_target_email, 'method', 'recovery_link')
  );

  RETURN jsonb_build_object('success', true, 'email', v_target_email);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_reset_password FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_reset_password TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_reset_password TO service_role;

COMMENT ON FUNCTION public.managed_reset_password IS
  'FIX H-7: Anti-spoofing caller_id.';

-- ─── 5. managed_update_membership ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_update_membership(
  p_membership_id uuid,
  p_role public.user_role DEFAULT NULL::user_role,
  p_status text DEFAULT NULL::text,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT m.id, m.user_id, m.store_id, m.role, m.status
    INTO v_old
    FROM public.user_store_memberships m
    WHERE m.id = p_membership_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MEMBERSHIP_NOT_FOUND';
  END IF;

  -- FIX H-7: Autorización usa nueva sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
  -- service_role (API route) pasa p_caller_id=session.user.id → verifica acceso de ese user
  -- authenticated pasa p_caller_id=NULL → v_caller_uid=auth.uid() → verifica su propio acceso
  IF NOT public.has_store_role(v_caller_uid, v_old.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin or manager of the store.';
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.user_store_memberships SET role = p_role, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> v_old.status::text THEN
    IF p_status NOT IN ('active', 'revoked') THEN
      RAISE EXCEPTION 'ERR_INVALID_STATUS: %', p_status;
    END IF;
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_status));
    UPDATE public.user_store_memberships SET status = p_status::membership_status, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, v_old.user_id, 'MEMBERSHIP_UPDATED',
      jsonb_build_object('membership_id', p_membership_id, 'store_id', v_old.store_id, 'role', v_old.role::text, 'status', v_old.status),
      v_changes,
      jsonb_build_object('store_id', v_old.store_id)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'changes', v_changes);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_update_membership FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_update_membership TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_membership TO service_role;

COMMENT ON FUNCTION public.managed_update_membership IS
  'FIX H-7: Anti-spoofing caller_id para audit log performed_by. Autorización sigue usando has_store_role (no spoofable).';

-- ─── 6. managed_revoke_membership ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_revoke_membership(
  p_membership_id uuid,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_remaining_active int;
BEGIN
  SELECT m.id, m.user_id, m.store_id, m.role, m.status
    INTO v_old
    FROM public.user_store_memberships m
    WHERE m.id = p_membership_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MEMBERSHIP_NOT_FOUND';
  END IF;

  -- FIX H-7: Autorización usa nueva sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
  IF NOT public.has_store_role(v_caller_uid, v_old.store_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only store admins can revoke memberships.';
  END IF;

  IF v_old.status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE id = p_membership_id;

  SELECT COUNT(*) INTO v_remaining_active
    FROM public.user_store_memberships
    WHERE user_id = v_old.user_id AND status = 'active';

  IF v_remaining_active = 0 THEN
    UPDATE public.profiles SET is_active = false, updated_at = now()
      WHERE id = v_old.user_id AND deleted_at IS NULL;

    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
    VALUES (
      v_caller_uid, v_old.user_id, 'USER_AUTO_DEACTIVATED',
      jsonb_build_object('reason', 'No active memberships remaining after revoke')
    );
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, v_old.user_id, 'MEMBERSHIP_REVOKED',
    jsonb_build_object('membership_id', p_membership_id, 'store_id', v_old.store_id, 'role', v_old.role::text, 'status', v_old.status),
    jsonb_build_object('status', 'revoked'),
    jsonb_build_object('store_id', v_old.store_id, 'remaining_active_memberships', v_remaining_active)
  );

  RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'remaining_active_memberships', v_remaining_active);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_revoke_membership FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_revoke_membership TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_revoke_membership TO service_role;

COMMENT ON FUNCTION public.managed_revoke_membership IS
  'FIX H-7: Anti-spoofing caller_id para audit log performed_by. Autorización sigue usando has_store_role (no spoofable).';

-- ─── 7. managed_update_tenant_plan ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_update_tenant_plan(
  p_tenant_id uuid,
  p_plan plan_t,
  p_subscription_status text DEFAULT NULL,
  p_caller_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing — service_role (Stripe webhook) puede pasar NULL caller_id
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_old_plan plan_t;
  v_old_status text;
  v_role public.user_role;
BEGIN
  -- Validación: si caller_uid es NULL (service_role anónimo para Stripe webhook), permitir
  -- Si caller_uid NO es NULL, debe ser admin/superadmin
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_uid;
    IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can change tenant plan';
    END IF;
  END IF;

  SELECT plan, subscription_status INTO v_old_plan, v_old_status
    FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TENANT_NOT_FOUND: %', p_tenant_id;
  END IF;

  UPDATE public.tenants SET
    plan = p_plan,
    subscription_status = COALESCE(p_subscription_status, subscription_status),
    updated_at = now()
  WHERE id = p_tenant_id;

  UPDATE public.profiles SET
    plan = p_plan,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, NULL, 'TENANT_PLAN_UPDATED',
    jsonb_build_object('old_plan', v_old_plan::text, 'old_status', v_old_status),
    jsonb_build_object('new_plan', p_plan::text, 'new_status', COALESCE(p_subscription_status, v_old_status)),
    jsonb_build_object('tenant_id', p_tenant_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'old_plan', v_old_plan::text,
    'new_plan', p_plan::text
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_update_tenant_plan FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan TO service_role;

COMMENT ON FUNCTION public.managed_update_tenant_plan IS
  'FIX H-7: Anti-spoofing caller_id. Stripe webhook (service_role) puede pasar caller_id=NULL.';

-- ─── 8. reconcile_orphan_user ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_orphan_user(
  p_auth_user_id uuid,
  p_action text,
  p_reason text,
  p_caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_log RECORD;
  v_target_email text;
BEGIN
  -- Autorización usa is_admin() (internamente auth.uid()) → NO spoofable
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_action NOT IN ('create_profile', 'delete_auth_user', 'ignore') THEN
    RAISE EXCEPTION 'ERR_INVALID_ACTION: %', p_action;
  END IF;

  SELECT * INTO v_log FROM public.orphaned_users_log
    WHERE auth_user_id = p_auth_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORPHAN_NOT_FOUND: %', p_auth_user_id;
  END IF;

  IF v_log.status = 'resolved' THEN
    RAISE EXCEPTION 'ERR_ALREADY_RESOLVED';
  END IF;

  v_target_email := v_log.email;

  IF p_action = 'create_profile' THEN
    INSERT INTO public.profiles (id, email, full_name, role, plan, is_active, created_at, updated_at)
    VALUES (
      p_auth_user_id,
      v_target_email,
      COALESCE(split_part(v_target_email, '@', 1), 'User'),
      'usuario'::public.user_role,
      'free'::plan_t,
      true,
      now(), now()
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.orphaned_users_log SET
      status = 'resolved',
      resolution = 'Profile created with role=usuario, plan=free',
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;

  ELSIF p_action = 'delete_auth_user' THEN
    UPDATE public.orphaned_users_log SET
      status = 'pending_deletion',
      resolution = p_reason,
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;

  ELSIF p_action = 'ignore' THEN
    UPDATE public.orphaned_users_log SET
      status = 'ignored',
      resolution = p_reason,
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_auth_user_id,
    'ORPHAN_RECONCILED',
    jsonb_build_object(
      'action', p_action,
      'reason', p_reason,
      'email', v_target_email,
      'log_status', CASE
        WHEN p_action = 'create_profile' THEN 'resolved'
        WHEN p_action = 'delete_auth_user' THEN 'pending_deletion'
        WHEN p_action = 'ignore' THEN 'ignored'
      END
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'auth_user_id', p_auth_user_id,
    'action', p_action,
    'new_status', CASE
      WHEN p_action = 'create_profile' THEN 'resolved'
      WHEN p_action = 'delete_auth_user' THEN 'pending_deletion'
      WHEN p_action = 'ignore' THEN 'ignored'
    END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_orphan_user FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_orphan_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_orphan_user TO service_role;

COMMENT ON FUNCTION public.reconcile_orphan_user IS
  'FIX H-7: Anti-spoofing caller_id para resolved_by y performed_by. Autorización sigue usando is_admin() (no spoofable).';

-- ─── Audit log record of the fix itself ──────────────────────────────────
-- NOTE: Skipped because audit_logs has CHECK constraint requiring non-null store_id.
-- The migration itself is the audit artifact (versioned in Git + applied via Management API).
-- INSERT INTO public.audit_logs (...) would fail with audit_logs_store_id_check.
