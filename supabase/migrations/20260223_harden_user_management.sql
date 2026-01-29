-- Migration: Harden User Management RLS and RPC
-- This migration updates manage_user_memberships to prevent data loss when edited by non-admins
-- and updates get_users_for_encargado to use the new memberships table.

BEGIN;

-- 1. Update get_users_for_encargado to use user_store_memberships
CREATE OR REPLACE FUNCTION public.get_users_for_encargado(p_user_id uuid)
RETURNS TABLE(user_id uuid) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT usm.user_id
    FROM public.user_store_memberships usm
    WHERE usm.store_id IN (
        SELECT store_id
        FROM public.user_store_memberships
        WHERE user_id = p_user_id
          AND role IN ('encargado', 'manager')
          AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update manage_user_memberships RPC for safe partial updates
CREATE OR REPLACE FUNCTION public.manage_user_memberships(
    p_user_id UUID,
    p_memberships JSONB -- Array of {store_id: string, role: string}
)
RETURNS VOID AS $$
DECLARE
    m JSONB;
    v_caller_role text;
BEGIN
    -- SECURITY CHECK: Use helper to get role safely
    v_caller_role := public.get_my_role();

    IF v_caller_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can manage user memberships.';
    END IF;

    -- Replacement logic
    IF v_caller_role = 'admin' THEN
        -- Admins can replace all memberships
        DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    ELSE
        -- Encargados can only replace memberships for stores they manage
        -- This prevents accidental deletion of memberships in stores they don't see
        DELETE FROM public.user_store_memberships
        WHERE user_id = p_user_id
        AND store_id IN (
            SELECT store_id FROM public.user_store_memberships
            WHERE user_id = auth.uid()
              AND role IN ('encargado', 'manager')
              AND status = 'active'
        );
    END IF;

    -- Insert new/updated memberships
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            -- Basic validation: Ensure store_id is not null/empty
            IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
                -- If not admin, check if they are manager of this store
                IF v_caller_role = 'admin' OR public.is_store_manager((m->>'store_id')::UUID) THEN
                    INSERT INTO public.user_store_memberships (user_id, store_id, role)
                    VALUES (
                        p_user_id,
                        (m->>'store_id')::UUID,
                        (m->>'role')::user_role
                    )
                    ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Ensure active_store_id is still valid for the user
    UPDATE public.profiles
    SET active_store_id = (
        SELECT store_id FROM public.user_store_memberships
        WHERE user_id = p_user_id AND status = 'active' LIMIT 1
    )
    WHERE id = p_user_id
    AND (
        active_store_id NOT IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = p_user_id AND status = 'active')
        OR active_store_id IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure Memberships Visibility allows Encargados to see their users
DROP POLICY IF EXISTS "Memberships visibility" ON public.user_store_memberships;
CREATE POLICY "Memberships visibility" ON public.user_store_memberships
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()                             -- Self
  OR public.get_my_role() = 'admin'                -- Admin
  OR public.is_store_manager(store_id)             -- Manager of the store
  OR EXISTS (                                      -- I created the user
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_store_memberships.user_id
      AND p.created_by = auth.uid()
  )
);

COMMIT;
