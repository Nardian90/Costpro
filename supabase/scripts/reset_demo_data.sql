-- SQL Script to RESET AND SEED everything with Multi-Store data
-- Comprehensive version: Catalog, Receptions, Sales, Adjustments, and Transfers
-- Target: Supabase SQL Editor
-- Version: 5.7.10 (Updated for Enterprise Hardening)

-- 0. FIX SCHEMATIC GAPS
-- Drop existing to avoid parameter name conflict (ERROR 42P13)
DROP FUNCTION IF EXISTS public.has_role(public.user_role) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.user_role) CASCADE;

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_required_role public.user_role)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_actual_role public.user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = p_user_id;
    IF v_actual_role IS NULL THEN RETURN false; END IF;

    -- Role Hierarchy Logic
    IF v_actual_role = 'admin' THEN RETURN true; END IF;
    IF v_actual_role = 'encargado' AND p_required_role = 'manager' THEN RETURN true; END IF;
    IF v_actual_role = 'usuario' AND (p_required_role = 'clerk' OR p_required_role = 'warehouse') THEN RETURN true; END IF;

    RETURN v_actual_role = p_required_role;
END; $$;

-- Overload for 1-argument calls (commonly used in RLS)
CREATE OR REPLACE FUNCTION public.has_role(p_required_role public.user_role)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
    RETURN public.has_role(auth.uid(), p_required_role);
END; $$;

-- 1. CLEAN EVERYTHING (Sparing RSS tables)
DO $$
DECLARE
    tab_name text;
    tables_to_truncate text[] := ARRAY[
        'transfer_items', 'transfers', 'audit_logs', 'business_events',
        'cash_closures', 'cash_movements', 'cash_register_sessions',
        'idempotency_keys', 'inventory', 'inventory_batches', 'inventory_movements',
        'inventory_snapshots', 'product_variants', 'products', 'purchase_items',
        'purchase_orders', 'receipt_items', 'receipts', 'sale_items', 'sales',
        'stock_movements', 'transaction_items', 'transactions',
        'inventory_adjustments', 'inventory_adjustment_items',
        'user_store_memberships', 'profiles', 'stores',
        'sync_log'
    ];
BEGIN
    FOREACH tab_name IN ARRAY tables_to_truncate LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tab_name) THEN
            EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tab_name) || ' CASCADE';
        END IF;
    END LOOP;
END $$;

DELETE FROM auth.users;

