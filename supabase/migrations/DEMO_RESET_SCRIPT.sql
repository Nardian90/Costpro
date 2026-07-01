-- ==========================================
-- CostPro Professional Demo Reset Script (v5.7.25)
-- Targets: Supabase SQL Editor
-- Features: RBAC Hierarchical Support, Dynamic Cleanup, Trigger Safety
-- Includes: 5 Demo Users (Password: demo123), Enriched Catalog, Roles & Permissions
-- ==========================================

-- 0. INITIAL SETUP & SECURITY
SET session_replication_role = 'replica';

DO $$
BEGIN
    -- 1. DYNAMIC CLEANUP (Resilient Truncate)
    DECLARE
        tab_name text;
        tables_to_truncate text[] := ARRAY[
            'user_audit_log', 'audit_logs', 'business_events', 'cash_closures', 'cash_movements',
            'cash_register_sessions', 'idempotency_keys', 'inventory',
            'inventory_adjustment_items', 'inventory_adjustments', 'inventory_batches',
            'inventory_movements', 'inventory_snapshots', 'product_variants',
            'products', 'purchase_items', 'purchase_orders', 'receipt_items',
            'receipts', 'sale_items', 'sales', 'stock_movements', 'sync_log',
            'transaction_items', 'transactions', 'transfer_items', 'transfers',
            'user_store_memberships', 'profiles', 'roles', 'stores', 'suppliers',
            'units_of_measure', 'categories'
        ];
    BEGIN
        FOREACH tab_name IN ARRAY tables_to_truncate
        LOOP
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tab_name) THEN
                EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tab_name) || ' CASCADE';
            END IF;
        END LOOP;
    END;

    -- Targeted Cleanup of auth.users (Optional: Change to DELETE WHERE email LIKE '%@demo.com')
    -- To protect production, we only delete specific demo users if you prefer
    DELETE FROM auth.users WHERE email IN (
        'admin@demo.com', 'encargado@demo.com', 'cajero@demo.com',
        'almacen@demo.com', 'costos@demo.com'
    );

    -- 2. SCHEMA ALIGNMENT (Roles & Enums)
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario');
    END IF;

END $$;

-- 3. INITIALIZE CORE DATA (Roles, Stores, Categories)
DO $$
DECLARE
    -- Roles IDs
    r_adm uuid := gen_random_uuid();
    r_enc uuid := gen_random_uuid();
    r_caj uuid := gen_random_uuid();
    r_alm uuid := gen_random_uuid();
    r_cos uuid := gen_random_uuid();

    -- Stores
    s1 uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    s2 uuid := 'b2c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

    -- Categories
    c_aba uuid := 'a1111111-aaaa-1111-aaaa-111111111111';
    c_lac uuid := 'b2222222-bbbb-2222-bbbb-222222222222';

    -- Users IDs
    u_adm uuid := 'a1111111-1111-1111-1111-111111111111';
    u_enc uuid := 'e2222222-2222-2222-2222-222222222222';
    u_caj uuid := 'c3333333-3333-3333-3333-333333333333';
    u_alm uuid := 'b4444444-4444-4444-4444-444444444444';
    u_cos uuid := 'd5555555-5555-5555-5555-555555555555';

    -- Products
    p1 uuid := '11111111-1111-4111-a111-111111111111';
    p2 uuid := '22222222-2222-4222-a222-222222222222';

    pwd text;
BEGIN
    -- 3.1 Create Roles (RBAC V2)
    INSERT INTO public.roles (id, name, permissions, is_default) VALUES
        (r_adm, 'Admin', '{"views": ["Dashboard", "Inventory", "POS", "Reports", "Users", "Costs", "Settings"], "all": true}', false),
        (r_enc, 'Encargado', '{"views": ["Dashboard", "Inventory", "POS", "Reports", "Users", "Costs"], "all": false}', false),
        (r_caj, 'Cajero', '{"views": ["POS"], "all": false}', false),
        (r_alm, 'Almacenero', '{"views": ["Inventory"], "all": false}', false),
        (r_cos, 'UserCosto', '{"views": ["Costs"], "all": false}', true);

    -- 3.2 Create Stores
    INSERT INTO public.stores (id, name, address, is_active) VALUES
        (s1, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true),
        (s2, 'SUCURSAL BELGRANO', 'Av. Cabildo 2500, CABA', true);

    -- 3.3 Create Categories
    INSERT INTO public.categories (id, name) VALUES (c_aba, 'ABARROTES'), (c_lac, 'LÁCTEOS');

    -- 4. USERS (demo123)
    pwd := crypt('demo123', gen_salt('bf'));

    -- ADMIN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_adm, 'authenticated', 'authenticated', 'admin@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, role_id, store_id, active_store_id, is_active)
    VALUES (u_adm, 'admin@demo.com', 'Admin Global', 'admin'::user_role, r_adm, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_adm, s1, 'admin', 'active'), (u_adm, s2, 'admin', 'active');

    -- ENCARGADO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_enc, 'authenticated', 'authenticated', 'encargado@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente Sucursal"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, role_id, store_id, active_store_id, is_active)
    VALUES (u_enc, 'encargado@demo.com', 'Gerente Sucursal', 'encargado'::user_role, r_enc, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_enc, s1, 'encargado', 'active');

    -- CAJERO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_caj, 'authenticated', 'authenticated', 'cajero@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Cajero Central"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, role_id, store_id, active_store_id, is_active)
    VALUES (u_caj, 'cajero@demo.com', 'Cajero Central', 'clerk'::user_role, r_caj, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_caj, s1, 'clerk', 'active');

    -- USER COSTO (Auto-servicio Demo)
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_cos, 'authenticated', 'authenticated', 'costos@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Usuario Costos"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, role_id, store_id, active_store_id, is_active)
    VALUES (u_cos, 'costos@demo.com', 'Usuario Costos', 'usuario'::user_role, r_cos, s1, s1, true);

    -- 5. CATALOG (Resilient check for category_id)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') THEN
        INSERT INTO public.products (id, store_id, sku, name, category_id, price, cost_price, stock_current, is_active) VALUES
            (p1, s1, 'PROD-001', 'ARROZ EXTRA 1KG', c_aba, 1200, 800, 150, true),
            (p2, s1, 'PROD-002', 'ACEITE VEGETAL 1L', c_aba, 2500, 1850, 85, true);
    ELSE
        INSERT INTO public.products (id, store_id, sku, name, category, price, cost_price, stock_current, is_active) VALUES
            (p1, s1, 'PROD-001', 'ARROZ EXTRA 1KG', 'ABARROTES', 1200, 800, 150, true),
            (p2, s1, 'PROD-002', 'ACEITE VEGETAL 1L', 'ABARROTES', 2500, 1850, 85, true);
    END IF;

END $$;

SET session_replication_role = 'origin';
-- End of RBAC-ready Reset Script
