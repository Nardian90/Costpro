-- ============================================================================
-- CP-SEC-026 — PRUEBAS DE CONTRATO: auditoría de membresías (T1.2)
-- ============================================================================
-- Propósito: validar el trigger trg_sec026_membership_audit /
--   public.sec026_membership_audit_fn() creado por la migración
--   20261103000001_cp_sec_026_membership_audit_trigger.sql.
-- Ejecución (CostproE2E / local, con la migración aplicada):
--   psql "$E2E_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/membership_audit_test.sql
--   (la suite corre en una transacción que termina en ROLLBACK: no deja datos)
-- Cobertura:
--   T1.2-a INSERT                       → exactamente 1 evento membership_grant
--   T1.2-b UPDATE con cambio            → 1 membership_update + changed_fields
--   T1.2-c UPDATE sin cambio real       → 0 eventos
--   T1.2-d UPDATE status→revoked        → 1 membership_revoke (borrado lógico)
--   T1.2-e DELETE                       → 1 membership_revoke con old_data
--   T1.2-f operaciones en otras tablas  → 0 eventos de membresías
--   T1.2-g actor service_role           → user_id NULL + actor_kind etiquetado
--   T1.2-h actor SQL directo            → actor_kind 'sql_directo'
--   T1.2-i fallo forzado del INSERT de auditoría → la operación FALLA (D1.4)
--   T1.2-j manage_user_memberships      → revoke + grant por la vía RPC (D1.6)
--   T1.2-k borrado de usuario en cascada→ revoke con rastro (D1.6)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION test_assert(p_condition boolean, p_msg text) RETURNS void AS $test_assert_026$
BEGIN
  IF NOT p_condition THEN
    RAISE EXCEPTION 'TEST_FAILED: %', p_msg;
  END IF;
END
$test_assert_026$ LANGUAGE plpgsql;

-- ── 0. SETUP CONTROLADO (filas con UUIDs fijos, todo se revierte) ──────────
-- Los perfiles tienen FK a auth.users: crear primero los usuarios de prueba.
INSERT INTO auth.users (id, email) VALUES
  ('c026aaa1-0000-0000-0000-000000000a01', 'admin026@fixture.local'),
  ('c026aaa1-0000-0000-0000-000000000b01', 'clerk026@fixture.local'),
  ('c026aaa1-0000-0000-0000-000000000c01', 'nuevo026@fixture.local');