-- 2. STORES (Norte y Sur)
INSERT INTO public.stores (id, name, address, is_active) VALUES
('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'Tienda Demo Norte', 'Avenida Central #101', true),
('d2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 'Tienda Demo Sur', 'Calle Sur #505', true);

-- 3. USERS (ACTUALIZADO: Password: demo123)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP FUNCTION IF EXISTS create_demo_user(UUID, TEXT, TEXT, public.user_role, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION create_demo_user(
    p_id UUID,
    p_email TEXT,
    p_name TEXT,
    p_role public.user_role,
    p_max_stores INTEGER DEFAULT 0,
    p_max_users INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
    -- Inserción en Auth (Nativo de Supabase)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, extensions.crypt('demo123', extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', p_name), now(), now(), '', '', '', '');

    -- Inserción en Profiles
    INSERT INTO public.profiles (id, email, full_name, role, is_active, active_store_id, max_stores_limit, max_users_limit)
    VALUES (p_id, p_email, p_name, p_role, true, 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', p_max_stores, p_max_users);
END; $$ LANGUAGE plpgsql;

-- Seed Users with Capacities
SELECT create_demo_user('a1111111-1111-1111-1111-111111111111', 'admin@demo.com', 'Administrador Demo', 'admin', 99, 99);
SELECT create_demo_user('e2222222-2222-2222-2222-222222222222', 'encargado@demo.com', 'Encargado Demo', 'encargado', 5, 10);
SELECT create_demo_user('c3333333-3333-3333-3333-333333333333', 'cajero@demo.com', 'Cajero Demo', 'clerk', 0, 0);
SELECT create_demo_user('b4444444-4444-4444-4444-444444444444', 'almacen@demo.com', 'Almacén Demo', 'warehouse', 0, 0);

-- Memberships
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
('a1111111-1111-1111-1111-111111111111', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'admin', 'active'),
('a1111111-1111-1111-1111-111111111111', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 'admin', 'active'),
('e2222222-2222-2222-2222-222222222222', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'encargado', 'active'),
('e2222222-2222-2222-2222-222222222222', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 'encargado', 'active'),
('c3333333-3333-3333-3333-333333333333', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'clerk', 'active'),
('b4444444-4444-4444-4444-444444444444', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'warehouse', 'active');

-- 4. PRODUCTS (CATALOG)
-- Norte
INSERT INTO public.products (id, name, sku, price, cost_price, category, store_id, stock_current) VALUES
('f1111111-0000-0000-0000-000000000001', 'Arroz 1kg', 'ARROZ-1KG', 25.00, 15.00, 'Granos', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 150),
('f1111111-0000-0000-0000-000000000002', 'Aceite 1L', 'ACEITE-1L', 85.00, 55.00, 'Aceites', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 45),
('f1111111-0000-0000-0000-000000000003', 'Frijoles 1kg', 'FRIJOL-1KG', 45.00, 30.00, 'Granos', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 75);
-- Sur
INSERT INTO public.products (id, name, sku, price, cost_price, category, store_id, stock_current) VALUES
('f2222222-0000-0000-0000-000000000001', 'Arroz 1kg', 'ARROZ-1KG', 26.00, 15.50, 'Granos', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 30),
('f2222222-0000-0000-0000-000000000002', 'Aceite 1L', 'ACEITE-1L', 88.00, 56.00, 'Aceites', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 15),
('f2222222-0000-0000-0000-000000000003', 'Frijoles 1kg', 'FRIJOL-1KG', 48.00, 31.00, 'Granos', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 20);

INSERT INTO public.inventory (store_id, product_id, quantity) SELECT store_id, id, stock_current FROM public.products;

-- 5. OPERATION: RECEPTION (Norte)
INSERT INTO public.receipts (id, user_id, store_id, supplier, total_cost, reference_doc, status)
VALUES ('f1000000-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'Distribuidora Central', 1300, 'FAC-001', 'active');

INSERT INTO public.receipt_items (id, receipt_id, product_id, quantity, unit_cost) VALUES
(gen_random_uuid(), 'f1000000-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000001', 50, 15.00),
(gen_random_uuid(), 'f1000000-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000002', 10, 55.00);

INSERT INTO public.stock_movements (store_id, product_id, quantity_change, movement_type, reference_id, created_by, unit_cost) VALUES
('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'f1111111-0000-0000-0000-000000000001', 50, 'purchase', 'f1000000-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 15.00),
('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'f1111111-0000-0000-0000-000000000002', 10, 'purchase', 'f1000000-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444', 55.00);

-- 6. OPERATION: SALE (Norte)
INSERT INTO public.transactions (id, store_id, seller_id, total_amount, subtotal, status, payment_method)
VALUES ('f2000000-1111-1111-1111-111111111111', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'c3333333-3333-3333-3333-333333333333', 135.00, 135.00, 'completed', 'cash');

INSERT INTO public.transaction_items (id, transaction_id, product_id, quantity, price_at_sale, cost_at_sale) VALUES
(gen_random_uuid(), 'f2000000-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000001', 2, 25.00, 15.00),
(gen_random_uuid(), 'f2000000-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000002', 1, 85.00, 55.00);

INSERT INTO public.stock_movements (store_id, product_id, quantity_change, movement_type, reference_id, created_by, unit_price) VALUES
('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'f1111111-0000-0000-0000-000000000001', -2, 'sale', 'f2000000-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333', 25.00),
('d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'f1111111-0000-0000-0000-000000000002', -1, 'sale', 'f2000000-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333', 85.00);

-- 7. OPERATION: ADJUSTMENT (Sur)
INSERT INTO public.inventory_adjustments (id, store_id, created_by, status, reason, notes)
VALUES ('f3000000-1111-1111-1111-111111111111', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 'e2222222-2222-2222-2222-222222222222', 'COMPLETED', 'STOCKTAKE_SHRINKAGE', 'Ajuste de fin de semana');

INSERT INTO public.inventory_adjustment_items (id, adjustment_id, product_id, expected_quantity, counted_quantity) VALUES
(gen_random_uuid(), 'f3000000-1111-1111-1111-111111111111', 'f2222222-0000-0000-0000-000000000002', 20, 15);

INSERT INTO public.stock_movements (store_id, product_id, quantity_change, movement_type, reference_id, created_by) VALUES
('d2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 'f2222222-0000-0000-0000-000000000002', -5, 'adjustment', 'f3000000-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222');

-- 8. OPERATION: TRANSFER (Norte -> Sur)
INSERT INTO public.transfers (id, origin_store_id, destination_store_id, created_by, status, notes)
VALUES ('f4000000-1111-1111-1111-111111111111', 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 'd2c4ba0e-5767-4ba0-e576-7d1c4ba0e577', 'e2222222-2222-2222-2222-222222222222', 'PENDIENTE', 'Traslado de arroz para stock');

INSERT INTO public.transfer_items (id, transfer_id, product_id, quantity, unit_cost) VALUES
(gen_random_uuid(), 'f4000000-1111-1111-1111-111111111111', 'f1111111-0000-0000-0000-000000000001', 20, 15.00);

-- 9. CLEANUP & REFRESH
DROP FUNCTION IF EXISTS create_demo_user(UUID, TEXT, TEXT, public.user_role, INTEGER, INTEGER);
DO $$ DECLARE r RECORD; BEGIN FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' LOOP EXECUTE 'REFRESH MATERIALIZED VIEW public.' || quote_ident(r.matviewname); END LOOP; END $$;
