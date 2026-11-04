-- ============================================================================
-- CP-SEC-003 — PRUEBA DE AISLAMIENTO: products UPDATE tras consolidación
-- ============================================================================
-- Propósito: demostrar que con products_tenant_update como ÚNICA policy
--   permisiva de UPDATE (tras retirar products_update_rls):
--   (a) un usuario de OTRO tenant NO puede actualizar;
--   (b) un usuario con membresía en la tienda y tenant correcto SÍ;
--   (c) un admin global SÍ (regla vigente: is_admin());
--   (d) un usuario SIN membresía en la tienda del producto NO puede.
-- Ejecución (CostproE2E, con la consolidación aplicada):
--   transaccional (BEGIN/ROLLBACK), cero residuos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION test_assert(p_condition boolean, p_msg text) RETURNS void AS $test_assert_s3$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION 'TEST_FAILED: %', p_msg;
  END IF;
END
$test_assert_s3$ LANGUAGE plpgsql;

-- ── Guard: la policy débil NO debe existir (consolidación aplicada) ────────
DO $s3_guard$
DECLARE v_weak int;
BEGIN
  SELECT count(*) INTO v_weak FROM pg_policies
  WHERE schemaname='public' AND tablename='products'
    AND policyname='products_update_rls';
  IF v_weak > 0 THEN
    RAISE EXCEPTION 'GUARD: products_update_rls sigue presente; esta prueba exige la consolidación CP-SEC-003 aplicada';
  END IF;
END
$s3_guard$;

-- ── Setup: dos tenants, dos tiendas, productos y usuarios de prueba ────────
INSERT INTO public.tenants (id, name) VALUES
  ('a3e20000-0000-0000-0000-0000000000aa', 'S3_TENANT_A'),
  ('a3e20000-0000-0000-0000-0000000000bb', 'S3_TENANT_B');

INSERT INTO public.stores (id, name, tenant_id) VALUES
  ('a3e20000-0000-0000-0000-000000000001', 'S3_TIENDA_A', 'a3e20000-0000-0000-0000-0000000000aa'),
  ('a3e20000-0000-0000-0000-000000000002', 'S3_TIENDA_B', 'a3e20000-0000-0000-0000-0000000000bb');

INSERT INTO auth.users (id, email) VALUES
  ('a3e20000-0000-0000-0000-000000000a01', 's3-manager-a@fixture.local'),
  ('a3e20000-0000-0000-0000-000000000b01', 's3-clerk-b@fixture.local'),
  ('a3e20000-0000-0000-0000-000000000c01', 's3-admin@fixture.local');

-- (perfiles creados por handle_new_user; ajustar rol y tenant)
UPDATE public.profiles SET role='admin', tenant_id='a3e20000-0000-0000-0000-0000000000aa'
WHERE id='a3e20000-0000-0000-0000-000000000a01'::uuid;
UPDATE public.profiles SET role='clerk', tenant_id='a3e20000-0000-0000-0000-0000000000bb'
WHERE id='a3e20000-0000-0000-0000-000000000b01'::uuid;
UPDATE public.profiles SET role='admin', tenant_id='a3e20000-0000-0000-0000-0000000000aa'
WHERE id='a3e20000-0000-0000-0000-000000000c01'::uuid;

INSERT INTO public.user_store_memberships (user_id, store_id, role, status) VALUES
  ('a3e20000-0000-0000-0000-000000000a01', 'a3e20000-0000-0000-0000-000000000001', 'manager', 'active'),
  ('a3e20000-0000-0000-0000-000000000b01', 'a3e20000-0000-0000-0000-000000000002', 'clerk', 'active');

