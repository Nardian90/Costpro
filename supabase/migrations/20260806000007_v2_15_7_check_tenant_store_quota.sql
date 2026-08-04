-- ============================================================================
-- Migration: 20260806000007_v2_15_7_check_tenant_store_quota.sql
-- Iteración 13 — Per-tenant store quota check
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.check_tenant_store_quota;

CREATE OR REPLACE FUNCTION public.check_tenant_store_quota(
  p_tenant_id uuid,
  p_plan plan_t DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_plan plan_t;
  v_limit int;
  v_current int;
  v_allowed boolean;
BEGIN
  -- Get plan from tenant if not passed
  IF p_plan IS NULL THEN
    SELECT plan INTO v_plan FROM public.tenants WHERE id = p_tenant_id;
  ELSE
    v_plan := p_plan;
  END IF;

  -- Plan limits (unified source of truth)
  v_limit := CASE v_plan
    WHEN 'free'::plan_t THEN 1
    WHEN 'pro'::plan_t THEN 3
    WHEN 'enterprise'::plan_t THEN 10
    ELSE 1
  END;

  -- Count active stores in tenant
  SELECT COUNT(*) INTO v_current
    FROM public.stores
    WHERE tenant_id = p_tenant_id AND is_active = true;

  v_allowed := v_current < v_limit;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current', v_current,
    'limit', v_limit,
    'plan', v_plan::text,
    'tenant_id', p_tenant_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_tenant_store_quota FROM anon;
GRANT EXECUTE ON FUNCTION public.check_tenant_store_quota TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_tenant_store_quota TO service_role;

COMMENT ON FUNCTION public.check_tenant_store_quota IS
  'Iteración 13: Per-tenant store quota. Limits: free=1, pro=3, enterprise=10.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.check_tenant_store_quota;
-- ============================================================================
