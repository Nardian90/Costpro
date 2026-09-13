-- DECLARED FINAL STATE (Git) de is_tenant_member
-- fuente: 20260807000004_v2_21_0_rls_helper_functions.sql stmt#6

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT p_tenant_id IS NOT NULL
   AND p_tenant_id = public.current_user_tenant_id();
$$
