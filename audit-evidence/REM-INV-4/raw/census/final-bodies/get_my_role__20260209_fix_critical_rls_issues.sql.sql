-- DECLARED FINAL STATE (Git) de get_my_role
-- fuente: 20260209_fix_critical_rls_issues.sql stmt#5

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  -- Return default if user profile doesn't exist (shouldn't happen in prod, but defensive)
  RETURN COALESCE(v_role, 'usuario');
END;
$$
