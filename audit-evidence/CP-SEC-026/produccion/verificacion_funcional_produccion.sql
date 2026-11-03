-- ============================================================================
-- CP-SEC-026 — VERIFICACIÓN FUNCIONAL EN PRODUCCIÓN (compuerta T1, paso 4)
-- ============================================================================
-- Adaptación de supabase/tests/membership_audit_test.sql para CostproBD
-- (producción, wthkddeleylijmonclxg), ejecutada con autorización expresa del
-- propietario en la sesión del 2026-11-04 ("si falta alguna autorización yo
-- lo autorizo... cierra el ciclo").
--
-- Diferencias respecto de la suite original:
--   · Idéntica de T1.2-a a T1.2-j (mismos UUIDs de fixture, mismas aserciones).
--   · T1.2-k NO es ejecutable en producción: usa e2e_hard_delete_user, función
--     EXCLUSIVA de CostproE2E (así lo declara la cabecera de la suite original:
--     "exclusiva CostproE2E"). Su verificación permanece cubierta en CostproE2E.
--   · Transacción única con ROLLBACK final: no deja ningún dato en producción.
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

UPDATE public.profiles SET role = 'admin', tenant_id = 'c026aaa1-0000-0000-0000-0000000000aa'
WHERE id = 'c026aaa1-0000-0000-0000-000000000a01'::uuid;
UPDATE public.profiles SET role = 'clerk', tenant_id = 'c026aaa1-0000-0000-0000-0000000000aa'
WHERE id IN ('c026aaa1-0000-0000-0000-000000000b01'::uuid, 'c026aaa1-0000-0000-0000-000000000c01'::uuid);

CREATE OR REPLACE FUNCTION t026_events(p_mid uuid, p_action text) RETURNS bigint AS $t026_events$
  SELECT count(*)::bigint FROM public.audit_logs
  WHERE table_name = 'user_store_memberships' AND record_id = p_mid AND action = p_action
$t026_events$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION t026_meta(p_mid uuid, p_action text) RETURNS jsonb AS $t026_meta$
  SELECT metadata FROM public.audit_logs
  WHERE table_name = 'user_store_memberships' AND record_id = p_mid AND action = p_action
  ORDER BY created_at DESC LIMIT 1
$t026_meta$ LANGUAGE sql;

-- ── T1.2-a: INSERT → 1 evento membership_grant ─────────────────────────────
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

-- ── RESUMEN (antes del ROLLBACK): eventos generados por la suite ──────────
SELECT action, count(*)::int AS eventos
FROM public.audit_logs
WHERE table_name = 'user_store_memberships'
  AND metadata->>'source' = 'cp_sec_026_trigger'
GROUP BY action ORDER BY action;

ROLLBACK;
