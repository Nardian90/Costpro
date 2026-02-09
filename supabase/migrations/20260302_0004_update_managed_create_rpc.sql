-- Migration: Update managed_create_user for Admin Auth integration
-- This version supports passing a pre-created auth user ID

BEGIN;

CREATE OR REPLACE FUNCTION public.managed_create_user(
    p_email text,
    p_full_name text,
    p_role user_role,
    p_store_id uuid,
    p_memberships JSONB DEFAULT NULL,
    p_max_stores integer DEFAULT 0,
    p_max_users integer DEFAULT 0,
    p_target_user_id uuid DEFAULT NULL -- NEW: Optional target user ID from auth.users
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_role_id uuid;
    v_active_store_id uuid;
    m JSONB;
BEGIN
    -- Hierarchy check (only if not called by service role)
    -- Note: In a real environment, we'd check if the caller is an admin or service role
    IF NOT public.can_create_user_with_role(p_role::text) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: You do not have permission to create a user with role %', p_role;
    END IF;

    -- Determine initial active_store_id
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
    ELSE
        v_active_store_id := p_store_id;
    END IF;

    -- Get the matching role_id from roles table
    SELECT id INTO v_role_id FROM public.roles
    WHERE lower(name) = lower(p_role::text)
       OR (name = 'Cajero' AND p_role = 'clerk')
       OR (name = 'Almacenero' AND p_role = 'warehouse')
    LIMIT 1;

    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    INSERT INTO public.profiles (
        id, email, full_name, role, role_id, active_store_id, is_active,
        created_by, max_stores_limit, max_users_limit, created_at, updated_at
    )
    VALUES (
        v_user_id, p_email, p_full_name, p_role, v_role_id, v_active_store_id, true,
        auth.uid(), p_max_stores, p_max_users, now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        role_id = EXCLUDED.role_id,
        active_store_id = EXCLUDED.active_store_id,
        max_stores_limit = EXCLUDED.max_stores_limit,
        max_users_limit = EXCLUDED.max_users_limit,
        updated_at = now()
    RETURNING id INTO v_user_id;

    -- Handle memberships
    IF p_memberships IS NOT NULL THEN
        -- Delete existing if we are updating (conflict case)
        DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;

        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        INSERT INTO public.user_store_memberships (user_id, store_id, role)
        VALUES (v_user_id, p_store_id, p_role)
        ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;

    INSERT INTO public.business_events (event_type, entity_id, payload, created_at)
    VALUES ('user_account_managed_created', v_user_id, jsonb_build_object('email', p_email, 'created_by', auth.uid()::text), now());

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', p_email, 'message', 'User profile created/synced');
END;
$$;

COMMIT;
