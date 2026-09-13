-- DECLARED FINAL STATE (Git) de has_store_role_as
-- fuente: 20260807000002_v2_16_2_has_store_role_as.sql stmt#1

CREATE OR REPLACE FUNCTION public.has_store_role_as(
  p_user_id uuid,
  p_store_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global bypasses
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'superadmin')) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role::text = ANY(p_roles)
  );
END;
$function$
