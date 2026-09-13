-- DECLARED FINAL STATE (Git) de is_global_admin
-- fuente: 20260614000001_add_stores_rls_policies.sql stmt#2

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$
