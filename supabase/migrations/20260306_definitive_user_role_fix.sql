-- Migration: Definitive User Role and Store Membership Logic Fix
-- Ensures SECURITY DEFINER for triggers, proper RLS for Admins, and role consistency.

BEGIN;

-- 1. Ensure 'costo' is in the enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'user_role' AND enumlabel = 'costo') THEN
        ALTER TYPE user_role ADD VALUE 'costo';
    END IF;
END $$;

-- 2. Ensure 'costo' role exists in the roles table
INSERT INTO public.roles (id, name, permissions, is_default)
VALUES ('684d0cfd-1d3f-4d21-a065-9104355fbeaa', 'costo', '{"all": false, "views": ["Costs"]}', true)
ON CONFLICT (id) DO UPDATE SET name = 'costo', permissions = '{"all": false, "views": ["Costs"]}', is_default = true;

-- 3. Update validate_active_store to be SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.validate_active_store()
RETURNS TRIGGER AS $$
DECLARE
    v_role user_role;
BEGIN
    -- Get user role
    v_role := NEW.role;

    -- If role is 'costo', active_store_id is optional
    IF v_role = 'costo'::user_role THEN
        IF NEW.active_store_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: The user does not have active membership in the selected store.';
            END IF;
        END IF;
    ELSE
        -- For operational roles, ensure active_store_id is NOT NULL and valid
        IF NEW.active_store_id IS NULL THEN
             IF v_role IN ('encargado'::user_role, 'clerk'::user_role, 'warehouse'::user_role) THEN
                RAISE EXCEPTION 'ERR_STORE_REQUIRED: El rol % requiere una tienda activa asignada.', v_role;
             END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: The user does not have active membership in the selected store.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Add Admin Policy to user_store_memberships
DROP POLICY IF EXISTS user_memberships_admin_all ON public.user_store_memberships;
CREATE POLICY user_memberships_admin_all ON public.user_store_memberships
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 5. Fix managed_create_user to handle the names consistently
CREATE OR REPLACE FUNCTION public.managed_create_user(
    p_email TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_store_id UUID DEFAULT NULL,
    p_memberships JSONB DEFAULT NULL,
    p_max_stores INTEGER DEFAULT 1,
    p_max_users INTEGER DEFAULT 1,
    p_target_user_id UUID DEFAULT NULL,
    p_creator_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_role_id UUID;
    v_role_enum user_role;
    v_role_name TEXT;
    v_user_id UUID;
    v_active_store_id UUID;
    m JSONB;
BEGIN
    -- Normalize Role Name for Table and Enum
    v_role_name := lower(p_role);
    IF v_role_name IN ('cajero', 'clerk') THEN v_role_name := 'Cajero'; v_role_enum := 'clerk'::user_role;
    ELSIF v_role_name IN ('almacenero', 'warehouse') THEN v_role_name := 'Almacenero'; v_role_enum := 'warehouse'::user_role;
    ELSIF v_role_name IN ('encargado', 'manager') THEN v_role_name := 'Encargado'; v_role_enum := 'encargado'::user_role;
    ELSIF v_role_name IN ('admin') THEN v_role_name := 'Admin'; v_role_enum := 'admin'::user_role;
    ELSE v_role_name := 'costo'; v_role_enum := 'costo'::user_role;
    END IF;

    -- Get Role ID from table
    SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name OR lower(name) = lower(v_role_name);

    IF v_role_id IS NULL THEN
        -- Fallback to costo
        SELECT id INTO v_role_id FROM public.roles WHERE name = 'costo' LIMIT 1;
        v_role_enum := 'costo'::user_role;
    END IF;

    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    -- Determine initial active_store_id
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
    ELSE
        v_active_store_id := p_store_id;
    END IF;

    -- Create or update profile
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        role_id,
        active_store_id,
        is_active,
        max_stores_limit,
        max_users_limit,
        created_by
    ) VALUES (
        v_user_id,
        p_email,
        p_full_name,
        v_role_enum,
        v_role_id,
        v_active_store_id,
        true,
        p_max_stores,
        p_max_users,
        COALESCE(p_creator_id, auth.uid())
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        role_id = EXCLUDED.role_id,
        active_store_id = EXCLUDED.active_store_id,
        is_active = EXCLUDED.is_active,
        max_stores_limit = EXCLUDED.max_stores_limit,
        max_users_limit = EXCLUDED.max_users_limit;

    -- Handle memberships
    IF p_memberships IS NOT NULL THEN
        DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        INSERT INTO public.user_store_memberships (user_id, store_id, role)
        VALUES (v_user_id, p_store_id, v_role_enum)
        ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
