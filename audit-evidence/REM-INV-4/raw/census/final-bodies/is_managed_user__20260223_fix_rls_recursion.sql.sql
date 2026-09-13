-- DECLARED FINAL STATE (Git) de is_managed_user
-- fuente: 20260223_fix_rls_recursion.sql stmt#2

CREATE OR REPLACE FUNCTION public.is_managed_user(p_target_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships usm_target
    WHERE usm_target.user_id = p_target_user_id
      AND EXISTS (
        SELECT 1 FROM public.user_store_memberships usm_me
        WHERE usm_me.user_id = auth.uid()
          AND usm_me.store_id = usm_target.store_id
          AND usm_me.role IN ('encargado', 'manager')
          AND usm_me.status = 'active'
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
