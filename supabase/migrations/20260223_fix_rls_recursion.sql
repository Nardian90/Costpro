-- Migration: Fix RLS Infinite Recursion
-- This migration replaces direct table subqueries in RLS policies with SECURITY DEFINER functions
-- to break circular dependencies between profiles and user_store_memberships.

BEGIN;

-- 1. Helper: is_user_creator
-- Safely checks if the current user created the target user.
CREATE OR REPLACE FUNCTION public.is_user_creator(p_target_user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target_user_id AND created_by = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Helper: is_managed_user
-- Safely checks if the target user shares any store managed by the current user.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Update Profiles Policies
DROP POLICY IF EXISTS "Profiles visibility" ON public.profiles;
CREATE POLICY "Profiles visibility" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()                             -- Self
  OR public.get_my_role() = 'admin'           -- Admin
  OR created_by = auth.uid()                  -- Creator
  OR public.is_managed_user(id)               -- Managed via store membership (SAFE)
);

-- 4. Update Memberships Policies
DROP POLICY IF EXISTS "Memberships visibility" ON public.user_store_memberships;
CREATE POLICY "Memberships visibility" ON public.user_store_memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()                             -- Self
  OR public.get_my_role() = 'admin'                -- Admin
  OR public.is_store_manager(store_id)             -- Manager of the store (SAFE)
  OR public.is_user_creator(user_id)               -- Creator of the user (SAFE)
);

COMMIT;
