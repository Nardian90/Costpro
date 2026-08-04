-- ============================================================================
-- Migration: 20260805000015_v2_14_15_get_user_audit_history.sql
-- Iteración 12 — RPC para historial de auditoría de un usuario
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_user_audit_history;

CREATE OR REPLACE FUNCTION public.get_user_audit_history(
  p_user_id uuid,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  performed_by uuid,
  performed_by_name text,
  action text,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    ual.id,
    ual.created_at,
    ual.performed_by,
    COALESCE(p.full_name, '[unknown]') as performed_by_name,
    ual.action,
    ual.old_values,
    ual.new_values,
    ual.metadata
  FROM public.user_audit_log ual
  LEFT JOIN public.profiles p ON p.id = ual.performed_by
  WHERE ual.target_user_id = p_user_id
  ORDER BY ual.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_audit_history FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_audit_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_audit_history TO service_role;

COMMENT ON FUNCTION public.get_user_audit_history IS
  'Iteración 12: Returns audit history for a user. Admin-only. Paginated (max 500).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_user_audit_history;
-- ============================================================================
