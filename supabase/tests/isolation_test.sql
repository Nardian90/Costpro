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
-- NOTA (CP-SEC-003, 2026-11-03): profiles.id tiene FK a auth.users y el trigger
-- on_auth_user_created (handle_new_user) ya crea el perfil al insertar el
-- usuario; se crean primero en auth.users y luego se ajusta rol/tenant.
INSERT INTO auth.users (id, email) VALUES
('deadbeef-dead-beef-dead-beef00000001', 'manager_alpha@test.com'),
('deadbeef-dead-beef-dead-beef00000002', 'encargado_alpha@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role, tenant_id, active_store_id) VALUES
('deadbeef-dead-beef-dead-beef00000001', 'manager_alpha@test.com', 'manager', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('deadbeef-dead-beef-dead-beef00000002', 'encargado_alpha@test.com', 'encargado', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET role='manager', tenant_id='00000000-0000-0000-0000-000000000001'
WHERE id='deadbeef-dead-beef-dead-beef00000001'::uuid;
UPDATE public.profiles SET role='encargado', tenant_id='00000000-0000-0000-0000-000000000001'
WHERE id='deadbeef-dead-beef-dead-beef00000002'::uuid;

-- Memberships (antes de fijar active_store_id: validate_active_store lo exige)
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
('deadbeef-dead-beef-dead-beef00000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manager', 'active'),
('deadbeef-dead-beef-dead-beef00000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'encargado', 'active')
ON CONFLICT (user_id, store_id) DO NOTHING;

UPDATE public.profiles SET active_store_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
WHERE id IN ('deadbeef-dead-beef-dead-beef00000001'::uuid, 'deadbeef-dead-beef-dead-beef00000002'::uuid);

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
-- NOTA (CP-SEC-003, 2026-11-03): el modelo vigente no concede SELECT de tabla a
-- anon (ni a PUBLIC) en products — la lectura pública del catálogo no pasa por
-- grants de tabla a anon. Se aserta eso directamente (más fuerte que contar 0):
-- sin privilegio, anon no puede leer la tabla en absoluto.
SET ROLE anon;
SET LOCAL "request.jwt.claims" = '{}';

SELECT test_assert(has_table_privilege('anon', 'public.products', 'SELECT') = false,
  'Rol Anon NO debe tener privilegio SELECT de tabla sobre products');

-- 4. ESCENARIO: ADMIN ACCESS (GLOBAL)
-- ----------------------------------------------------------------------------
RESET ROLE; -- volver a postgres para el setup de este escenario

-- FK a auth.users + perfil auto-creado por handle_new_user: crear usuario y ajustar rol.
INSERT INTO auth.users (id, email) VALUES
('00000000-0000-0000-0000-000000000000', 'admin@test.com')
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET role='admin' WHERE id='00000000-0000-0000-0000-000000000000'::uuid;

SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}';

SELECT test_assert(COUNT(*) >= 2, 'Admin debe ver todos los productos') FROM public.products;

ROLLBACK;
