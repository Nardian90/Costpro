-- DECLARED FINAL STATE (Git) de has_store_role
-- fuente: 20260820000001_security_fix_spoofable_caller_uid.sql stmt#0

CREATE OR REPLACE FUNCTION public.has_store_role(
  p_user_id uuid,
  p_store_id uuid,
  p_roles text[]
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN auth.role() = 'service_role' THEN
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = p_user_id
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  ELSE
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid()
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  END
$$
