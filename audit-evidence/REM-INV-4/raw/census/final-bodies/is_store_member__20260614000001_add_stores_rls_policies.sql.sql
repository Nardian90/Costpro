-- DECLARED FINAL STATE (Git) de is_store_member
-- fuente: 20260614000001_add_stores_rls_policies.sql stmt#4

CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$
