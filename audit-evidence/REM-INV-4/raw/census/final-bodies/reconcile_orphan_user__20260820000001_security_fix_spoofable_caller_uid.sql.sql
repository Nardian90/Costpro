-- DECLARED FINAL STATE (Git) de reconcile_orphan_user
-- fuente: 20260820000001_security_fix_spoofable_caller_uid.sql stmt#40

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
$function$
