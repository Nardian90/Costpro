-- Fix RLS Recursion and 500 Errors
BEGIN;

-- 1. Redefine is_admin to be non-recursive and secure
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  -- We use a subquery that is executed with SECURITY DEFINER privileges (postgres)
  -- This bypasses RLS and prevents the infinite recursion loop
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Redefine is_manager_of_store to be non-recursive and secure
CREATE OR REPLACE FUNCTION public.is_manager_of_store(p_store_id uuid)
RETURNS boolean AS $$
BEGIN
  -- We use a subquery that is executed with SECURITY DEFINER privileges (postgres)
  -- This bypasses RLS on user_store_memberships
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND store_id = p_store_id
      AND role IN ('encargado', 'manager')
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Clean up and simplify policies to avoid any hidden recursion
-- Profiles Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by admins and owners" ON public.profiles;
DROP POLICY IF EXISTS "Encargados can view profiles in their stores" ON public.profiles;

CREATE POLICY "Profiles access policy" ON public.profiles
FOR SELECT TO authenticated
USING (
    public.is_admin()              -- Admin sees all (bypasses via function)
    OR id = auth.uid()             -- Owner sees self
    OR created_by = auth.uid()     -- Creator sees created users
    OR EXISTS (                    -- Encargado sees users in managed stores
        SELECT 1 FROM public.user_store_memberships usm
        WHERE usm.user_id = public.profiles.id
          AND public.is_manager_of_store(usm.store_id)
    )
);

-- User Store Memberships Policies
ALTER TABLE public.user_store_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Encargados can view memberships in their stores" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.user_store_memberships;

CREATE POLICY "Memberships access policy" ON public.user_store_memberships
FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR public.is_manager_of_store(store_id)
);

-- 4. Fix potential issues with stores visibility
DROP POLICY IF EXISTS "Users can view assigned stores" ON public.stores;
CREATE POLICY "Stores access policy" ON public.stores
FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE store_id = public.stores.id
          AND user_id = auth.uid()
          AND status = 'active'
    )
);

COMMIT;
