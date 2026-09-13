-- DECLARED FINAL STATE (Git) de managed_create_user
-- fuente: 20260326_multi_tenant_hardening.sql stmt#14

CREATE OR REPLACE FUNCTION public.managed_create_user(p_email text, p_full_name text, p_role user_role, p_store_id uuid DEFAULT NULL::uuid, p_memberships jsonb DEFAULT NULL::jsonb, p_max_stores integer DEFAULT 0, p_max_users integer DEFAULT 0, p_target_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
    v_role_id uuid;
    v_active_store_id uuid;
    m JSONB;
    v_creator_role user_role;
BEGIN
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();
    IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    v_active_store_id := COALESCE((p_memberships->0->>'store_id')::UUID, p_store_id);

    IF v_creator_role = 'encargado' AND v_active_store_id IS NOT NULL THEN
        IF NOT public.has_store_access(v_active_store_id) THEN
            RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', v_active_store_id;
        END IF;
    END IF;

    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = lower(p_role::text) OR (name = 'Cajero' AND p_role = 'clerk') OR (name = 'Almacenero' AND p_role = 'warehouse') LIMIT 1;
    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    INSERT INTO public.profiles (id, email, full_name, role, role_id, active_store_id, is_active, created_by, max_stores_limit, max_users_limit, created_at, updated_at)
    VALUES (v_user_id, p_email, p_full_name, p_role, v_role_id, v_active_store_id, true, auth.uid(), p_max_stores, p_max_users, now(), now())
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, role_id = EXCLUDED.role_id, active_store_id = EXCLUDED.active_store_id, updated_at = now()
    RETURNING id INTO v_user_id;

    IF p_memberships IS NOT NULL THEN
        IF v_creator_role != 'admin' THEN
            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id AND store_id IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = auth.uid() AND role IN ('encargado', 'manager'));
        ELSE
            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
        END IF;
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships) LOOP
            IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
                IF v_creator_role = 'admin' OR public.has_store_access((m->>'store_id')::UUID) THEN
                    INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
                END IF;
            END IF;
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES (v_user_id, p_store_id, p_role) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$
