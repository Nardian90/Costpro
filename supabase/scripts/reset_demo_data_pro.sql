-- ==========================================
-- CostPro Professional Demo Reset Script (v5.7.13)
-- Targets: Supabase SQL Editor
-- Features: Dynamic Cleanup, Schema Enforcement, Trigger Safety
-- ==========================================

-- 0. INITIAL SETUP & SECURITY
-- Disable all triggers during the reset to prevent audit log noise and recursive calculations
SET session_replication_role = 'replica';

DO $$
BEGIN
    -- 1. DYNAMIC CLEANUP OF OPERATIONAL TABLES
    -- CASCADE ensures that all dependent records are removed in correct order
    DECLARE
        tab_name text;
        tables_to_truncate text[] := ARRAY[
            'audit_logs',
            'business_events',
            'cash_closures',
            'cash_movements',
            'cash_register_sessions',
            'idempotency_keys',
            'inventory_adjustments',
            'inventory_adjustment_items',
            'product_variants',
            'products',
            'categories',
            'receipt_items',
            'receipts',
            'stock_movements',
            'transaction_items',
            'transactions',
            'user_store_memberships',
            'profiles',
            'stores',
            'suppliers',
            'rss_feeds',
            'rss_settings'
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
            ALTER TYPE user_role ADD VALUE 'usuario';
        EXCEPTION WHEN duplicate_object THEN
            -- Role already exists, skip
        END;
    END IF;

    -- Ensure categories table exists
    CREATE TABLE IF NOT EXISTS public.categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        description text,
        created_at timestamptz DEFAULT now()
    );

    -- Ensure products has category_id and link it
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') THEN
            ALTER TABLE public.products ADD COLUMN category_id uuid REFERENCES public.categories(id);
        END IF;
    END IF;

END $$;

-- 3. INITIALIZE CORE DATA
DO $$
DECLARE
    demo_store_id uuid := 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'; -- Standard Demo UUID
    cat_abarrotes_id uuid := 'a1111111-aaaa-1111-aaaa-111111111111';
    cat_lacteos_id uuid := 'b2222222-bbbb-2222-bbbb-222222222222';
    cat_limpieza_id uuid := 'c3333333-cccc-3333-cccc-333333333333';
BEGIN
    -- Create Demo Store
    INSERT INTO public.stores (id, name, address, is_active)
    VALUES (demo_store_id, 'TIENDA CENTRAL COSTPRO', 'Av. Libertad 1234, CABA', true);

    -- Create Demo Categories
    INSERT INTO public.categories (id, name, description)
    VALUES
        (cat_abarrotes_id, 'ABARROTES', 'Productos de consumo básico'),
        (cat_lacteos_id, 'LÁCTEOS', 'Leches, quesos y derivados'),
        (cat_limpieza_id, 'LIMPIEZA', 'Artículos para el hogar');

    -- 4. INITIALIZE AUTH & PROFILES (Password: demo123)
    -- Note: Using standard PGCrypto for auth compatibility
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- ADMIN: admin@demo.com
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
        'a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'admin@demo.com',
        crypt('demo123', gen_salt('bf')), now(),
        '{"provider": "email", "providers": ["email"]}', '{"full_name": "Admin Global"}',
        now(), now(), '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES ('a1111111-1111-1111-1111-111111111111', 'admin@demo.com', 'Admin Global', 'admin', demo_store_id, demo_store_id, true);

    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('a1111111-1111-1111-1111-111111111111', demo_store_id, 'admin', 'active');

    -- ENCARGADO: encargado@demo.com
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
        'e2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'encargado@demo.com',
        crypt('demo123', gen_salt('bf')), now(),
        '{"provider": "email", "providers": ["email"]}', '{"full_name": "Gerente de Sucursal"}',
        now(), now(), '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES ('e2222222-2222-2222-2222-222222222222', 'encargado@demo.com', 'Gerente de Sucursal', 'encargado', demo_store_id, demo_store_id, true);

    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('e2222222-2222-2222-2222-222222222222', demo_store_id, 'encargado', 'active');

    -- 5. INITIALIZE PRODUCTS (Linked to Categories)
    -- Using a technique that handles both legacy 'category' (text) and new 'category_id' (uuid)
    -- This prevents error 42703 (Undefined Column) in different schema versions
    EXECUTE format('
        INSERT INTO public.products (store_id, sku, name, %I, price, cost_price, stock_current, is_active)
        VALUES
            ($1, $2, $3, $4, 1200, 800, 150, true),
            ($1, $5, $6, $4, 2500, 1850, 85, true),
            ($1, $7, $8, $9, 1500, 1100, 240, true),
            ($1, $10, $11, $12, 3200, 2400, 60, true),
            ($1, $13, $14, $4, 4500, 3100, 120, true),
            ($1, $15, $16, $9, 800, 550, 45, true)',
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id')
             THEN 'category_id' ELSE 'category' END
    ) USING
        demo_store_id, 'PROD-001', 'ARROZ EXTRA 1KG', cat_abarrotes_id,
        'PROD-002', 'ACEITE VEGETAL 1L',
        'PROD-003', 'LECHE ENTERA 1L', cat_lacteos_id,
        'PROD-004', 'DETERGENTE LÍQUIDO', cat_limpieza_id,
        'PROD-005', 'CAFÉ MOLIDO 250G',
        'PROD-006', 'YOGUR NATURAL';

    -- 6. RSS DEFAULT SETTINGS
    INSERT INTO public.rss_settings (id, ai_enabled, refresh_interval)
    VALUES ('00000000-0000-0000-0000-000000000000', true, 60)
    ON CONFLICT (id) DO NOTHING;

END $$;

-- 7. RESTORE TRIGGER SECURITY
SET session_replication_role = 'origin';

-- End of Pro Reset Script
