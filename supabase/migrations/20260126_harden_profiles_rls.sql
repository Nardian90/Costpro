-- Migration: Harden Profiles RLS for Admins
-- This migration optimizes the Profiles visibility policy to be more robust
-- and ensure admins always have access.

BEGIN;

-- 1. Helper function to check if the current user is an admin without recursion
-- We use a SECURITY DEFINER function to bypass RLS during the check.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update Profiles Visibility Policy
DROP POLICY IF EXISTS "Profiles visibility" ON public.profiles;

CREATE POLICY "Profiles visibility" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()                             -- I can see myself
  OR public.is_admin()                        -- Admins can see everyone
  OR created_by = auth.uid()                  -- I can see users I created
  OR EXISTS (                                 -- I can see users in stores I manage
    SELECT 1 FROM public.user_store_memberships usm
    WHERE usm.user_id = public.profiles.id
      AND public.is_store_manager(usm.store_id)
  )
);

COMMIT;
