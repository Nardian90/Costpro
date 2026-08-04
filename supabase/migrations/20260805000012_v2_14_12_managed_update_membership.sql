-- ============================================================================
-- Migration: 20260805000012_v2_14_12_managed_update_membership.sql
-- Iteración 12 — Fix H-5 (audit log en cambio de rol por tienda)
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_update_membership;

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
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
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

  -- Validar caller es admin o manager del store
  IF NOT public.has_store_role(v_old.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin or manager of the store.';
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.user_store_memberships SET role = p_role, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> v_old.status THEN
    IF p_status NOT IN ('active', 'revoked') THEN
      RAISE EXCEPTION 'ERR_INVALID_STATUS: %', p_status;
    END IF;
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_status));
    UPDATE public.user_store_memberships SET status = p_status, updated_at = now() WHERE id = p_membership_id;
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
  'Iteración 12 (H-5): Update membership role/status with atomic audit log. Validates caller is admin/manager of the store.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_update_membership;
-- ============================================================================
