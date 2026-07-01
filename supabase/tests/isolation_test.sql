-- ============================================================================
-- SUITE DE PRUEBAS DE AISLAMIENTO MULTI-TENANT (RLS & SECURITY DEFINER)
-- ============================================================================
-- Propósito: Validar que no existan fugas de datos entre tenants o roles.
-- Ejecución: Este script debe ejecutarse en una transacción (BEGIN/ROLLBACK).

BEGIN;

-- 1. SETUP DE DATOS CONTROLADOS
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name) VALUES
('00000000-0000-0000-0000-000000000001', 'TENANT_ALPHA'),
('00000000-0000-0000-0000-000000000002', 'TENANT_BETA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (id, name, tenant_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'STORE_ALPHA_1', '00000000-0000-0000-0000-000000000001'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STORE_BETA_1', '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Usuarios
INSERT INTO public.profiles (id, email, role, tenant_id, active_store_id) VALUES
('deadbeef-dead-beef-dead-beef00000001', 'manager_alpha@test.com', 'manager', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('deadbeef-dead-beef-dead-beef00000002', 'encargado_alpha@test.com', 'encargado', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO NOTHING;

-- Memberships
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
('deadbeef-dead-beef-dead-beef00000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager', 'active'),
('deadbeef-dead-beef-dead-beef00000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'encargado', 'active')
ON CONFLICT (user_id, store_id) DO NOTHING;

-- Productos
INSERT INTO public.products (id, name, sku, store_id, tenant_id) VALUES
('11111111-1111-1111-1111-111111111111', 'PROD_ALPHA', 'SKU-A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001'),
('22222222-2222-2222-2222-222222222222', 'PROD_BETA', 'SKU-B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- FUNCION DE ASERCION
CREATE OR REPLACE FUNCTION test_assert(p_condition boolean, p_msg text) RETURNS void AS $$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION 'TEST_FAILED: %', p_msg;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. ESCENARIO: MANAGER ALPHA (TENANT A)
-- ----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub": "deadbeef-dead-beef-dead-beef00000001", "role": "authenticated"}';
SET ROLE authenticated;

SELECT test_assert(COUNT(*) = 1, 'Manager Alpha debe ver 1 producto');
SELECT test_assert(name = 'PROD_ALPHA', 'Manager Alpha debe ver PROD_ALPHA') FROM public.products;

-- 3. ESCENARIO: ROLE ANON (NO ACCESS)
-- ----------------------------------------------------------------------------
SET ROLE anon;
SET LOCAL "request.jwt.claims" = '{}';

SELECT test_assert(COUNT(*) = 0, 'Rol Anon NO debe ver productos') FROM public.products;

-- 4. ESCENARIO: ADMIN ACCESS (GLOBAL)
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, email, role) VALUES
('00000000-0000-0000-0000-000000000000', 'admin@test.com', 'admin')
ON CONFLICT (id) DO NOTHING;

SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}';

SELECT test_assert(COUNT(*) >= 2, 'Admin debe ver todos los productos') FROM public.products;

ROLLBACK;
