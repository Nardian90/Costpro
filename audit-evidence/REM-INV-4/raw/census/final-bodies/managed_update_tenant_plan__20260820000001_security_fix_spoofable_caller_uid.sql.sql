-- DECLARED FINAL STATE (Git) de managed_update_tenant_plan
-- fuente: 20260820000001_security_fix_spoofable_caller_uid.sql stmt#35

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
  -- FIX H-7: anti-spoofing — service_role (Stripe webhook) puede pasar NULL caller_id
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_old_plan plan_t;
  v_old_status text;
  v_role public.user_role;
BEGIN
  -- Validación: si caller_uid es NULL (service_role anónimo para Stripe webhook), permitir
  -- Si caller_uid NO es NULL, debe ser admin/superadmin
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_uid;
    IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can change tenant plan';
    END IF;
  END IF;

  SELECT plan, subscription_status INTO v_old_plan, v_old_status
    FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TENANT_NOT_FOUND: %', p_tenant_id;
  END IF;

  UPDATE public.tenants SET
    plan = p_plan,
    subscription_status = COALESCE(p_subscription_status, subscription_status),
    updated_at = now()
  WHERE id = p_tenant_id;

  UPDATE public.profiles SET
    plan = p_plan,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

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
$function$
