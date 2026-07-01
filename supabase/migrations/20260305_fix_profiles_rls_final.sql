-- Migration: Fix Profiles RLS Recursion and Admin Access
-- This migration replaces problematic policies with optimized versions that avoid recursion
-- by using SECURITY DEFINER functions and breaking circular dependencies.

BEGIN;

-- 1. Optimized and robust is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
      AND (
        p.role = ANY(ARRAY['admin', 'superadmin']::user_role[])
        OR lower(r.name) IN ('admin', 'superadmin')
      )
  );
END;
$$;

-- 2. Function to check if role is being changed, bypassing RLS
CREATE OR REPLACE FUNCTION public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old_role user_role;
  v_old_role_id uuid;
BEGIN
  SELECT role, role_id INTO v_old_role, v_old_role_id
  FROM public.profiles
  WHERE id = p_user_id;

  RETURN (p_new_role IS NOT DISTINCT FROM v_old_role)
     AND (p_new_role_id IS NOT DISTINCT FROM v_old_role_id);
END;
$$;

-- 3. Drop existing problematic policies
DROP POLICY IF EXISTS "Profiles unified select" ON public.profiles;
DROP POLICY IF EXISTS "Profiles unified update" ON public.profiles;
DROP POLICY IF EXISTS "Profiles visibility" ON public.profiles;
DROP POLICY IF EXISTS "Self profile update" ON public.profiles;
DROP POLICY IF EXISTS "Admin can manage any profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_full_access" ON public.profiles;

-- 4. Re-create SELECT policy (Simplified and Recursive-safe)
CREATE POLICY "profiles_select_v2"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()                             -- Self
    OR public.is_admin()                        -- Admin
    OR created_by = auth.uid()                  -- Creator
    OR public.is_managed_user(id)               -- Managed via memberships
  );

-- 5. Re-create UPDATE policy (Recursive-safe)
CREATE POLICY "profiles_update_v2"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    public.is_admin()                           -- Admin can update anything
    OR (
      id = auth.uid()                           -- User can update self
      AND public.is_role_not_changed(id, role, role_id) -- But cannot change own role
    )
  );

-- 6. Add INSERT/DELETE policies for completeness (Admins only)
CREATE POLICY "profiles_insert_admin"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_delete_admin"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Grant permissions on the new functions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_role_not_changed(uuid, user_role, uuid) TO authenticated;

COMMIT;
