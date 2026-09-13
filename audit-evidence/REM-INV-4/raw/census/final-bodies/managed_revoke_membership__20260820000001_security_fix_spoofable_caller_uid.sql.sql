-- DECLARED FINAL STATE (Git) de managed_revoke_membership
-- fuente: 20260820000001_security_fix_spoofable_caller_uid.sql stmt#30

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
$function$
