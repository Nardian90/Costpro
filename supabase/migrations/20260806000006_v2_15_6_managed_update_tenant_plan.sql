-- ============================================================================
-- Migration: 20260806000006_v2_15_6_managed_update_tenant_plan.sql
-- Iteración 13 — RPC to update tenant plan + sync profiles
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.managed_update_tenant_plan;

CREATE OR REPLACE FUNCTION public.managed_update_tenant_plan(
  p_tenant_id uuid,
  p_plan plan_t,
  p_subscription_status text DEFAULT NULL,
  p_caller_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid := COALESCE(p_caller_id, auth.uid());
  v_old_plan plan_t;
  v_old_status text;
BEGIN
  -- Solo global admin o service_role (Stripe webhook) puede cambiar plan
  IF v_caller_uid IS NOT NULL THEN
    DECLARE
      v_role public.user_role;
    BEGIN
      SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_uid;
      IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
        -- Allow if caller_id is NULL (service_role via Stripe webhook)
        IF v_caller_uid IS NOT NULL THEN
          RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can change tenant plan';
        END IF;
      END IF;
    END;
  END IF;

  -- Snapshot old values
  SELECT plan, subscription_status INTO v_old_plan, v_old_status
    FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TENANT_NOT_FOUND: %', p_tenant_id;
  END IF;

  -- Update tenant
  UPDATE public.tenants SET
    plan = p_plan,
    subscription_status = COALESCE(p_subscription_status, subscription_status),
    updated_at = now()
  WHERE id = p_tenant_id;

  -- Sync profiles.plan (cache)
  UPDATE public.profiles SET
    plan = p_plan,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  -- Audit log
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, NULL, 'TENANT_PLAN_UPDATED',
    jsonb_build_object('old_plan', v_old_plan::text, 'old_status', v_old_status),
    jsonb_build_object('new_plan', p_plan::text, 'new_status', COALESCE(p_subscription_status, v_old_status)),
    jsonb_build_object('tenant_id', p_tenant_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'old_plan', v_old_plan::text,
    'new_plan', p_plan::text
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.managed_update_tenant_plan FROM anon;
GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_update_tenant_plan TO service_role;

COMMENT ON FUNCTION public.managed_update_tenant_plan IS
  'Iteración 13: Updates tenant plan + syncs profiles.plan cache. Called by Stripe webhook or admin.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.managed_update_tenant_plan;
-- ============================================================================
