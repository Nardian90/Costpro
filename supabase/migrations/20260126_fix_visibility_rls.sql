-- Fix RLS and synchronize visibility model with user_store_memberships
BEGIN;

-- 1. Update has_store_access to use user_store_memberships
CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN (
        public.is_admin()
        OR
        EXISTS (
            SELECT 1 FROM public.user_store_memberships
            WHERE user_id = auth.uid()
              AND store_id = p_store_id
              AND status = 'active'
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Update RLS policies for user_store_memberships
-- Allow Encargados/Managers to see memberships in stores they manage
-- Use a function to avoid recursion
CREATE OR REPLACE FUNCTION public.is_manager_of_store(p_store_id uuid)
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "Encargados can view memberships in their stores" ON public.user_store_memberships;
CREATE POLICY "Encargados can view memberships in their stores"
    ON public.user_store_memberships FOR SELECT
    USING (
        user_id = auth.uid() -- Can see own
        OR public.is_manager_of_store(store_id) -- Or if they manage the store
        OR public.is_admin() -- Or if admin
    );

-- 3. Update RLS policies for profiles
-- Allow Encargados/Managers to see profiles of users in their stores
DROP POLICY IF EXISTS "Encargados can view profiles in their stores" ON public.profiles;
CREATE POLICY "Encargados can view profiles in their stores"
    ON public.profiles FOR SELECT
    USING (
        public.is_admin()
        OR id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.user_store_memberships usm
            WHERE usm.user_id = public.profiles.id
              AND public.is_manager_of_store(usm.store_id)
        )
        OR created_by = auth.uid()
    );

-- 4. Ensure stores are viewable correctly
DROP POLICY IF EXISTS "Users can view assigned stores" ON public.stores;
CREATE POLICY "Users can view assigned stores" ON public.stores
FOR SELECT TO authenticated
USING (public.has_store_access(id));

-- 5. Data Migration: Populate user_store_memberships from profiles if missing
-- This fixes the issue where users had a store assigned the old way but no membership record
INSERT INTO public.user_store_memberships (user_id, store_id, role)
SELECT id, store_id, role
FROM public.profiles
WHERE store_id IS NOT NULL
ON CONFLICT (user_id, store_id) DO NOTHING;

-- Also populate from active_store_id if store_id was null
INSERT INTO public.user_store_memberships (user_id, store_id, role)
SELECT id, active_store_id, role
FROM public.profiles
WHERE active_store_id IS NOT NULL
ON CONFLICT (user_id, store_id) DO NOTHING;

COMMIT;
