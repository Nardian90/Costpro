-- SQL Script to clean everything and reset demo users (UPDATED v5.5.0)
-- Target: Supabase SQL Editor

-- 1. CLEAN EVERYTHING DYNAMICALLY
DO $$
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
        'transaction_items',
        'transactions',
        'inventory_adjustments',
        'inventory_adjustment_items',
        'suppliers',
        'user_store_memberships',
        'user_store_access',
        'profiles',
        'stores'
    ];
BEGIN
    FOREACH tab_name IN ARRAY tables_to_truncate
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tab_name
        ) THEN
            EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tab_name) || ' CASCADE';
        END IF;
    END LOOP;
END $$;

DELETE FROM auth.users;

-- 2. ENSURE TYPES AND SCHEMA
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario');
    ELSE
        -- Ensure all modern roles exist
        BEGIN
            ALTER TYPE user_role ADD VALUE 'encargado';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE user_role ADD VALUE 'usuario';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE user_role ADD VALUE 'manager';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 3. CREATE DEMO STORE
DO $$
DECLARE
    demo_store_id uuid;
BEGIN
    INSERT INTO public.stores (name, address, is_active)
    VALUES ('TIENDA DEMO', 'Calle Principal #123', true)
    RETURNING id INTO demo_store_id;

    -- 4. CREATE DEMO USERS (Password: demo123)
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- ADMIN: admin@demo.com
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
        'a1111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'admin@demo.com',
        extensions.crypt('demo123', extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Administrador Demo"}',
        now(),
        now(),
        '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (
        'a1111111-1111-1111-1111-111111111111',
        'admin@demo.com',
        'Administrador Demo',
        'admin',
        demo_store_id,
        demo_store_id,
        true
    );

    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('a1111111-1111-1111-1111-111111111111', demo_store_id, 'admin', 'active');

    -- ENCARGADO: encargado@demo.com
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
        'e2222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'encargado@demo.com',
        extensions.crypt('demo123', extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Encargado Demo"}',
        now(),
        now(),
        '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (
        'e2222222-2222-2222-2222-222222222222',
        'encargado@demo.com',
        'Encargado Demo',
        'encargado',
        demo_store_id,
        demo_store_id,
        true
    );

    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('e2222222-2222-2222-2222-222222222222', demo_store_id, 'encargado', 'active');

    -- CAJERO: cajero@demo.com
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
        'c3333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'cajero@demo.com',
        extensions.crypt('demo123', extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Cajero Demo"}',
        now(),
        now(),
        '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (
        'c3333333-3333-3333-3333-333333333333',
        'cajero@demo.com',
        'Cajero Demo',
        'clerk',
        demo_store_id,
        demo_store_id,
        true
    );

    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('c3333333-3333-3333-3333-333333333333', demo_store_id, 'clerk', 'active');

    -- ALMACÉN: almacen@demo.com
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (
        'b4444444-4444-4444-4444-444444444444',
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'almacen@demo.com',
        extensions.crypt('demo123', extensions.gen_salt('bf')),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Almacén Demo"}',
        now(),
        now(),
        '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, full_name, role, store_id, active_store_id, is_active)
    VALUES (
        'b4444444-4444-4444-4444-444444444444',
        'almacen@demo.com',
        'Almacén Demo',
        'warehouse',
        demo_store_id,
        demo_store_id,
        true
    );

    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
    VALUES ('b4444444-4444-4444-4444-444444444444', demo_store_id, 'warehouse', 'active');

    -- Legacy support (Populate user_store_access)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_store_access') THEN
        INSERT INTO public.user_store_access (user_id, store_id, roles)
        SELECT user_id, store_id, ARRAY[role::user_role]
        FROM public.user_store_memberships;
    END IF;

END $$;
