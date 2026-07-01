-- Migration: Improve visibility for multi-store management
-- This migration relaxes some RLS policies to allow managers to see all memberships
-- and stores related to the users they manage, facilitating the 'Edit User' workflow.

BEGIN;

-- 1. Relax Stores Visibility
-- Allow all authenticated users to see stores (Select only).
-- This is safe as it only exposes store metadata (name, address, etc.)
DROP POLICY IF EXISTS "Stores visibility" ON public.stores;
CREATE POLICY "Stores visibility" ON public.stores
FOR SELECT TO authenticated
USING (true);

-- 2. Relax Memberships Visibility
-- Allow managers to see ALL memberships of users they manage.
-- We use the SECURITY DEFINER function public.is_managed_user(user_id)
DROP POLICY IF EXISTS "Memberships visibility" ON public.user_store_memberships;
CREATE POLICY "Memberships visibility" ON public.user_store_memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()                             -- Self
  OR public.get_my_role() = 'admin'                -- Admin
  OR public.is_store_manager(store_id)             -- Manager of the store
  OR public.is_user_creator(user_id)               -- Creator of the user
  OR public.is_managed_user(user_id)               -- Managed via store membership (NEW)
);

COMMIT;
