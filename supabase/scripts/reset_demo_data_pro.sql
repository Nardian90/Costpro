-- ==========================================
-- CostPro Professional Demo Reset Script (v5.7.13)
-- Targets: Supabase SQL Editor
-- Features: Dynamic Cleanup, Schema Enforcement, Trigger Safety, Ultra-Resilience
-- Includes: 4 Demo Users, Enriched Catalog, Sample Transactions, Transfers & Adjustments
-- ==========================================

-- 0. INITIAL SETUP & SECURITY
-- Disable all triggers during the reset to prevent audit log noise and recursive calculations
SET session_replication_role = 'replica';

DO $$
BEGIN
    -- 1. DYNAMIC CLEANUP OF OPERATIONAL TABLES
    -- CASCADE ensures that all dependent records are removed in correct order
    -- RSS tables are EXCLUDED per user instruction
    DECLARE
        tab_name text;
        tables_to_truncate text[] := ARRAY[
            'audit_logs',
            'business_events',
            'cash_closures',
            'cash_movements',
            'cash_register_sessions',
            'idempotency_keys',
            'inventory',
            'inventory_adjustment_items',
            'inventory_adjustments',
            'inventory_batches',
            'inventory_movements',
            'inventory_snapshots',
            'product_variants',
            'products',
            'purchase_items',
            'purchase_orders',
            'receipt_items',
            'receipts',
            'sale_items',
            'sales',
            'stock_movements',
            'sync_log',
            'transaction_items',
            'transactions',
            'transfer_items',
            'transfers',
            'user_store_memberships',
            'profiles',
            'stores',
            'suppliers',
            'units_of_measure',
            'categories'
        ];
    BEGIN
        FOREACH tab_name IN ARRAY tables_to_truncate
        LOOP
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tab_name) THEN
                EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tab_name) || ' CASCADE';
            END IF;
        END LOOP;
    END;

    -- Clean Auth Users (Supabase standard)
    DELETE FROM auth.users;

    -- 2. SCHEMA ALIGNMENT (Pro Level)
    -- Ensure user_role type exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario');
    ELSE
        -- Ensure all roles are present (Safe addition)
        BEGIN
            ALTER TYPE user_role ADD VALUE 'encargado';
        EXCEPTION WHEN duplicate_object THEN NULL; END;
        BEGIN
            ALTER TYPE user_role ADD VALUE 'usuario';
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- Ensure categories table exists
    CREATE TABLE IF NOT EXISTS public.categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        created_at timestamptz DEFAULT now()
    );

    -- Ensure products has category_id and link it if needed
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') THEN
            BEGIN
                ALTER TABLE public.products ADD COLUMN category_id uuid REFERENCES public.categories(id);
            EXCEPTION WHEN others THEN NULL; END;
        END IF;
    END IF;

END $$;

-- 3. INITIALIZE CORE DATA
DO $$
DECLARE
    -- Stores
    store_main_id uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
    store_second_id uuid := 'b2c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

    -- Categories
    cat_abarrotes_id uuid := 'a1111111-aaaa-1111-aaaa-111111111111';
    cat_lacteos_id uuid := 'b2222222-bbbb-2222-bbbb-222222222222';
    cat_limpieza_id uuid := 'c3333333-cccc-3333-cccc-333333333333';
    cat_bebidas_id uuid := 'd4444444-dddd-4444-dddd-444444444444';

    -- Users
    user_admin_id uuid := 'a1111111-1111-1111-1111-111111111111';
    user_encargado_id uuid := 'e2222222-2222-2222-2222-222222222222';
    user_cajero_id uuid := 'c3333333-3333-3333-3333-333333333333';
    user_almacen_id uuid := 'b4444444-4444-4444-4444-444444444444';

    has_category_id boolean;
    pwd_hash text;
