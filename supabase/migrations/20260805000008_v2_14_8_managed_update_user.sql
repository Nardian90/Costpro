-- ============================================================================
-- Migration: 20260805000008_v2_14_8_managed_update_user.sql
-- Iteración 12 — Fix Q3 + H-4 (audit log en updates)
-- ============================================================================
-- Reemplaza el UPDATE directo del frontend (useUpdateUser) con RPC
-- centralizado que valida, ejecuta y audita atómicamente.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_update_user;

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
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
  v_caller_role public.user_role;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Validar caller es admin
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can update users.';
  END IF;

  -- SELECT FOR UPDATE + snapshot
  SELECT * INTO v_old FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND: %', p_user_id;
  END IF;

  -- Bloquear self-deactivate
  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED: Cannot deactivate own account.';
  END IF;

  -- Construir changes + aplicar
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

  -- Audit log atómico (solo si hubo cambios)
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
  'Iteración 12 (Q3 + H-4): Centralized user update with atomic audit log. Replaces frontend direct UPDATE on profiles.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_update_user;
-- ============================================================================
