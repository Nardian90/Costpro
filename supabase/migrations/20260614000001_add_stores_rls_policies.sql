-- =============================================================================
-- Migration: Add Row Level Security policies to stores and user_store_memberships
-- Date: 2026-06-14
-- Task: P1-RLS
--
-- Previously, ANY authenticated user could read/write ANY store via the
-- Supabase client because there were zero RLS policies. This migration
-- enforces the same application-level rules that store-service.ts and the
-- API routes implement, but at the database level.
--
-- IMPORTANT STABILITY NOTES:
--   - The service-role key (used by API routes) bypasses RLS, so those
--     routes continue working unchanged.
--   - Client-side queries through the anon key + JWT are now filtered by
--     these policies. The policies are designed to allow the same operations
--     that the current application performs.
--   - No existing data or columns are modified or dropped.
-- =============================================================================

-- =============================================================================
-- STEP 1: Enable Row Level Security
-- =============================================================================

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_store_memberships ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 2: Helper functions (SECURITY DEFINER to avoid RLS recursion)
--
-- These functions execute with the privileges of the function owner
-- (typically the database superuser), which bypasses RLS on internal
-- queries. This is necessary because:
--   a) RLS policies on user_store_memberships reference the same table,
--      which would cause recursive evaluation without SECURITY DEFINER.
--   b) The functions only return BOOLEAN values (not data), so there is
--      no risk of leaking row-level information.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- is_global_admin(): Returns TRUE if the currently authenticated user has
-- the global role 'admin' in the profiles table.
-- ---------------------------------------------------------------------------
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
$$;

COMMENT ON FUNCTION public.is_global_admin() IS
  'RLS helper: returns TRUE when the current user has global admin role in profiles. SECURITY DEFINER to avoid recursive RLS evaluation.';

-- ---------------------------------------------------------------------------
-- is_store_member(p_store_id): Returns TRUE if the currently authenticated
-- user has an active membership in the specified store.
-- ---------------------------------------------------------------------------
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
$$;

COMMENT ON FUNCTION public.is_store_member(UUID) IS
  'RLS helper: returns TRUE when the current user is an active member of the given store. SECURITY DEFINER to avoid recursive RLS evaluation.';

-- ---------------------------------------------------------------------------
-- has_store_role(p_store_id, p_roles): Returns TRUE if the currently
-- authenticated user has an active membership in the specified store with
-- one of the allowed roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id UUID, p_roles TEXT[])
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
      AND role::text = ANY(p_roles)
  );
$$;

COMMENT ON FUNCTION public.has_store_role(UUID, TEXT[]) IS
  'RLS helper: returns TRUE when the current user has one of the specified roles in the given store. SECURITY DEFINER to avoid recursive RLS evaluation. Casts role enum to text for comparison with TEXT[] parameter.';

-- =============================================================================
-- STEP 3: RLS Policies for the `stores` table
-- =============================================================================

-- ---------------------------------------------------------------------------
-- stores / SELECT (authenticated):
--   Any authenticated user can read stores they are an active member of
--   (via user_store_memberships). Global admin users can read ALL stores.
--   This aligns with the useStores() hook which fetches stores and then
--   filters client-side — with RLS the filtering happens at the DB level.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_select_authenticated" ON public.stores;
CREATE POLICY "stores_select_authenticated" ON public.stores
  FOR SELECT TO authenticated
  USING (
    -- Global admins can read all stores regardless of membership
    public.is_global_admin()
    OR
    -- Active members can read stores they belong to
    public.is_store_member(stores.id)
  );

-- ---------------------------------------------------------------------------
-- stores / SELECT (anon):
--   Unauthenticated requests (e.g. the public storefront API at
--   /api/storefront/[slug]) can only read active stores. This is necessary
--   because createServerClient() uses the anon key without a user JWT,
--   so auth.uid() returns NULL. Restricting to is_active = true prevents
--   leaking soft-deleted stores.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_select_anon" ON public.stores;
CREATE POLICY "stores_select_anon" ON public.stores
  FOR SELECT TO anon
  USING (stores.is_active = true);

-- ---------------------------------------------------------------------------
-- stores / INSERT:
--   Only authenticated users with global role 'admin' or 'manager' can
--   create stores. Plan limit enforcement remains at the application level
--   (API route), but this policy ensures only authorized roles can insert
--   at the DB level.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_insert_admin_manager" ON public.stores;
CREATE POLICY "stores_insert_admin_manager" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- ---------------------------------------------------------------------------
-- stores / UPDATE:
--   Only users who are active members of the store with role 'admin',
--   'manager', or 'encargado' can update it. This matches the
--   STORE_MUTATION_ROLES constant in store-service.ts.
--
--   Note: Soft-delete (UPDATE is_active = false) also goes through this
--   policy. The application-level rule that only admin members can
--   soft-delete is enforced by the API route handler. RLS cannot
--   distinguish between a regular update and a soft-delete update.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_update_member_roles" ON public.stores;
CREATE POLICY "stores_update_member_roles" ON public.stores
  FOR UPDATE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(stores.id, ARRAY['admin', 'manager', 'encargado'])
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(stores.id, ARRAY['admin', 'manager', 'encargado'])
  );

