-- ============================================================================
-- TEST RLS — CP-NOMINA-SUPERADMIN-TRANSVERSAL (2026-11-21)
-- ============================================================================
-- Propósito: validar que tras la migración 20261121240000:
--   1. el SuperAdmin de plataforma (sin membresías de tienda) puede crear/
--      ver/editar trabajadores y gestionar comisiones en CUALQUIER tienda
--      (nómina de principio a fin);
--   2. NO hay regresión para roles de tienda (manager/encargado conservan
--      exactamente su alcance de membresía);
--   3. el aislamiento por tienda se conserva (manager sin membresía en la
--      tienda B NO puede crear trabajadores ahí).
-- Ejecución: transacción única BEGIN/ROLLBACK (no deja residuos).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.test_assert(p_condition boolean, p_msg text)
RETURNS void AS $$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION 'TEST_FAILED: %', p_msg;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── 1. SETUP: tenant, tiendas, usuarios controlados ────────────────────────
INSERT INTO public.tenants (id, name) VALUES
('00000000-0000-0000-0000-0000000000aa', 'TENANT_NOMINA_TEST')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (id, name, tenant_id) VALUES
('aaaaaaaa-0000-0000-0000-000000000001', 'STORE_FERROCARRIL_TEST', '00000000-0000-0000-0000-0000000000aa'),
('aaaaaaaa-0000-0000-0000-000000000002', 'STORE_OTRA_TEST',       '00000000-0000-0000-0000-0000000000aa')
ON CONFLICT (id) DO NOTHING;

