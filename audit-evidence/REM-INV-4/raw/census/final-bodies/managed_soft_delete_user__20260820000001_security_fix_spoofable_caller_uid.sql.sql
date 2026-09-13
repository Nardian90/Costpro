-- DECLARED FINAL STATE (Git) de managed_soft_delete_user
-- fuente: 20260820000001_security_fix_spoofable_caller_uid.sql stmt#15

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
$function$
