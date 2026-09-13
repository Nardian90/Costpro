-- DECLARED FINAL STATE (Git) de is_store_manager
-- fuente: 20260126_final_rls_fix.sql stmt#2

CREATE OR REPLACE FUNCTION public.is_store_manager(p_store_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND store_id = p_store_id
      AND role IN ('encargado', 'manager')
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
