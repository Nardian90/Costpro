-- DECLARED FINAL STATE (Git) de managed_reset_password
-- fuente: 20260820000001_security_fix_spoofable_caller_uid.sql stmt#20

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
$function$
