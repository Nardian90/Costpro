-- Final RLS Recursion Fix
-- This migration breaks the infinite recursion loop by using SECURITY DEFINER functions that bypass RLS.

BEGIN;

-- 1. Helper: get_my_role
-- Bypasses RLS to get the current user's role from the profiles table.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Helper: is_store_manager
-- Bypasses RLS to check if the current user has a management role in a specific store.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Redefine Profiles Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles access policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles access" ON public.profiles;
DROP POLICY IF EXISTS "Encargados can view profiles in their stores" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by admins and owners" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are manageable by admins and creators" ON public.profiles;

CREATE POLICY "Profiles visibility" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()                             -- Self
  OR public.get_my_role() = 'admin'           -- Admin
  OR created_by = auth.uid()                  -- Creator
  OR EXISTS (                                 -- Managed via store membership
    SELECT 1 FROM public.user_store_memberships usm
    WHERE usm.user_id = public.profiles.id
      AND public.is_store_manager(usm.store_id)
  )
);

CREATE POLICY "Profiles management" ON public.profiles
FOR ALL TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR created_by = auth.uid()
);

-- 4. Redefine Memberships Policies
ALTER TABLE public.user_store_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Memberships access policy" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Memberships access" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Encargados can view memberships in their stores" ON public.user_store_memberships;

CREATE POLICY "Memberships visibility" ON public.user_store_memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_my_role() = 'admin'
  OR public.is_store_manager(store_id)
);

CREATE POLICY "Memberships management" ON public.user_store_memberships
FOR ALL TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR public.is_store_manager(store_id) -- Managers can manage memberships in their store
);

-- 5. Redefine Stores Policies
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stores access policy" ON public.stores;
DROP POLICY IF EXISTS "Stores access" ON public.stores;
DROP POLICY IF EXISTS "Users can view assigned stores" ON public.stores;
DROP POLICY IF EXISTS "Admins and Encargados can manage stores" ON public.stores;

CREATE POLICY "Stores visibility" ON public.stores
FOR SELECT TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE store_id = public.stores.id
      AND user_id = auth.uid()
      AND status = 'active'
  )
);

CREATE POLICY "Stores management" ON public.stores
FOR ALL TO authenticated
USING (
  public.get_my_role() = 'admin'
  OR (public.get_my_role() = 'encargado' AND created_by = auth.uid())
);

-- 6. Ensure data consistency: Populate memberships from profiles
INSERT INTO public.user_store_memberships (user_id, store_id, role)
SELECT id, store_id, role
FROM public.profiles
WHERE store_id IS NOT NULL
ON CONFLICT (user_id, store_id) DO NOTHING;

INSERT INTO public.user_store_memberships (user_id, store_id, role)
SELECT id, active_store_id, role
FROM public.profiles
WHERE active_store_id IS NOT NULL
ON CONFLICT (user_id, store_id) DO NOTHING;

COMMIT;