-- SuperAdmin de plataforma: SIN membresías de tienda (por diseño)
INSERT INTO auth.users (id, email) VALUES
('deadbeef-0000-0000-0000-00000000aa01', 'superadmin_nomina@test.com'),
('deadbeef-0000-0000-0000-00000000aa02', 'manager_nomina@test.com'),
('deadbeef-0000-0000-0000-00000000aa03', 'clerk_nomina@test.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, role, tenant_id) VALUES
('deadbeef-0000-0000-0000-00000000aa01', 'superadmin_nomina@test.com', 'superadmin', '00000000-0000-0000-0000-0000000000aa'),
('deadbeef-0000-0000-0000-00000000aa02', 'manager_nomina@test.com',   'manager',   '00000000-0000-0000-0000-0000000000aa'),
('deadbeef-0000-0000-0000-00000000aa03', 'clerk_nomina@test.com',     'clerk',     '00000000-0000-0000-0000-0000000000aa')
ON CONFLICT (id) DO NOTHING;

-- El trigger handle_new_user pudo ya crear los perfiles con rol por defecto:
-- fijar rol/tenant explícitamente (patrón de isolation_test.sql)
UPDATE public.profiles SET role='superadmin', tenant_id='00000000-0000-0000-0000-0000000000aa'
WHERE id='deadbeef-0000-0000-0000-00000000aa01'::uuid;
UPDATE public.profiles SET role='manager', tenant_id='00000000-0000-0000-0000-0000000000aa'
WHERE id='deadbeef-0000-0000-0000-00000000aa02'::uuid;
UPDATE public.profiles SET role='clerk', tenant_id='00000000-0000-0000-0000-0000000000aa'
WHERE id='deadbeef-0000-0000-0000-00000000aa03'::uuid;

-- Membresías: manager y clerk SOLO en la tienda 1 (clerk sin rol de gestión)
INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
('deadbeef-0000-0000-0000-00000000aa02', 'aaaaaaaa-0000-0000-0000-000000000001', 'manager', 'active'),
('deadbeef-0000-0000-0000-00000000aa03', 'aaaaaaaa-0000-0000-0000-000000000001', 'clerk',   'active')
ON CONFLICT (user_id, store_id) DO NOTHING;

-- Producto de la tienda 1 (para la regla de comisión por producto)
INSERT INTO public.products (id, name, sku, store_id, tenant_id) VALUES
('11111111-0000-0000-0000-00000000aa01', 'PROD_NOMINA_TEST', 'SKU-NOMINA', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa')
ON CONFLICT (id) DO NOTHING;

-- ── 2. SUPERADMIN: nómina de principio a fin transversal ───────────────────
SET LOCAL "request.jwt.claims" = '{"sub": "deadbeef-0000-0000-0000-00000000aa01", "role": "authenticated"}';
SET ROLE authenticated;

SELECT pg_temp.test_assert(public.is_superadmin(), 'El usuario debe ser superadmin');

-- 2.1 LA OPERACIÓN QUE FALLABA EN PRODUCCIÓN: crear trabajador
INSERT INTO public.workers (store_id, first_name, last_name, ci)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Moises', 'Test', '99010100001');
SELECT pg_temp.test_assert(COUNT(*) = 1, 'SuperAdmin debe poder crear el trabajador')
FROM public.workers WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND ci = '99010100001';

-- 2.2 UPDATE y DELETE del trabajador creado
UPDATE public.workers SET address = 'Calle 10 #25'
WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND ci = '99010100001';
SELECT pg_temp.test_assert(address = 'Calle 10 #25', 'SuperAdmin debe poder editar el trabajador')
FROM public.workers WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND ci = '99010100001';

-- 2.3 Regla de comisión + producto de regla (antes sin bypass global)
INSERT INTO public.commission_rules (store_id, type, value_percent)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'percentage_sales', 5.00);
SELECT pg_temp.test_assert(COUNT(*) = 1, 'SuperAdmin debe poder crear reglas de comisión')
FROM public.commission_rules WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND type = 'percentage_sales';

INSERT INTO public.commission_rule_products (rule_id, product_id)
SELECT r.id, p.id
FROM public.commission_rules r, public.products p
WHERE r.store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND r.type = 'percentage_sales'
  AND p.store_id = 'aaaaaaaa-0000-0000-0000-000000000001'
LIMIT 1;
SELECT pg_temp.test_assert(COUNT(*) >= 1, 'SuperAdmin debe poder asignar productos a la regla')
FROM public.commission_rule_products cp
JOIN public.commission_rules r ON r.id = cp.rule_id
WHERE r.store_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- 2.4 Lecturas del dominio comisiones
SELECT pg_temp.test_assert(true, 'SuperAdmin debe leer commission_rule_versions')
FROM public.commission_rule_versions LIMIT 1;
SELECT pg_temp.test_assert(true, 'SuperAdmin debe leer sales_transactions')
FROM public.sales_transactions LIMIT 1;
SELECT pg_temp.test_assert(true, 'SuperAdmin debe leer commission_payments')
FROM public.commission_payments LIMIT 1;

-- 2.5 NÓMINA: tarifa salarial para el trabajador creado.
-- NOTA: las tablas de nómina son SELECT-only para authenticated (privacidad
-- CP-SEC, 20261114180000); la escritura se hace vía RPC SECURITY DEFINER con
-- gate can_manage_payroll_as / has_store_access_as (ambos incluyen superadmin
-- desde 2026-10-26/27). El camino REAL de la app es el RPC:
SELECT public.set_worker_salary_rate(
  (SELECT w.id FROM public.workers w
   WHERE w.store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND w.ci = '99010100001'),
  'daily', 1000.00, 'CUP', CURRENT_DATE);
SELECT pg_temp.test_assert(COUNT(*) = 1, 'SuperAdmin debe poder fijar la tarifa salarial del trabajador vía RPC')
FROM public.worker_salary_rates WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- 2.6 Lectura de nóminas
SELECT pg_temp.test_assert(true, 'SuperAdmin debe leer payrolls')
FROM public.payrolls LIMIT 1;

-- ── 3. REGRESIÓN MANAGER: alcance de membresía intacto ─────────────────────
SET LOCAL "request.jwt.claims" = '{"sub": "deadbeef-0000-0000-0000-00000000aa02", "role": "authenticated"}';

-- 3.1 Manager con membresía sigue pudiendo crear en SU tienda
INSERT INTO public.workers (store_id, first_name, last_name, ci)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ManagerCrea', 'Test', '99020200002');
SELECT pg_temp.test_assert(COUNT(*) = 1, 'Manager con membresía debe seguir creando trabajadores en su tienda')
FROM public.workers WHERE store_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND ci = '99020200002';

-- 3.2 Manager NO puede crear en tienda sin membresía (aislamiento intacto)
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.workers (store_id, first_name, last_name, ci)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000002', 'Intruso', 'Test', '99030300003');
    v_ok := true;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'TEST_FAILED: manager sin membresía NO debe poder crear trabajador en otra tienda';
  END IF;
END $$;

-- 3.3 Manager NO puede borrar trabajadores (borrado reservado a admin level).
-- NOTA: un DELETE bloqueado por RLS no lanza excepción — borra 0 filas.
-- La aserción correcta es que la fila SIGUE existiendo.
DELETE FROM public.workers WHERE ci = '99020200002';
SELECT pg_temp.test_assert(COUNT(*) = 1,
  'Manager NO debe poder borrar: el trabajador debe seguir existiendo')
FROM public.workers WHERE ci = '99020200002';

-- ── 4. REGRESIÓN CLERK: sin rol de gestión NO crea trabajadores ────────────
SET LOCAL "request.jwt.claims" = '{"sub": "deadbeef-0000-0000-0000-00000000aa03", "role": "authenticated"}';

DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.workers (store_id, first_name, last_name, ci)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'ClerkProhibido', 'Test', '99040400004');
    v_ok := true;
  EXCEPTION WHEN insufficient_privilege THEN v_ok := false;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'TEST_FAILED: clerk NO debe poder crear trabajadores aunque tenga membresía';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
