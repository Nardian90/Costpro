-- ============================================================================
-- Migration: 20260805000014_v2_14_14_detect_reconcile_orphans.sql
-- Iteración 12 — Fix Q4 (reconciliación auth.users ↔ profiles)
-- ============================================================================
-- detect_orphan_users(): detecta auth.users sin profile, los registra en
--   orphaned_users_log (idempotente), retorna la lista.
-- reconcile_orphan_user(): aplica acción explícita de reconciliación.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. detect_orphan_users
DROP FUNCTION IF EXISTS public.detect_orphan_users;

CREATE OR REPLACE FUNCTION public.detect_orphan_users()
RETURNS TABLE(
  auth_user_id uuid,
  email text,
  detected_at timestamptz,
  log_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_orphan RECORD;
BEGIN
  -- Solo admin puede ejecutar
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can detect orphan users.';
  END IF;

  -- Registrar nuevos huérfanos (idempotente por UNIQUE auth_user_id)
  FOR v_orphan IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.orphaned_users_log (auth_user_id, email)
    VALUES (v_orphan.id, v_orphan.email)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;

  -- Retornar huérfanos actuales con status del log
  RETURN QUERY
    SELECT
      o.auth_user_id,
      o.email,
      o.detected_at,
      o.status
    FROM public.orphaned_users_log o
    WHERE o.status IN ('pending', 'pending_deletion')
    ORDER BY o.detected_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.detect_orphan_users FROM anon;
GRANT EXECUTE ON FUNCTION public.detect_orphan_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_orphan_users TO service_role;

COMMENT ON FUNCTION public.detect_orphan_users IS
  'Iteración 12 (Q4): Detects auth.users without profile, logs to orphaned_users_log (idempotent), returns current orphans.';

-- 2. reconcile_orphan_user
DROP FUNCTION IF EXISTS public.reconcile_orphan_user;

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
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
  v_log RECORD;
  v_target_email text;
BEGIN
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
    -- Crear profile mínimo con rol 'usuario' (más restrictivo)
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
    -- Marcar como pending_deletion — API route invocará auth.admin.deleteUser
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

  -- Audit log (sin performed_by en target porque target es auth.users, no profile)
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
  'Iteración 12 (Q4): Explicit orphan reconciliation. Actions: create_profile, delete_auth_user (via API route), ignore.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.detect_orphan_users;
-- DROP FUNCTION IF EXISTS public.reconcile_orphan_user;
-- ============================================================================
