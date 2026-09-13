-- DECLARED FINAL STATE (Git) de current_user_tenant_id
-- fuente: 20260807000004_v2_21_0_rls_helper_functions.sql stmt#0

CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$
