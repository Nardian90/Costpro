-- Enterprise Multi-Store Model Migration

-- 1. Create membership status enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
        CREATE TYPE membership_status AS ENUM ('active', 'revoked');
    END IF;
END $$;

-- 2. Create the Enterprise User-Store Membership table
CREATE TABLE IF NOT EXISTS public.user_store_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'clerk',
    status membership_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, store_id)
);

-- 3. Migration: Populate from old user_store_access if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_store_access') THEN
        INSERT INTO public.user_store_memberships (user_id, store_id, role, created_at)
        SELECT
            user_id,
            store_id,
            COALESCE(roles[1], 'clerk'),
            created_at
        FROM public.user_store_access
        ON CONFLICT (user_id, store_id) DO NOTHING;
    END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE public.user_store_memberships ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.user_store_memberships;
CREATE POLICY "Users can view their own memberships"
    ON public.user_store_memberships FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.user_store_memberships;
CREATE POLICY "Admins can manage all memberships"
    ON public.user_store_memberships FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 6. RPC for managing memberships (Enterprise ready with Security)
CREATE OR REPLACE FUNCTION public.manage_user_memberships(
    p_user_id UUID,
    p_memberships JSONB -- Array of {store_id: string, role: string}
)
RETURNS VOID AS $$
DECLARE
    m JSONB;
    v_creator_role user_role;
BEGIN
    -- SECURITY CHECK: Only admin or authorized encargado can manage memberships
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();
    IF v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can manage user memberships.';
    END IF;

    -- Delete existing memberships for this user to replace with new state
    DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;

    FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
    LOOP
        INSERT INTO public.user_store_memberships (user_id, store_id, role)
        VALUES (
            p_user_id,
            (m->>'store_id')::UUID,
            (m->>'role')::user_role
        );
    END LOOP;

    -- Ensure active_store_id is still valid for the user
    UPDATE public.profiles
    SET active_store_id = (
        SELECT store_id FROM public.user_store_memberships
        WHERE user_id = p_user_id LIMIT 1
    )
    WHERE id = p_user_id
    AND (
        active_store_id NOT IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = p_user_id)
        OR active_store_id IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Update managed_create_user to support memberships and handle active_store_id
CREATE OR REPLACE FUNCTION public.managed_create_user(
    p_email text,
    p_full_name text,
    p_role user_role, -- Initial role (legacy)
    p_store_id uuid, -- Initial store assignment (legacy)
    p_memberships JSONB DEFAULT NULL, -- NEW: Array of {store_id: string, role: string}
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
    v_active_store_id uuid;
    m JSONB;
BEGIN
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();

    IF v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    -- Determine initial active_store_id
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
    ELSE
        v_active_store_id := p_store_id;
    END IF;

    INSERT INTO public.profiles (
        id, email, full_name, role, active_store_id, is_active,
        created_by, max_stores_limit, max_users_limit, created_at, updated_at
    )
    VALUES (
        gen_random_uuid(), p_email, p_full_name, p_role, v_active_store_id, true,
        auth.uid(), p_max_stores, p_max_users, now(), now()
    )
    RETURNING id INTO v_user_id;

    -- Handle memberships
    IF p_memberships IS NOT NULL THEN
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        -- Fallback to legacy single store assignment
        INSERT INTO public.user_store_memberships (user_id, store_id, role)
        VALUES (v_user_id, p_store_id, p_role);
    END IF;

    INSERT INTO public.business_events (event_type, entity_id, payload, created_at)
    VALUES ('user_account_created', v_user_id, jsonb_build_object('email', p_email, 'created_by', auth.uid()::text), now());

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', p_email, 'message', 'User created');
END;
$$;

-- 8. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_store_memberships_updated_at ON public.user_store_memberships;
CREATE TRIGGER update_user_store_memberships_updated_at
    BEFORE UPDATE ON public.user_store_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
