-- ==========================================
-- CostPro Professional Demo Reset Script (v5.7.13)
-- Targets: Supabase SQL Editor
-- Features: Dynamic Cleanup, Schema Enforcement, Trigger Safety, Ultra-Resilience
-- Includes: 4 Demo Users (Password: demo123), Enriched Catalog, Sales, Transfers & Adjustments
-- ==========================================

-- 0. INITIAL SETUP & SECURITY
SET session_replication_role = 'replica';

DO $$
BEGIN
    -- 1. DYNAMIC CLEANUP
    DECLARE
        tab_name text;
        tables_to_truncate text[] := ARRAY[
            'audit_logs', 'business_events', 'cash_closures', 'cash_movements',
            'cash_register_sessions', 'idempotency_keys', 'inventory',
            'inventory_adjustment_items', 'inventory_adjustments', 'inventory_batches',
            'inventory_movements', 'inventory_snapshots', 'product_variants',
            'products', 'purchase_items', 'purchase_orders', 'receipt_items',
            'receipts', 'sale_items', 'sales', 'stock_movements', 'sync_log',
            'transaction_items', 'transactions', 'transfer_items', 'transfers',
            'user_store_memberships', 'profiles', 'stores', 'suppliers',
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

    DELETE FROM auth.users;

    -- 2. SCHEMA ALIGNMENT
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario');
    ELSE
        BEGIN ALTER TYPE user_role ADD VALUE 'encargado'; EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN ALTER TYPE user_role ADD VALUE 'usuario'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    CREATE TABLE IF NOT EXISTS public.categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        created_at timestamptz DEFAULT now()
    );

END $$;

-- 3. INITIALIZE CORE DATA
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
    p5 uuid := '55555555-5555-4555-a555-555555555555';
    p6 uuid := '66666666-6666-4666-a666-666666666666';
    p7 uuid := '77777777-7777-4777-a777-777777777777';
    p8 uuid := '88888888-8888-4888-a888-888888888888';

    pwd text;
    has_cat_id boolean;
