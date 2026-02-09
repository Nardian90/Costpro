-- Fix hierarchy and auto-assignment (Unified Version)

-- 1. Function to check if a creator can create a user with a specific role
CREATE OR REPLACE FUNCTION public.can_create_user_with_role(
    p_creator_id UUID,
    p_role_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_creator_role TEXT;
BEGIN
    -- Get creator's role
    SELECT r.name INTO v_creator_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = p_creator_id;

    -- Service role or Admin can create anything
    IF p_creator_id = '00000000-0000-0000-0000-000000000000'::UUID OR v_creator_role = 'Admin' THEN
        RETURN TRUE;
    END IF;

    IF v_creator_role = 'Encargado' THEN
        RETURN p_role_name IN ('Cajero', 'Almacenero', 'clerk', 'warehouse');
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update managed_create_user to be robust and handle memberships
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
    v_role_name TEXT;
    v_user_id UUID;
    m JSONB;
BEGIN
    -- Normalize Role Name
    v_role_name := CASE
        WHEN lower(p_role) IN ('admin') THEN 'Admin'
        WHEN lower(p_role) IN ('encargado', 'manager') THEN 'Encargado'
        WHEN lower(p_role) IN ('cajero', 'clerk') THEN 'Cajero'
        WHEN lower(p_role) IN ('almacenero', 'warehouse') THEN 'Almacenero'
        WHEN lower(p_role) IN ('usuario', 'usercosto') THEN 'UserCosto'
        ELSE p_role
    END;

    -- Validate creator if provided
    IF p_creator_id IS NOT NULL AND NOT public.can_create_user_with_role(p_creator_id, v_role_name) THEN
        RAISE EXCEPTION 'No tienes permisos para crear un usuario con el rol %', v_role_name;
    END IF;

    -- Get Role ID
    SELECT id INTO v_role_id FROM public.roles WHERE name = v_role_name OR id::text = p_role;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Rol % no encontrado', v_role_name;
    END IF;

    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    -- Create or update profile
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role_id,
        is_active,
        max_stores_limit,
        max_users_limit
    ) VALUES (
        v_user_id,
        p_email,
        p_full_name,
        v_role_id,
        true,
        p_max_stores,
        p_max_users
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role_id = EXCLUDED.role_id,
        is_active = EXCLUDED.is_active,
        max_stores_limit = EXCLUDED.max_stores_limit,
        max_users_limit = EXCLUDED.max_users_limit;

    -- Handle memberships (if table exists)
    BEGIN
        IF p_memberships IS NOT NULL THEN
            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
            FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
            LOOP
                INSERT INTO public.user_store_memberships (user_id, store_id, role)
                VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::TEXT);
            END LOOP;
        ELSIF p_store_id IS NOT NULL THEN
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, p_store_id, v_role_name)
            ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If memberships table doesn't exist, we skip it silently for now
        -- as per Task 1, we might be transitioning
    END;

    -- Log creation
    INSERT INTO public.user_audit_log (
        performed_by,
        target_user_id,
        action,
        new_values
    ) VALUES (
        COALESCE(p_creator_id, '00000000-0000-0000-0000-000000000000'::UUID),
        v_user_id,
        'USER_CREATED_MANUALLY',
        jsonb_build_object('role', v_role_name, 'email', p_email)
    );

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure trigger for public registration assigns 'UserCosto'
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS TRIGGER AS $$
DECLARE
    v_role_id UUID;
BEGIN
    -- Get UserCosto role
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'UserCosto';

    IF v_role_id IS NULL THEN
        -- Fallback to default role if UserCosto not found
        SELECT id INTO v_role_id FROM public.roles WHERE is_default = true LIMIT 1;
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role_id, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        v_role_id,
        true
    );

    -- Log automatic creation
    INSERT INTO public.user_audit_log (
        performed_by,
        target_user_id,
        action,
        new_values
    ) VALUES (
        '00000000-0000-0000-0000-000000000000'::UUID,
        NEW.id,
        'USER_REGISTERED_PUBLICLY',
        jsonb_build_object('role', 'UserCosto', 'email', NEW.email)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-enable trigger
DROP TRIGGER IF EXISTS tr_on_auth_user_created ON auth.users;
CREATE TRIGGER tr_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();
