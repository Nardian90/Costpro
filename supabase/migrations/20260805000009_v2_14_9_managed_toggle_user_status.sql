-- ============================================================================
-- Migration: 20260805000009_v2_14_9_managed_toggle_user_status.sql
-- Iteración 12 — Fix C-3 (audit log estructurado)
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_toggle_user_status;

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
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
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
  'Iteración 12 (C-3): Toggle user status with atomic audit log. API route handles auth.admin.signOut for deactivation.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_toggle_user_status;
-- ============================================================================
