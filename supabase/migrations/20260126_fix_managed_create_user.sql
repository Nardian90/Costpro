-- Migration: Correct managed_create_user to support auth.users
-- This migration updates the RPC to ensure that an entry in auth.users is created
-- before the profile, maintaining the profiles_id_fkey integrity.

BEGIN;

CREATE OR REPLACE FUNCTION public.managed_create_user(
    p_email text,
    p_full_name text,
    p_role user_role,
    p_store_id uuid,
    p_memberships JSONB DEFAULT NULL,
    p_max_stores integer DEFAULT 0,
    p_max_users integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := gen_random_uuid();
    v_creator_role user_role;
    v_active_store_id uuid;
    m JSONB;
BEGIN
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();

    IF v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    -- 1. Create entry in auth.users
    -- We use a default password 'demo123' hashed with blowfish (standard for this project)
    INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, email_change,
        email_change_token_new, recovery_token
    )
    VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        p_email,
        extensions.crypt('demo123', extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', p_full_name),
        now(),
        now(),
        '', '', '', ''
    );

    -- 2. Determine initial active_store_id
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
    ELSE
        v_active_store_id := p_store_id;
    END IF;

    -- 3. Create entry in public.profiles
    INSERT INTO public.profiles (
        id, email, full_name, role, active_store_id, is_active,
        created_by, max_stores_limit, max_users_limit, created_at, updated_at
    )
    VALUES (
        v_user_id, p_email, p_full_name, p_role, v_active_store_id, true,
        auth.uid(), p_max_stores, p_max_users, now(), now()
    );

    -- 4. Handle memberships
    IF p_memberships IS NOT NULL THEN
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        INSERT INTO public.user_store_memberships (user_id, store_id, role)
        VALUES (v_user_id, p_store_id, p_role);
    END IF;

    INSERT INTO public.business_events (event_type, entity_id, payload, created_at)
    VALUES ('user_account_created', v_user_id, jsonb_build_object('email', p_email, 'created_by', auth.uid()::text), now());

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', p_email, 'message', 'User created with auth account');
END;
$$;

COMMIT;
