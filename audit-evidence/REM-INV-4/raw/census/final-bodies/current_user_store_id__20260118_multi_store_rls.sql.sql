-- DECLARED FINAL STATE (Git) de current_user_store_id
-- fuente: 20260118_multi_store_rls.sql stmt#0

CREATE OR REPLACE FUNCTION public.current_user_store_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
BEGIN
    RETURN (SELECT active_store_id FROM public.profiles WHERE id = auth.uid());
END;
$$