BEGIN
    -- Create Stores
    INSERT INTO public.stores (id, name, address, is_active)
    VALUES
        (store_main_id, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true),
        (store_second_id, 'SUCURSAL BELGRANO', 'Av. Cabildo 2500, CABA', true);

    -- Create Categories
    INSERT INTO public.categories (id, name, description)
    VALUES
        (cat_abarrotes_id, 'ABARROTES', 'Productos de consumo básico'),
        (cat_lacteos_id, 'LÁCTEOS', 'Leches, quesos y derivados'),
        (cat_limpieza_id, 'LIMPIEZA', 'Artículos para el hogar'),
        (cat_bebidas_id, 'BEBIDAS', 'Aguas, gaseosas y jugos');

    -- 4. INITIALIZE AUTH & PROFILES (Password: demo123)
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    pwd_hash := crypt('demo123', gen_salt('bf'));

    -- User Creation Helper Logic
    -- ADMIN
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (user_admin_id, 'authenticated', 'authenticated', 'admin@demo.com', pwd_hash, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (user_admin_id, 'admin@demo.com', 'Admin Global', 'admin', store_main_id, store_main_id, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (user_admin_id, store_main_id, 'admin', 'active'), (user_admin_id, store_second_id, 'admin', 'active');

    -- ENCARGADO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (user_encargado_id, 'authenticated', 'authenticated', 'encargado@demo.com', pwd_hash, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente Sucursal"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (user_encargado_id, 'encargado@demo.com', 'Gerente Sucursal', 'encargado', store_main_id, store_main_id, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (user_encargado_id, store_main_id, 'encargado', 'active');

    -- CAJERO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (user_cajero_id, 'authenticated', 'authenticated', 'cajero@demo.com', pwd_hash, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Cajero Central"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (user_cajero_id, 'cajero@demo.com', 'Cajero Central', 'clerk', store_main_id, store_main_id, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (user_cajero_id, store_main_id, 'clerk', 'active');

    -- ALMACENERO
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (user_almacen_id, 'authenticated', 'authenticated', 'almacen@demo.com', pwd_hash, now(), '{"provider": "email", "providers": ["email"]}', '{"full_name": "Jefe Almacén"}', now(), now());
    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (user_almacen_id, 'almacen@demo.com', 'Jefe Almacén', 'warehouse', store_main_id, store_main_id, true);
    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES (user_almacen_id, store_main_id, 'warehouse', 'active');

    -- 5. INITIALIZE ENRICHED PRODUCT CATALOG
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') INTO has_category_id;

    IF has_category_id THEN
        INSERT INTO public.products (id, store_id, sku, name, category_id, price, cost_price, stock_current, is_active)
        VALUES
            ('p1111111-1111-1111-1111-111111111111', store_main_id, 'PROD-001', cat_abarrotes_id, 1200, 800, 150, true),
            ('p2222222-2222-2222-2222-222222222222', store_main_id, 'PROD-002', cat_abarrotes_id, 2500, 1850, 85, true),
            ('p3333333-3333-3333-3333-333333333333', store_main_id, 'PROD-003', cat_lacteos_id, 1500, 1100, 240, true),
            ('p4444444-4444-4444-4444-444444444444', store_main_id, 'PROD-004', cat_limpieza_id, 3200, 2400, 60, true),
            ('p5555555-5555-5555-5555-555555555555', store_main_id, 'PROD-005', cat_bebidas_id, 900, 600, 120, true),
            ('p6666666-6666-6666-6666-666666666666', store_main_id, 'PROD-006', cat_bebidas_id, 1800, 1200, 45, true);

        -- Products for second store (Transfers Demo)
        INSERT INTO public.products (store_id, sku, name, category_id, price, cost_price, stock_current, is_active)
        VALUES
            (store_second_id, 'PROD-001', 'ARROZ EXTRA 1KG', cat_abarrotes_id, 1200, 800, 20, true),
            (store_second_id, 'PROD-003', 'LECHE ENTERA 1L', cat_lacteos_id, 1500, 1100, 15, true);
    ELSE
        INSERT INTO public.products (id, store_id, sku, name, category, price, cost_price, stock_current, is_active)
        VALUES
            ('p1111111-1111-1111-1111-111111111111', store_main_id, 'PROD-001', 'ABARROTES', 1200, 800, 150, true),
            ('p2222222-2222-2222-2222-222222222222', store_main_id, 'PROD-002', 'ABARROTES', 2500, 1850, 85, true),
            ('p3333333-3333-3333-3333-333333333333', store_main_id, 'PROD-003', 'LÁCTEOS', 1500, 1100, 240, true),
            ('p4444444-4444-4444-4444-444444444444', store_main_id, 'PROD-004', 'LIMPIEZA', 3200, 2400, 60, true),
            ('p5555555-5555-5555-5555-555555555555', store_main_id, 'PROD-005', 'BEBIDAS', 900, 600, 120, true),
            ('p6666666-6666-6666-6666-666666666666', store_main_id, 'PROD-006', 'BEBIDAS', 1800, 1200, 45, true);
    END IF;

    -- 6. SAMPLE TRANSACTIONS (Sales)
    DECLARE
        trans_id uuid := gen_random_uuid();
    BEGIN
        INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, created_at)
        VALUES (trans_id, store_main_id, user_cajero_id, 4900, 'completed', 'cash', now() - interval '2 hours');

        INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
        VALUES
            (trans_id, 'p1111111-1111-1111-1111-111111111111', 2, 1200, 800),
            (trans_id, 'p2222222-2222-2222-2222-222222222222', 1, 2500, 1850);

        trans_id := gen_random_uuid();
        INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method, created_at)
        VALUES (trans_id, store_main_id, user_cajero_id, 3200, 'completed', 'transfer', now() - interval '1 hour');

        INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
        VALUES (trans_id, 'p4444444-4444-4444-4444-444444444444', 1, 3200, 2400);
    END;

    -- 7. SAMPLE INVENTORY ADJUSTMENTS
    DECLARE
        adj_id uuid := gen_random_uuid();
    BEGIN
        INSERT INTO public.inventory_adjustments (id, store_id, created_by, status, notes, reason)
        VALUES (adj_id, store_main_id, user_encargado_id, 'COMPLETED', 'Rotura accidental durante reposición', 'DAMAGED');

        INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity, difference)
        VALUES (adj_id, 'p3333333-3333-3333-3333-333333333333', 241, 240, -1);
    EXCEPTION WHEN others THEN NULL; -- Skip if some adjustment tables/enums differ
    END;

    -- 8. SAMPLE TRANSFERS
    DECLARE
        transfer_id uuid := gen_random_uuid();
    BEGIN
        INSERT INTO public.transfers (id, origin_store_id, destination_store_id, created_by, status, notes)
        VALUES (transfer_id, store_main_id, store_second_id, user_encargado_id, 'PENDIENTE', 'Refuerzo de stock para fin de semana');

        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost)
        VALUES
            (transfer_id, 'p1111111-1111-1111-1111-111111111111', 50, 800),
            (transfer_id, 'p3333333-3333-3333-3333-333333333333', 30, 1100);
    EXCEPTION WHEN others THEN NULL;
    END;

END $$;

-- 9. RESTORE TRIGGER SECURITY
SET session_replication_role = 'origin';

-- End of indestructive enriched reset script
