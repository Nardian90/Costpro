-- 1. CLEAN EVERYTHING DYNAMICALLY
-- This script truncates all known operational tables only if they exist.
DO $$
DECLARE
    tab_name text;
    -- List of all potential tables to clean
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
        'profiles',
        'stores'
    ];
BEGIN
    FOREACH tab_name IN ARRAY tables_to_truncate
    LOOP
        -- Only attempt to truncate if the table exists in the public schema
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tab_name
        ) THEN
            EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tab_name) || ' CASCADE';
        END IF;
    END LOOP;
END $$;

-- Delete all users from auth.users
DELETE FROM auth.users;

-- 2. CREATE DEMO STORE
-- Create a variable to hold the store_id
DO $$
DECLARE
    demo_store_id uuid;
BEGIN
    -- Create the demo store and get its ID
    INSERT INTO public.stores (name, address, is_active)
    VALUES ('TIENDA DEMO', 'Calle Principal #123', true)
    RETURNING id INTO demo_store_id;

    -- 3. CREATE DEMO USERS (Password: demo123)
    -- Enable pgcrypto if not already enabled
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

    -- 4. CREATE DEMO PRODUCTS
    INSERT INTO public.products (store_id, sku, name, category, price, cost_price, stock_current, is_active)
    VALUES
        (demo_store_id, 'PROD-001', 'ARROZ EXTRA 1KG', 'ABARROTES', 1200, 800, 100, true),
        (demo_store_id, 'PROD-002', 'ACEITE VEGETAL 1L', 'ABARROTES', 2500, 1800, 50, true),
        (demo_store_id, 'PROD-003', 'LECHE ENTERA 1L', 'LÁCTEOS', 1500, 1100, 80, true),
        (demo_store_id, 'PROD-004', 'DETERGENTE LÍQUIDO', 'LIMPIEZA', 3200, 2400, 30, true),
        (demo_store_id, 'PROD-005', 'CAFÉ MOLIDO 250G', 'INFUSIONES', 4500, 3100, 45, true);
END $$;
