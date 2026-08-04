-- ============================================================================
-- Migration: 20260805000011_v2_14_11_managed_soft_delete_user.sql
-- Iteración 12 — Fix Q6 + H-8 (soft delete + audit log)
-- ============================================================================
-- Reemplaza managed_delete_user (que hacía DELETE físico).
-- Soft delete: marca deleted_at, anonimiza PII, revoca memberships.
-- Preserva auth.users (banneado desde API route).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_soft_delete_user;

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
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
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

  -- SELECT FOR UPDATE (solo perfiles no eliminados)
  SELECT id, email, full_name, role, plan, is_active INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND_OR_ALREADY_DELETED';
  END IF;

  -- Bloquear si tiene memberships activas (caller debe revocarlas primero)
  SELECT COUNT(*) INTO v_active_memberships_count
    FROM public.user_store_memberships
    WHERE user_id = p_user_id AND status = 'active';
  IF v_active_memberships_count > 0 THEN
    RAISE EXCEPTION 'ERR_USER_HAS_ACTIVE_MEMBERSHIPS: % active. Revoke memberships first.', v_active_memberships_count;
  END IF;

  -- Generar email anónimo
  v_anon_email := 'deleted+' || substr(p_user_id::text, 1, 8) || '@anonymized.local';

  -- Soft delete + anonimizar PII
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

  -- Revocar todas las memberships (por si acaso, aunque el check arriba debería bloquear)
  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  -- Audit log atómico
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
  'Iteración 12 (Q6): Soft delete with PII anonymization. Preserves auth.users (banned from API route). Atomic audit log.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_soft_delete_user;
-- ============================================================================