INSERT INTO public.products (id, name, sku, store_id, tenant_id, price) VALUES
  ('a3e20000-0000-0000-0000-00000000d001', 'S3_PROD_A', 'S3-SKU-A', 'a3e20000-0000-0000-0000-000000000001', 'a3e20000-0000-0000-0000-0000000000aa', 100),
  ('a3e20000-0000-0000-0000-00000000d002', 'S3_PROD_B', 'S3-SKU-B', 'a3e20000-0000-0000-0000-000000000002', 'a3e20000-0000-0000-0000-0000000000bb', 100);

-- ── Caso (b): usuario de la tienda A y tenant A actualiza prod A ──────────
SET LOCAL "request.jwt.claims" = '{"sub": "a3e20000-0000-0000-0000-000000000a01", "role": "authenticated"}';
SET ROLE authenticated;

UPDATE public.products SET name='S3_PROD_A_v2' WHERE id='a3e20000-0000-0000-0000-00000000d001'::uuid;
SELECT test_assert((SELECT name FROM public.products WHERE id='a3e20000-0000-0000-0000-00000000d001'::uuid)='S3_PROD_A_v2',
  'T2.2-b: usuario con membresía y tenant correcto DEBE poder actualizar');

-- ── Caso (a): el MISMO usuario NO puede actualizar el producto del tenant B ─
-- (RLS filtra la fila: el UPDATE muta 0 filas; se restauran los datos tocados)
UPDATE public.products SET name='S3_ATACANTE' WHERE id='a3e20000-0000-0000-0000-00000000d002'::uuid;
SELECT test_assert((SELECT name FROM public.products WHERE id='a3e20000-0000-0000-0000-00000000d002'::uuid)='S3_PROD_B',
  'T2.2-a: usuario de tenant A NO debe poder actualizar producto de tenant B (0 filas mutadas)');

RESET ROLE;

-- ── Caso (d): usuario SIN membresía en la tienda del producto NO puede ─────
-- clerk-b pertenece a tienda B: intenta actualizar prod A (otro tenant, otra tienda).
SET LOCAL "request.jwt.claims" = '{"sub": "a3e20000-0000-0000-0000-000000000b01", "role": "authenticated"}';
SET ROLE authenticated;

UPDATE public.products SET name='S3_ATACANTE_D' WHERE id='a3e20000-0000-0000-0000-00000000d001'::uuid;
SELECT test_assert((SELECT name FROM public.products WHERE id='a3e20000-0000-0000-0000-00000000d001'::uuid)='S3_PROD_A_v2',
  'T2.2-d: usuario sin membresía en la tienda NO debe poder actualizar (0 filas mutadas)');

RESET ROLE;

-- ── Caso (c): admin global del tenant actualiza según la regla vigente ─────
-- products_tenant_update: USING = tenant_id = current_user_tenant_id() AND
--   (is_admin() OR store_id ∈ current_user_store_ids()).
-- El admin-c01 tiene tenant A y es is_admin() → puede actualizar prod A.
SET LOCAL "request.jwt.claims" = '{"sub": "a3e20000-0000-0000-0000-000000000c01", "role": "authenticated"}';
SET ROLE authenticated;

UPDATE public.products SET name='S3_PROD_A_v3' WHERE id='a3e20000-0000-0000-0000-00000000d001'::uuid;
SELECT test_assert((SELECT name FROM public.products WHERE id='a3e20000-0000-0000-0000-00000000d001'::uuid)='S3_PROD_A_v3',
  'T2.2-c: admin global del tenant DEBE poder actualizar (regla vigente is_admin())');

-- Y NO puede actualizar el producto del tenant B (admin de OTRO tenant):
UPDATE public.products SET name='S3_ATACANTE_C' WHERE id='a3e20000-0000-0000-0000-00000000d002'::uuid;
SELECT test_assert((SELECT name FROM public.products WHERE id='a3e20000-0000-0000-0000-00000000d002'::uuid)='S3_PROD_B',
  'T2.2-c2: admin del tenant A NO debe poder actualizar producto del tenant B (0 filas mutadas)');

RESET ROLE;

ROLLBACK;