BEGIN
    -- Create Stores
    INSERT INTO public.stores (id, name, address, is_active) VALUES
        (s1, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true),
        (s2, 'SUCURSAL BELGRANO', 'Av. Cabildo 2500, CABA', true);

    -- Create Categories
    INSERT INTO public.categories (id, name, description) VALUES
        (c_aba, 'ABARROTES', 'Consumo básico'), (c_lac, 'LÁCTEOS', 'Derivados de leche'),
        (c_lim, 'LIMPIEZA', 'Hogar'), (c_beb, 'BEBIDAS', 'Líquidos');

    -- 4. USERS (demo123)
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    pwd := crypt('demo123', gen_salt('bf'));

    -- ADMIN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_adm, 'authenticated', 'authenticated', 'admin@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_adm, 'admin@demo.com', 'Admin Global', 'admin'::user_role, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_adm, s1, 'admin'::user_role, 'active'::membership_status), (u_adm, s2, 'admin'::user_role, 'active'::membership_status);

    -- ENCARGADO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_enc, 'authenticated', 'authenticated', 'encargado@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente Sucursal"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_enc, 'encargado@demo.com', 'Gerente Sucursal', 'encargado'::user_role, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_enc, s1, 'encargado'::user_role, 'active'::membership_status);

    -- CAJERO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_caj, 'authenticated', 'authenticated', 'cajero@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Cajero Central"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_caj, 'cajero@demo.com', 'Cajero Central', 'clerk'::user_role, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_caj, s1, 'clerk'::user_role, 'active'::membership_status);

    -- ALMACENERO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (u_alm, 'authenticated', 'authenticated', 'almacen@demo.com', pwd, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Jefe Almacén"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (u_alm, 'almacen@demo.com', 'Jefe Almacén', 'warehouse'::user_role, s1, s1, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (u_alm, s1, 'warehouse'::user_role, 'active'::membership_status);

    -- 5. CATALOG
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') INTO has_cat_id;
    IF has_cat_id THEN
        INSERT INTO public.products (id, store_id, sku, name, category_id, price, cost_price, stock_current, is_active) VALUES
            (p1, s1, 'PROD-001', 'ARROZ EXTRA 1KG', c_aba, 1200, 800, 150, true),
            (p2, s1, 'PROD-002', 'ACEITE VEGETAL 1L', c_aba, 2500, 1850, 85, true),
            (p3, s1, 'PROD-003', 'LECHE ENTERA 1L', c_lac, 1500, 1100, 240, true),
            (p4, s1, 'PROD-004', 'DETERGENTE LÍQUIDO', c_lim, 3200, 2400, 60, true),
            (p5, s1, 'PROD-005', 'CAFÉ MOLIDO 250G', c_beb, 900, 600, 120, true),
            (p6, s1, 'PROD-006', 'AGUA MINERAL 2L', c_beb, 1800, 1200, 45, true),
            (p7, s1, 'PROD-007', 'GALLETAS DULCES', c_aba, 3500, 2100, 30, true),
            (p8, s1, 'PROD-008', 'QUESO CREMA', c_lac, 2200, 1400, 55, true);
        INSERT INTO public.products (store_id, sku, name, category_id, price, cost_price, stock_current, is_active) VALUES
            (s2, 'PROD-001', 'ARROZ EXTRA 1KG', c_aba, 1200, 800, 20, true),
            (s2, 'PROD-003', 'LECHE ENTERA 1L', c_lac, 1500, 1100, 15, true);
    ELSE
        INSERT INTO public.products (id, store_id, sku, name, category, price, cost_price, stock_current, is_active) VALUES
            (p1, s1, 'PROD-001', 'ARROZ EXTRA 1KG', 'ABARROTES', 1200, 800, 150, true),
            (p2, s1, 'PROD-002', 'ACEITE VEGETAL 1L', 'ABARROTES', 2500, 1850, 85, true),
            (p3, s1, 'PROD-003', 'LECHE ENTERA 1L', 'LÁCTEOS', 1500, 1100, 240, true),
            (p4, s1, 'PROD-004', 'DETERGENTE LÍQUIDO', 'LIMPIEZA', 3200, 2400, 60, true),
            (p5, s1, 'PROD-005', 'CAFÉ MOLIDO 250G', 'BEBIDAS', 900, 600, 120, true),
            (p6, s1, 'PROD-006', 'AGUA MINERAL 2L', 'BEBIDAS', 1800, 1200, 45, true);
    END IF;

    -- 6. SALES
    DECLARE
        t1 uuid := gen_random_uuid();
        t2 uuid := gen_random_uuid();
    BEGIN
        INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, created_at)
        VALUES (t1, s1, u_caj, 4900, 'completed'::text::transaction_status, 'cash'::text::payment_method_enum, now() - interval '2 hours');
        INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale) VALUES
            (t1, p1, 2, 1200, 800), (t1, p2, 1, 2500, 1850);

        INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, created_at)
        VALUES (t2, s1, u_caj, 3200, 'completed'::text::transaction_status, 'transfer'::text::payment_method_enum, now() - interval '1 hour');
        INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale) VALUES
            (t2, p4, 1, 3200, 2400);
    EXCEPTION WHEN others THEN NULL; END;

    -- 7. ADJUSTMENTS
    DECLARE
        a1 uuid := gen_random_uuid();
    BEGIN
        INSERT INTO public.inventory_adjustments (id, store_id, created_by, status, notes, reason)
        VALUES (a1, s1, u_enc, 'COMPLETED', 'Demo adjustment', 'DAMAGED'::text::inventory_adjustment_reason);
        INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity, difference)
        VALUES (a1, p3, 241, 240, -1);
    EXCEPTION WHEN others THEN NULL; END;

    -- 8. TRANSFERS
    DECLARE
        tr1 uuid := gen_random_uuid();
    BEGIN
        INSERT INTO public.transfers (id, origin_store_id, destination_store_id, created_by, status, notes)
        VALUES (tr1, s1, s2, u_enc, 'PENDIENTE'::text::transfer_status, 'Refuerzo stock Belgrano');
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost) VALUES
            (tr1, p1, 10, 800), (tr1, p3, 5, 1100);
    EXCEPTION WHEN others THEN NULL; END;

END $$;

SET session_replication_role = 'origin';
-- End of indestructible enriched reset script
