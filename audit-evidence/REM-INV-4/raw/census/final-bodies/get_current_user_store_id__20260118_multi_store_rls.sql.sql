-- DECLARED FINAL STATE (Git) de get_current_user_store_id
-- fuente: 20260118_multi_store_rls.sql stmt#1

CREATE OR REPLACE FUNCTION public.get_current_user_store_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN public.current_user_store_id();
END;
$$
