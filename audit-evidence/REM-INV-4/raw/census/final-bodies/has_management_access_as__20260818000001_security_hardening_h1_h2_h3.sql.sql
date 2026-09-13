-- DECLARED FINAL STATE (Git) de has_management_access_as
-- fuente: 20260818000001_security_hardening_h1_h2_h3.sql stmt#3

CREATE OR REPLACE FUNCTION public.has_management_access_as(
  p_user_id uuid,
  p_store_id uuid
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- service_role always passes
  SELECT CASE WHEN auth.role() = 'service_role' THEN true
    ELSE
      -- Check if user has admin/manager/encargado role in their profile
      -- OR has a membership with manager/admin role for the store
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = p_user_id
        AND role IN ('admin', 'manager', 'encargado')
      )
      OR EXISTS (
        SELECT 1 FROM user_store_memberships
        WHERE user_id = p_user_id
        AND store_id = p_store_id
        AND status = 'active'
        AND role IN ('admin', 'manager')
      )
    END
$$
