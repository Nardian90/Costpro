-- DECLARED FINAL STATE (Git) de is_role_not_changed
-- fuente: 20260305_fix_profiles_rls_final.sql stmt#2

CREATE OR REPLACE FUNCTION public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old_role user_role;
  v_old_role_id uuid;
BEGIN
  SELECT role, role_id INTO v_old_role, v_old_role_id
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN (p_new_role IS NOT DISTINCT FROM v_old_role)
     AND (p_new_role_id IS NOT DISTINCT FROM v_old_role_id);
END;
$$
