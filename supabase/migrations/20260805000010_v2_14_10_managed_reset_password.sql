-- ============================================================================
-- Migration: 20260805000010_v2_14_10_managed_reset_password.sql
-- Iteración 12 — Fix H-6 (audit log en reset password)
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_reset_password;

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
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
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
  'Iteración 12 (H-6): Audit log for password reset. API route generates the recovery link via auth.admin.generateLink.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_reset_password;
-- ============================================================================
