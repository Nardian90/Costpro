-- Professional Demo Reset Script v3.0
-- Optimized for User-Store Consistency and Role-based assignments.

SET session_replication_role = 'replica'; -- Disable triggers temporarily for bulk load

DO $$
DECLARE
    -- Stores
    s1 uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    s2 uuid := 'b2c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

    -- Users
    u_adm uuid := 'a1111111-1111-1111-1111-111111111111';
    u_enc uuid := 'e2222222-2222-2222-2222-222222222222';
    u_caj uuid := 'c3333333-3333-3333-3333-333333333333';
    u_alm uuid := 'b4444444-4444-4444-4444-444444444444';
    u_cos uuid := 'd5555555-5555-5555-5555-555555555555';

    pwd text;
BEGIN
    -- 1. STORES
    INSERT INTO public.stores (id, name, address, is_active) VALUES
        (s1, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true),
        (s2, 'SUCURSAL BELGRANO', 'Av. Cabildo 2500, CABA', true)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;

    pwd := extensions.crypt('demo123', extensions.gen_salt('bf'));

    -- 2. AUTH USERS
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES
        (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}', now(), now(), '', '', '', ''),
        (u_enc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'encargado@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente Sucursal"}', now(), now(), '', '', '', ''),
        (u_caj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cajero@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Cajero Central"}', now(), now(), '', '', '', ''),
        (u_alm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'almacen@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Almacenero Central"}', now(), now(), '', '', '', ''),
        (u_cos, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'costo@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Especialista de Costos"}', now(), now(), '', '', '', '')
    ON CONFLICT (id) DO NOTHING;

    -- 3. PROFILES (Initial)
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES
        (u_adm, 'admin@demo.com', 'Admin Global', 'admin'::user_role, s1, s1, true),
        (u_enc, 'encargado@demo.com', 'Gerente Sucursal', 'encargado'::user_role, s1, s1, true),
        (u_caj, 'cajero@demo.com', 'Cajero Central', 'clerk'::user_role, s1, s1, true),
        (u_alm, 'almacen@demo.com', 'Almacenero Central', 'warehouse'::user_role, s1, s1, true),
        (u_cos, 'costo@demo.com', 'Especialista de Costos', 'costo'::user_role, NULL, NULL, true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, active_store_id = EXCLUDED.active_store_id, is_active = true;

    -- 4. MEMBERSHIPS
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES
        (u_adm, s1, 'admin'::user_role, 'active'::membership_status),
        (u_adm, s2, 'admin'::user_role, 'active'::membership_status),
        (u_enc, s1, 'encargado'::user_role, 'active'::membership_status),
        (u_caj, s1, 'clerk'::user_role, 'active'::membership_status),
        (u_alm, s1, 'warehouse'::user_role, 'active'::membership_status)
    ON CONFLICT (user_id, store_id) DO UPDATE SET status = 'active';

END $$;

SET session_replication_role = 'origin';

NOTIFY pgrst, 'reload schema';
