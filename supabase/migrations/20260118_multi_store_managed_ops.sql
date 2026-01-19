-- Phase 3.1: Managed user and store creation functions

-- Function to allow encargado (and admin) to create stores within limits
CREATE OR REPLACE FUNCTION public.managed_create_store(
    p_name text,
    p_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id uuid;
BEGIN
    INSERT INTO public.stores (name, address, created_by)
    VALUES (p_name, p_address, auth.uid())
    RETURNING id INTO v_store_id;

    -- Note: trigger_auto_assign_store_to_creator handles the access entry.

    RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'message', 'Store created');
END;
$$;

-- Function to allow encargado (and admin) to create users within limits
CREATE OR REPLACE FUNCTION public.managed_create_user(
    p_email text,
    p_full_name text,
    p_role user_role,
    p_store_id uuid, -- Initial store assignment
    p_max_stores integer DEFAULT 0,
    p_max_users integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_creator_role user_role;
BEGIN
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();

    IF v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    -- Note: trigger_enforce_encargado_user_limit handles the limit check on INSERT.

    -- We use a random UUID here as per the existing pattern,
    -- though in a real Supabase setup this would usually be linked to an auth.user.
    INSERT INTO public.profiles (
        id, email, full_name, role, active_store_id, is_active,
        created_by, max_stores_limit, max_users_limit, created_at, updated_at
    )
    VALUES (
        gen_random_uuid(), p_email, p_full_name, p_role, p_store_id, true,
        auth.uid(), p_max_stores, p_max_users, now(), now()
    )
    RETURNING id INTO v_user_id;

    -- Also assign the store access
    IF p_store_id IS NOT NULL THEN
        INSERT INTO public.user_store_access (user_id, store_id, assigned_by)
        VALUES (v_user_id, p_store_id, auth.uid());
    END IF;

    INSERT INTO public.business_events (event_type, entity_id, payload, created_at)
    VALUES ('user_account_created', v_user_id, jsonb_build_object('email', p_email, 'created_by', auth.uid()::text), now());

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', p_email, 'message', 'User created');
END;
$$;
