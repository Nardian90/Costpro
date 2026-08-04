-- ============================================================================
-- Migration: 20260806000009_v2_15_9_validate_tenant_access.sql
-- Iteración 13 — Application-layer tenant access validation
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.validate_tenant_access;

CREATE OR REPLACE FUNCTION public.validate_tenant_access(
  p_user_id uuid,
  p_store_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_user_tenant uuid;
  v_store_tenant uuid;
  v_user_role public.user_role;
BEGIN
  -- Global admin bypasses tenant check
  SELECT role, tenant_id INTO v_user_role, v_user_tenant
    FROM public.profiles WHERE id = p_user_id;

  IF v_user_role IN ('admin', 'superadmin') THEN
    RETURN true;
  END IF;

  -- Get store's tenant
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;

  IF v_store_tenant IS NULL THEN
    -- Legacy store without tenant — allow (backward compat)
    RETURN true;
  END IF;

  -- Check tenant match
  RETURN v_user_tenant = v_store_tenant;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_tenant_access FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_tenant_access TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_tenant_access TO service_role;

COMMENT ON FUNCTION public.validate_tenant_access IS
  'Iteración 13: Application-layer tenant access check. Global admin bypasses. Legacy stores (tenant_id NULL) allowed.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.validate_tenant_access;
-- ============================================================================
