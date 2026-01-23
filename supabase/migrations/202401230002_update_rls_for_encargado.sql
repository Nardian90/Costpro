-- Drop the old restrictive policies
DROP POLICY IF EXISTS "Profiles are viewable by admins and owners" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own store access" ON public.user_store_access;
DROP POLICY IF EXISTS "Users can view assigned stores" ON public.stores;

-- Create new policies that grant access based on store membership for 'encargado'

-- 1. Profiles Policy
-- Allows admins to see all profiles.
-- Allows users to see their own profile.
-- Allows 'encargado' to see profiles of all users who share a store with them.
CREATE POLICY "Profiles viewable by admin, owner, and store manager"
ON public.profiles FOR SELECT
TO authenticated
USING (
  is_admin() OR
  (id = auth.uid()) OR
  (has_role('encargado') AND id IN (SELECT g.user_id FROM get_users_for_encargado(auth.uid()) g))
);

-- 2. User Store Access Policy
-- Allows admins to see all access records.
-- Allows users to see their own access records.
-- Allows 'encargado' to see access records for all users in their stores.
CREATE POLICY "User store access viewable by admin, owner, and store manager"
ON public.user_store_access FOR SELECT
TO authenticated
USING (
  is_admin() OR
  (user_id = auth.uid()) OR
  (has_role('encargado') AND user_id IN (SELECT g.user_id FROM get_users_for_encargado(auth.uid()) g))
);

-- 3. Stores Policy (Re-affirmation)
-- Allows users to see stores they have been explicitly granted access to.
CREATE POLICY "Users can view assigned stores"
ON public.stores FOR SELECT
TO authenticated
USING (
  has_store_access(id)
);