-- ---------------------------------------------------------------------------
-- stores / DELETE:
--   Only users who are active members of the store with role 'admin' can
--   hard-delete a store row. In practice the application only uses
--   soft-delete (UPDATE is_active = false), but this policy guards against
--   direct SQL DELETEs.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_delete_admin_only" ON public.stores;
CREATE POLICY "stores_delete_admin_only" ON public.stores
  FOR DELETE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(stores.id, ARRAY['admin'])
  );

-- =============================================================================
-- STEP 4: RLS Policies for the `user_store_memberships` table
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_store_memberships / SELECT (authenticated):
--   1. Users can read their own memberships (user_id = auth.uid()).
--   2. Global admin users can read all memberships.
--   3. Manager/encargado members of a store can read memberships for that
--      store (needed by the user management UI for non-admin managers).
--
--   This ensures the useUsers() and useUserStoreAccess() hooks continue
--   working: admins see all memberships, managers/encargados see
--   memberships for stores they manage, and regular users see only their
--   own.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "memberships_select_own_and_managed" ON public.user_store_memberships;
CREATE POLICY "memberships_select_own_and_managed" ON public.user_store_memberships
  FOR SELECT TO authenticated
  USING (
    -- Users can always read their own memberships
    user_id = auth.uid()
    OR
    -- Global admins can read all memberships
    public.is_global_admin()
    OR
    -- Manager/encargado members can read memberships for stores they manage
    public.has_store_role(store_id, ARRAY['admin', 'manager', 'encargado'])
  );

-- ---------------------------------------------------------------------------
-- user_store_memberships / SELECT (anon):
--   Unauthenticated users cannot read any membership data.
-- ---------------------------------------------------------------------------
-- (No policy for anon = default deny)

-- ---------------------------------------------------------------------------
-- user_store_memberships / INSERT:
--   Only admin/manager members of the store can add new memberships.
--   Global admins are also allowed. The initial membership for a new store
--   is created by the API route using the service-role key (bypasses RLS),
--   so the chicken-and-egg problem is avoided.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "memberships_insert_admin_manager" ON public.user_store_memberships;
CREATE POLICY "memberships_insert_admin_manager" ON public.user_store_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(store_id, ARRAY['admin', 'manager'])
  );

-- ---------------------------------------------------------------------------
-- user_store_memberships / UPDATE:
--   Only admin members of the store can change membership roles/status.
--   Global admins are also allowed. This prevents managers from elevating
--   other users' roles or revoking memberships they shouldn't control.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "memberships_update_admin" ON public.user_store_memberships;
CREATE POLICY "memberships_update_admin" ON public.user_store_memberships
  FOR UPDATE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(store_id, ARRAY['admin'])
  )
  WITH CHECK (
    public.is_global_admin()
    OR public.has_store_role(store_id, ARRAY['admin'])
  );

-- ---------------------------------------------------------------------------
-- user_store_memberships / DELETE:
--   Only admin members of the store can remove memberships.
--   Global admins are also allowed. Hard deletes should be rare — the
--   application uses UPDATE status = 'revoked' for soft removal, which
--   goes through the UPDATE policy above.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "memberships_delete_admin" ON public.user_store_memberships;
CREATE POLICY "memberships_delete_admin" ON public.user_store_memberships
  FOR DELETE TO authenticated
  USING (
    public.is_global_admin()
    OR public.has_store_role(store_id, ARRAY['admin'])
  );

-- =============================================================================
-- STEP 5: Performance indexes for RLS policy evaluation
--
-- These composite indexes optimize the subqueries used by the helper
-- functions and RLS policies, ensuring O(1) lookups instead of full
-- table scans on every policy evaluation.
-- =============================================================================

-- Index for is_store_member() and has_store_role() lookups:
--   WHERE store_id = ? AND user_id = ? AND status = 'active' AND role = ANY(?)
CREATE INDEX IF NOT EXISTS idx_user_store_memberships_rls_lookup
  ON public.user_store_memberships (user_id, store_id, status, role);

-- Index for is_global_admin() lookups:
--   WHERE id = ? AND role = 'admin'
CREATE INDEX IF NOT EXISTS idx_profiles_rls_admin_lookup
  ON public.profiles (id, role) WHERE role = 'admin';
