-- DECLARED FINAL STATE (Git) de current_user_store_ids
-- fuente: 20260807000004_v2_21_0_rls_helper_functions.sql stmt#2

CREATE OR REPLACE FUNCTION public.current_user_store_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_result uuid[];
BEGIN
  IF public.is_admin() THEN
    -- Admin: todas las stores activas de su tenant
    SELECT array_agg(id) INTO v_result
    FROM public.stores
    WHERE tenant_id = public.current_user_tenant_id()
      AND is_active = true;
  ELSE
    -- Non-admin: stores con membership activa
    SELECT array_agg(store_id) INTO v_result
    FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';
  END IF;
  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$$