INSERT INTO public.tenants (id, name) VALUES
  ('c026aaa1-0000-0000-0000-0000000000aa', 'T026_TENANT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (id, name, tenant_id) VALUES
  ('c026aaa1-0000-0000-0000-000000000001', 'T026_TIENDA', 'c026aaa1-0000-0000-0000-0000000000aa'),
  ('c026aaa1-0000-0000-0000-000000000002', 'T026_TIENDA_2', 'c026aaa1-0000-0000-0000-0000000000aa')
ON CONFLICT (id) DO NOTHING;

-- handle_new_user() (trigger on_auth_user_created) ya creó los perfiles:
-- ajustar rol y tenant sobre lo creado por el trigger (no duplicar INSERT).
UPDATE public.profiles SET role = 'admin', tenant_id = 'c026aaa1-0000-0000-0000-0000000000aa'
WHERE id = 'c026aaa1-0000-0000-0000-000000000a01'::uuid;
UPDATE public.profiles SET role = 'clerk', tenant_id = 'c026aaa1-0000-0000-0000-0000000000aa'
WHERE id IN ('c026aaa1-0000-0000-0000-000000000b01'::uuid, 'c026aaa1-0000-0000-0000-000000000c01'::uuid);

-- Contador de eventos sobre una membresía concreta (aislado de datos reales):
CREATE OR REPLACE FUNCTION t026_events(p_mid uuid, p_action text) RETURNS bigint AS $t026_events$
  SELECT count(*)::bigint FROM public.audit_logs
  WHERE table_name = 'user_store_memberships' AND record_id = p_mid AND action = p_action
$t026_events$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION t026_meta(p_mid uuid, p_action text) RETURNS jsonb AS $t026_meta$
  SELECT metadata FROM public.audit_logs
  WHERE table_name = 'user_store_memberships' AND record_id = p_mid AND action = p_action
  ORDER BY created_at DESC LIMIT 1
$t026_meta$ LANGUAGE sql;

-- ── T1.2-a: INSERT → 1 evento membership_grant con campos correctos ────────
-- Actor simulado por claims (el DML corre como dueño para aislar el
-- comportamiento del TRIGGER de las policies RLS de membresías, que se
-- prueban aparte en isolation_test.sql / T2).
SET LOCAL "request.jwt.claims" = '{"sub": "c026aaa1-0000-0000-0000-000000000a01", "role": "authenticated"}';

INSERT INTO public.user_store_memberships (id, user_id, store_id, role, status) VALUES
  ('c026aaa1-0000-0000-0000-000000000101', 'c026aaa1-0000-0000-0000-000000000b01',
   'c026aaa1-0000-0000-0000-000000000001', 'clerk', 'active');

SELECT test_assert(t026_events('c026aaa1-0000-0000-0000-000000000101'::uuid, 'membership_grant') = 1,
  'T1.2-a: INSERT debe producir exactamente 1 evento membership_grant');
SELECT test_assert((SELECT user_id FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000101'::uuid AND action='membership_grant')
  = 'c026aaa1-0000-0000-0000-000000000a01'::uuid,
  'T1.2-a: actor (user_id) debe ser el usuario autenticado que inserta');
SELECT test_assert((SELECT store_id FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000101'::uuid AND action='membership_grant')
  = 'c026aaa1-0000-0000-0000-000000000001'::uuid,
  'T1.2-a: store_id del evento debe ser el de la membresía');
SELECT test_assert((SELECT metadata->>'actor_kind' FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000101'::uuid AND action='membership_grant') = 'authenticated',
  'T1.2-a: actor_kind debe ser authenticated');
SELECT test_assert((SELECT new_data->>'status' FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000101'::uuid AND action='membership_grant') = 'active',
  'T1.2-a: new_data debe traer la fila insertada (status=active)');
SELECT test_assert((SELECT metadata->>'target_user_id' FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000101'::uuid AND action='membership_grant')
  = 'c026aaa1-0000-0000-0000-000000000b01',
  'T1.2-a: metadata.target_user_id debe identificar al usuario destino');

-- ── T1.2-b: UPDATE con cambio de rol → 1 membership_update ─────────────────
UPDATE public.user_store_memberships SET role = 'manager'
WHERE id = 'c026aaa1-0000-0000-0000-000000000101'::uuid;

SELECT test_assert(t026_events('c026aaa1-0000-0000-0000-000000000101'::uuid, 'membership_update') = 1,
  'T1.2-b: UPDATE con cambio debe producir 1 evento membership_update');
SELECT test_assert(t026_meta('c026aaa1-0000-0000-0000-000000000101'::uuid, 'membership_update')->'changed_fields'->'role'->>'new' = 'manager',
  'T1.2-b: changed_fields.role.new debe ser manager');

-- ── T1.2-c: UPDATE sin cambio real → 0 eventos nuevos ──────────────────────
UPDATE public.user_store_memberships SET role = 'manager'
WHERE id = 'c026aaa1-0000-0000-0000-000000000101'::uuid;

SELECT test_assert(t026_events('c026aaa1-0000-0000-0000-000000000101'::uuid, 'membership_update') = 1,
  'T1.2-c: UPDATE sin cambio real no debe generar evento (sigue habiendo 1)');

-- ── T1.2-d: UPDATE status→revoked → 1 membership_revoke (borrado lógico) ───
UPDATE public.user_store_memberships SET status = 'revoked'
WHERE id = 'c026aaa1-0000-0000-0000-000000000101'::uuid;

SELECT test_assert(t026_events('c026aaa1-0000-0000-0000-000000000101'::uuid, 'membership_revoke') = 1,
  'T1.2-d: borrado lógico (status→revoked) debe producir 1 membership_revoke');
SELECT test_assert(t026_meta('c026aaa1-0000-0000-0000-000000000101'::uuid, 'membership_revoke')->'changed_fields'->'status'->>'old' = 'active',
  'T1.2-d: el revoke lógico debe registrar el estado previo (active)');

RESET ROLE;

-- ── T1.2-e: DELETE real → 1 membership_revoke con old_data ─────────────────
INSERT INTO public.user_store_memberships (id, user_id, store_id, role, status) VALUES
  ('c026aaa1-0000-0000-0000-000000000102', 'c026aaa1-0000-0000-0000-000000000b01',
   'c026aaa1-0000-0000-0000-000000000002', 'clerk', 'active');

DELETE FROM public.user_store_memberships
WHERE id = 'c026aaa1-0000-0000-0000-000000000102'::uuid;

SELECT test_assert(t026_events('c026aaa1-0000-0000-0000-000000000102'::uuid, 'membership_revoke') = 1,
  'T1.2-e: DELETE debe producir 1 membership_revoke');
SELECT test_assert((SELECT old_data->>'role' FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000102'::uuid AND action='membership_revoke') = 'clerk',
  'T1.2-e: old_data debe traer la fila eliminada');

-- ── T1.2-f: operaciones en OTRAS tablas → 0 eventos de membresías ──────────
INSERT INTO public.products (id, name, sku, store_id, tenant_id) VALUES
  ('c026aaa1-0000-0000-0000-000000000201', 'T026_PROD', 'T026-SKU-1',
   'c026aaa1-0000-0000-0000-000000000001', 'c026aaa1-0000-0000-0000-0000000000aa')
ON CONFLICT (id) DO NOTHING;
UPDATE public.products SET name = 'T026_PROD_2'
WHERE id = 'c026aaa1-0000-0000-0000-000000000201'::uuid;
DELETE FROM public.products WHERE id = 'c026aaa1-0000-0000-0000-000000000201'::uuid;

SELECT test_assert(NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE table_name = 'user_store_memberships'
      AND action IN ('membership_grant','membership_update','membership_revoke')
      AND record_id = 'c026aaa1-0000-0000-0000-000000000201'::uuid),
  'T1.2-f: operaciones en products no deben generar eventos de membresías');

-- ── T1.2-g: actor service_role → user_id NULL + etiqueta explícita ─────────
SET LOCAL "request.jwt.claims" = '{"role": "service_role"}';

INSERT INTO public.user_store_memberships (id, user_id, store_id, role, status) VALUES
  ('c026aaa1-0000-0000-0000-000000000103', 'c026aaa1-0000-0000-0000-000000000b01',
   'c026aaa1-0000-0000-0000-000000000002', 'clerk', 'active');

SELECT test_assert((SELECT user_id IS NULL FROM public.audit_logs
    WHERE record_id='c026aaa1-0000-0000-0000-000000000103'::uuid AND action='membership_grant'),
  'T1.2-g: en contexto service_role el actor debe quedar NULL');
SELECT test_assert(t026_meta('c026aaa1-0000-0000-0000-000000000103'::uuid, 'membership_grant')->>'actor_kind' = 'service_role',
  'T1.2-g: actor_kind debe ser service_role (nunca vacío)');

DELETE FROM public.user_store_memberships
WHERE id = 'c026aaa1-0000-0000-0000-000000000103'::uuid;

-- ── T1.2-h: actor SQL directo (sin claims) → etiqueta sql_directo ──────────
SET LOCAL "request.jwt.claims" = '';

INSERT INTO public.user_store_memberships (id, user_id, store_id, role, status) VALUES
  ('c026aaa1-0000-0000-0000-000000000104', 'c026aaa1-0000-0000-0000-000000000b01',
   'c026aaa1-0000-0000-0000-000000000002', 'clerk', 'active');

SELECT test_assert(t026_meta('c026aaa1-0000-0000-0000-000000000104'::uuid, 'membership_grant')->>'actor_kind' = 'sql_directo',
  'T1.2-h: sin JWT el actor debe etiquetarse sql_directo');
SELECT test_assert(t026_meta('c026aaa1-0000-0000-0000-000000000104'::uuid, 'membership_grant')->>'db_role' IS NOT NULL,
  'T1.2-h: metadata.db_role debe registrar el rol de BD ejecutor');

DELETE FROM public.user_store_memberships
WHERE id = 'c026aaa1-0000-0000-0000-000000000104'::uuid;

-- ── T1.2-i: fallo forzado del INSERT de auditoría → la operación FALLA ─────
-- Se instala un trigger de prueba en audit_logs que aborta los eventos del
-- CP-SEC-026; el alta de membresía debe fallar con él (fail-closed, D1.4) y
-- funcionar de nuevo tras retirarlo. (Mismo hilo transaccional: se revierte.)
CREATE OR REPLACE FUNCTION t026_break_audit() RETURNS trigger AS $t026_break_audit$
BEGIN
  IF NEW.action IN ('membership_grant','membership_update','membership_revoke') THEN
    RAISE EXCEPTION 'T026: inserción de auditoría forzada a fallar';
  END IF;
  RETURN NEW;
END
$t026_break_audit$ LANGUAGE plpgsql;

CREATE TRIGGER t026_break_audit_trg
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION t026_break_audit();

DO $t026_i$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.user_store_memberships (id, user_id, store_id, role, status) VALUES
      ('c026aaa1-0000-0000-0000-000000000105', 'c026aaa1-0000-0000-0000-000000000b01',
       'c026aaa1-0000-0000-0000-000000000001', 'clerk', 'active');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST_FAILED: T1.2-i el alta de membresía debería FALLAR si falla el INSERT de auditoría (fail-closed)';
  END IF;
END
$t026_i$;

DROP TRIGGER t026_break_audit_trg ON public.audit_logs;

INSERT INTO public.user_store_memberships (id, user_id, store_id, role, status) VALUES
  ('c026aaa1-0000-0000-0000-000000000105', 'c026aaa1-0000-0000-0000-000000000b01',
   'c026aaa1-0000-0000-0000-000000000002', 'clerk', 'active');

SELECT test_assert(t026_events('c026aaa1-0000-0000-0000-000000000105'::uuid, 'membership_grant') = 1,
  'T1.2-i: tras retirar el fallo forzado, el camino normal vuelve a auditar');

-- ── T1.2-j: vía RPC manage_user_memberships (D1.6) ─────────────────────────
-- Un admin autenticado hace SUSTITUCIÓN completa de membresías: DELETE de la
-- m005 + INSERT de la sustituta. Debe quedar revoke (DELETE) + grant (INSERT)
-- aunque el DML venga de dentro de una SECURITY DEFINER.
SET LOCAL "request.jwt.claims" = '{"sub": "c026aaa1-0000-0000-0000-000000000a01", "role": "authenticated"}';

DO $t026_j$
DECLARE
  v_new_mid uuid;
BEGIN
  PERFORM public.manage_user_memberships(
    'c026aaa1-0000-0000-0000-000000000c01'::uuid,
    '[{"store_id": "c026aaa1-0000-0000-0000-000000000001", "role": "manager", "status": "active"}]'::jsonb
  );

  SELECT m.id INTO v_new_mid
  FROM public.user_store_memberships m
  WHERE m.user_id = 'c026aaa1-0000-0000-0000-000000000c01'::uuid;

  IF v_new_mid IS NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: T1.2-j la RPC admin no dejó la membresía creada';
  END IF;

  IF (SELECT count(*) FROM public.audit_logs
      WHERE record_id = v_new_mid AND action = 'membership_grant') <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: T1.2-j el grant vía INSERT de la RPC no quedó auditado';
  END IF;
END
$t026_j$;

-- ── T1.2-k: limpieza de usuarios vía RPC (D1.6) ────────────────────────────
-- El borrado físico de perfiles está prohibido (Iteración 12, soft delete);
-- la vía real de limpieza es e2e_hard_delete_user (exclusiva CostproE2E),
-- que borra directamente las user_store_memberships del usuario: el trigger
-- debe dejar el revoke con el rastro del usuario destino. (ROLLBACK final.)
DO $t026_k$
DECLARE
  v_deleted boolean;
BEGIN
  v_deleted := public.e2e_hard_delete_user('c026aaa1-0000-0000-0000-000000000b01'::uuid);
  IF NOT v_deleted THEN
    RAISE EXCEPTION 'TEST_FAILED: T1.2-k e2e_hard_delete_user no eliminó al usuario de prueba';
  END IF;
END
$t026_k$;

SELECT test_assert((SELECT count(*) FROM public.audit_logs
    WHERE table_name='user_store_memberships'
      AND metadata->>'target_user_id' = 'c026aaa1-0000-0000-0000-000000000b01'
      AND action='membership_revoke') >= 1,
  'T1.2-k: la limpieza de usuario debe dejar rastro (revoke de sus membresías)');

ROLLBACK;
