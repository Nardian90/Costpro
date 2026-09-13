-- DECLARED FINAL STATE (Git) de is_admin_with_access
-- fuente: 20260807000004_v2_21_0_rls_helper_functions.sql stmt#4

CREATE OR REPLACE FUNCTION public.is_admin_with_access(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_is_admin boolean;
  v_user_tenant uuid;
  v_store_tenant uuid;
BEGIN
  -- Si no es admin, debe usar has_store_access() normal
  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RETURN public.has_store_access(p_store_id);
  END IF;

  -- Si es admin, verificar que el store pertenece a su tenant
  v_user_tenant := public.current_user_tenant_id();
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;

  -- Si el store no tiene tenant (legacy) o coincide con el del admin → allow
  RETURN v_store_tenant IS NULL OR v_store_tenant = v_user_tenant;
END;
$$
