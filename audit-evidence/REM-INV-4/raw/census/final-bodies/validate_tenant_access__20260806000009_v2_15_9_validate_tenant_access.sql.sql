-- DECLARED FINAL STATE (Git) de validate_tenant_access
-- fuente: 20260806000009_v2_15_9_validate_tenant_access.sql stmt#1

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
$function$
