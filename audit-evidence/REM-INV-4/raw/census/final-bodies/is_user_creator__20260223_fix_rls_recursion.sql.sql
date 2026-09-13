-- DECLARED FINAL STATE (Git) de is_user_creator
-- fuente: 20260223_fix_rls_recursion.sql stmt#1

CREATE OR REPLACE FUNCTION public.is_user_creator(p_target_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target_user_id AND created_by = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
