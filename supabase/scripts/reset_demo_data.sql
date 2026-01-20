-- SQL Script to clean everything and reset demo users
-- Target: Supabase SQL Editor

-- 1. CLEAN EVERYTHING
-- Truncate all operational tables in public schema
-- Using CASCADE to handle dependencies and including user tables
TRUNCATE TABLE
    public.audit_logs,
    public.business_events,
    public.cash_closures,
    public.cash_movements,
    public.cash_register_sessions,
    public.idempotency_keys,
    public.inventory,
    public.inventory_batches,
    public.inventory_movements,
    public.inventory_snapshots,
    public.product_variants,
    public.products,
    public.purchase_items,
    public.purchase_orders,
    public.receipt_items,
    public.receipts,
    public.sale_items,
    public.sales,
    public.stock_movements,
    public.transaction_items,
    public.transactions,
    public.inventory_adjustments,
    public.inventory_adjustment_items,
    public.suppliers,
    public.user_store_access,
    public.profiles,
    public.stores
CASCADE;

-- Delete all users from auth.users (this will cascade if FKs are set, but we already truncated profiles)
DELETE FROM auth.users;

-- 2. ENSURE SCHEMA ROBUSTNESS
-- Ensure user_role type exists with all necessary values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario');
    ELSE
        -- Add missing values if type already exists
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'encargado') THEN
            ALTER TYPE user_role ADD VALUE 'encargado';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'usuario') THEN
            ALTER TYPE user_role ADD VALUE 'usuario';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'manager') THEN
            ALTER TYPE user_role ADD VALUE 'manager';
        END IF;
    END IF;
END $$;

-- Ensure roles column exists in user_store_access
ALTER TABLE public.user_store_access ADD COLUMN IF NOT EXISTS roles user_role[] DEFAULT '{clerk}';

-- 3. REFRESH MATERIALIZED VIEWS
-- This ensures that dashboards and reports are cleared of old data
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'
    LOOP
        EXECUTE 'REFRESH MATERIALIZED VIEW public.' || quote_ident(r.matviewname);
    END LOOP;
END $$;

-- 4. CREATE DEMO STORE
INSERT INTO public.stores (id, name, address, is_active)
VALUES ('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'Tienda Demo', 'Calle Principal #123', true);

-- 5. CREATE DEMO USERS (Password: demo123)
-- We use a standardized approach for Supabase auth.users

-- Helper for password encryption
-- Note: 'extensions' is the default schema for pgcrypto in Supabase
-- If you get an error, ensure pgcrypto is enabled: CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    true
);

INSERT INTO public.user_store_access (user_id, store_id, roles)
VALUES ('a1111111-1111-1111-1111-111111111111', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', '{admin}');


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
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    true
);

INSERT INTO public.user_store_access (user_id, store_id, roles)
VALUES ('e2222222-2222-2222-2222-222222222222', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', '{encargado}');


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
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    true
);

INSERT INTO public.user_store_access (user_id, store_id, roles)
VALUES ('c3333333-3333-3333-3333-333333333333', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', '{clerk}');


-- ALMACEN: almacen@demo.com
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
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576',
    true
);

INSERT INTO public.user_store_access (user_id, store_id, roles)
VALUES ('b4444444-4444-4444-4444-444444444444', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', '{warehouse}');
