-- ==========================================
-- CostPro Professional Demo Reset Script (v5.8.0)
-- Features: Selective Cleanup (Protects Real Data), Schema Cache Fix, RBAC Enforcement
-- Targets: ONLY Demo Users and Demo Stores
-- ==========================================

-- 0. INITIAL SETUP & SECURITY
SET session_replication_role = 'replica';

DO $$
DECLARE
    -- Demo Store IDs
    s1 uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    s2 uuid := 'b2c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

    -- Demo User IDs
    u_adm uuid := 'a1111111-1111-1111-1111-111111111111';
    u_enc uuid := 'e2222222-2222-2222-2222-222222222222';
    u_caj uuid := 'c3333333-3333-3333-3333-333333333333';
    u_alm uuid := 'b4444444-4444-4444-4444-444444444444';

    demo_users uuid[] := ARRAY[u_adm, u_enc, u_caj, u_alm];
    demo_stores uuid[] := ARRAY[s1, s2];

    tab_name text;
BEGIN
    -- 1. SELECTIVE CLEANUP (Protects non-demo data)
    -- Instead of TRUNCATE, we delete only demo-related records

    DELETE FROM public.inventory WHERE store_id = ANY(demo_stores);
    DELETE FROM public.products WHERE store_id = ANY(demo_stores);
    DELETE FROM public.sales WHERE store_id = ANY(demo_stores);
    DELETE FROM public.transactions WHERE store_id = ANY(demo_stores);
    DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE store_id = ANY(demo_stores));
    DELETE FROM public.receipts WHERE store_id = ANY(demo_stores);
    DELETE FROM public.stock_movements WHERE store_id = ANY(demo_stores);
    DELETE FROM public.inventory_adjustments WHERE store_id = ANY(demo_stores);
    DELETE FROM public.cash_closures WHERE store_id = ANY(demo_stores);
    DELETE FROM public.transfers WHERE origin_store_id = ANY(demo_stores) OR destination_store_id = ANY(demo_stores);
    DELETE FROM public.user_store_memberships WHERE user_id = ANY(demo_users) OR store_id = ANY(demo_stores);
    DELETE FROM public.profiles WHERE id = ANY(demo_users);
    DELETE FROM public.stores WHERE id = ANY(demo_stores);

    -- Delete from auth.users (Selective)
    DELETE FROM auth.users WHERE id = ANY(demo_users) OR email IN ('admin@demo.com', 'encargado@demo.com', 'cajero@demo.com', 'almacen@demo.com');

    -- 2. SCHEMA ALIGNMENT
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario');
    ELSE
        BEGIN ALTER TYPE user_role ADD VALUE 'encargado'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE user_role ADD VALUE 'usuario'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
        CREATE TYPE membership_status AS ENUM ('active', 'revoked');
    END IF;

    CREATE TABLE IF NOT EXISTS public.categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        created_at timestamptz DEFAULT now()
    );

    -- 3. SCHEMA CACHE FIX (GRANT PERMISSIONS)
    GRANT ALL ON public.user_store_memberships TO authenticated, service_role;
    GRANT ALL ON public.profiles TO authenticated, service_role;
    GRANT ALL ON public.stores TO authenticated, service_role;
    GRANT ALL ON public.products TO authenticated, service_role;
    GRANT ALL ON public.categories TO authenticated, service_role;
END $$;

-- 4. INITIALIZE CORE DATA
DO $$
DECLARE
    -- Stores
    s1 uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    s2 uuid := 'b2c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

    -- Categories
    c_aba uuid := 'a1111111-aaaa-1111-aaaa-111111111111';
    c_lac uuid := 'b2222222-bbbb-2222-bbbb-222222222222';
    c_lim uuid := 'c3333333-cccc-3333-cccc-333333333333';
    c_beb uuid := 'd4444444-dddd-4444-dddd-444444444444';

    -- Users
    u_adm uuid := 'a1111111-1111-1111-1111-111111111111';
    u_enc uuid := 'e2222222-2222-2222-2222-222222222222';
    u_caj uuid := 'c3333333-3333-3333-3333-333333333333';
    u_alm uuid := 'b4444444-4444-4444-4444-444444444444';

    -- Products
    p1 uuid := '11111111-1111-4111-a111-111111111111';
    p2 uuid := '22222222-2222-4222-a222-222222222222';
    p3 uuid := '33333333-3333-4333-a333-333333333333';
    p4 uuid := '44444444-4444-4444-a444-444444444444';

    pwd text;
    has_cat_id boolean;
BEGIN
    -- Create Stores
    INSERT INTO public.stores (id, name, address, is_active) VALUES
        (s1, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true),
        (s2, 'SUCURSAL BELGRANO', 'Av. Cabildo 2500, CABA', true)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true;

    -- Create Categories
    INSERT INTO public.categories (id, name, description) VALUES
        (c_aba, 'ABARROTES', 'Consumo básico'), (c_lac, 'LÁCTEOS', 'Derivados de leche'),
        (c_lim, 'LIMPIEZA', 'Hogar'), (c_beb, 'BEBIDAS', 'Líquidos')
    ON CONFLICT (name) DO NOTHING;

    -- USERS (demo123)
    pwd := crypt('demo123', gen_salt('bf'));

    -- ADMIN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_adm, 'authenticated', 'authenticated', 'admin@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}', now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_adm, 'admin@demo.com', 'Admin Global', 'admin'::user_role, s1, s1, true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_adm, s1, 'admin'::user_role, 'active'::membership_status), (u_adm, s2, 'admin'::user_role, 'active'::membership_status)
    ON CONFLICT (user_id, store_id) DO UPDATE SET status = 'active';

    -- ENCARGADO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_enc, 'authenticated', 'authenticated', 'encargado@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente Sucursal"}', now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_enc, 'encargado@demo.com', 'Gerente Sucursal', 'encargado'::user_role, s1, s1, true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_enc, s1, 'encargado'::user_role, 'active'::membership_status)
    ON CONFLICT (user_id, store_id) DO UPDATE SET status = 'active';

    -- CAJERO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_caj, 'authenticated', 'authenticated', 'cajero@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Cajero Central"}', now(), now())
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_caj, 'cajero@demo.com', 'Cajero Central', 'clerk'::user_role, s1, s1, true)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true;
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_caj, s1, 'clerk'::user_role, 'active'::membership_status)
    ON CONFLICT (user_id, store_id) DO UPDATE SET status = 'active';

    -- CATALOG
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') INTO has_cat_id;
    IF has_cat_id THEN
        INSERT INTO public.products (id, store_id, sku, name, category_id, price, cost_price, stock_current, is_active) VALUES
            (p1, s1, 'PROD-001', 'ARROZ EXTRA 1KG', c_aba, 1200, 800, 150, true),
            (p2, s1, 'PROD-002', 'ACEITE VEGETAL 1L', c_aba, 2500, 1850, 85, true),
            (p3, s1, 'PROD-003', 'LECHE ENTERA 1L', c_lac, 1500, 1100, 240, true),
            (p4, s1, 'PROD-004', 'DETERGENTE LÍQUIDO', c_lim, 3200, 2400, 60, true)
        ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, cost_price = EXCLUDED.cost_price;
    END IF;

END $$;

-- FORCE RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

SET session_replication_role = 'origin';
-- End of indestructible professional reset script
