-- ═══════════════════════════════════════════════════════════════════════════════
-- 04_valid_fixtures.sql — Datos mínimos + las 10 PRUEBAS POSITIVAS del pliego.
-- Cada función de especificación fuerza SET CONSTRAINTS ... IMMEDIATE antes de
-- retornar, de modo que cada paso valida su estado FINAL dentro de la transacción
-- de la sentencia. Nada de este archivo debe fallar.
-- ═══════════════════════════════════════════════════════════════════════════════

\set S1 10000000-0000-0000-0000-000000000001
\set S2 10000000-0000-0000-0000-000000000002
\set U_M 20000000-0000-0000-0000-000000000001
\set U_K 20000000-0000-0000-0000-000000000002
\set U_X 20000000-0000-0000-0000-000000000003
\set U_L 20000000-0000-0000-0000-000000000004
\set U_J 20000000-0000-0000-0000-000000000005
\set U_N 20000000-0000-0000-0000-000000000006
\set U_T2 20000000-0000-0000-0000-000000000007
\set G1 30000000-0000-0000-0000-000000000001
\set G2 30000000-0000-0000-0000-000000000002
\set G3 30000000-0000-0000-0000-000000000003
\set C1 40000000-0000-0000-0000-000000000001
\set C2 40000000-0000-0000-0000-000000000002
\set SS_G1 50000000-0000-0000-0000-000000000001
\set SS_G2 50000000-0000-0000-0000-000000000002
\set SS_G3 50000000-0000-0000-0000-000000000003
\set SS_G2C 50000000-0000-0000-0000-000000000004
\set SS_G2L 50000000-0000-0000-0000-000000000005
-- Roles de los fixtures: U_M encargado (solicita/autoriza/asigna), U_K cajero entrega G1,
-- U_X cajero en G2, U_L cajera recibe, U_J transportista, U_N encargado de S2.
-- Sesiones: SS_G1/SS_G2/SS_G3 abiertas hace 2 h; SS_G2C cerrada hace 1 h (para N15).
-- D.24.2: cada RPC se llama con la identidad autenticada fijada EN la misma
-- sentencia (set_config local: request.jwt.claim.sub = el actor que actúa).
-- auth.uid() la lee; un parámetro distinto de esa identidad es rechazado.

INSERT INTO stores(id, name, multicashier_enabled_at) VALUES
  (:'S1', 'Tienda Centro', now() - interval '1 year'),   -- ámbito multicaja activo
  (:'S2', 'Tienda Norte',  now() - interval '1 year');

INSERT INTO profiles(id, store_id, role) VALUES
  (:'U_M', :'S1', 'encargado'),
  (:'U_K', :'S1', 'cajero'),
  (:'U_X', :'S1', 'cajero'),
  (:'U_L', :'S1', 'cajera'),
  (:'U_J', :'S1', 'transportista'),
  (:'U_N', :'S2', 'encargado'),
  (:'U_T2', :'S2', 'transportista');   -- D.23.3: transportista de OTRA tienda (A-N5)

INSERT INTO cash_registers(id, store_id, code) VALUES
  (:'G1', :'S1', 'G1'), (:'G2', :'S1', 'G2'), (:'G3', :'S2', 'G3');

INSERT INTO cash_accounts(id, store_id, kind) VALUES
  (:'C1', :'S1', 'treasury'), (:'C2', :'S2', 'treasury');

INSERT INTO cash_closures(id, cash_register_id, store_id, user_id, opened_at, closed_at) VALUES
  (:'SS_G1',  :'G1', :'S1', :'U_K', now() - interval '2 hours', NULL),
  (:'SS_G2',  :'G2', :'S1', :'U_X', now() - interval '2 hours', NULL),
  (:'SS_G3',  :'G3', :'S2', :'U_N', now() - interval '2 hours', NULL),
  (:'SS_G2C', :'G2', :'S1', :'U_X', now() - interval '5 hours', now() - interval '1 hour'),
  (:'SS_G2L', :'G2', :'S1', :'U_L', now() - interval '2 hours', NULL);

-- Semilla del SALDO de tesorería (misión 009, D.22.3): movimientos 'cobro'
-- reales del ledger (sale/in/cash con titular cuenta) que alimentan la vista de
-- clasificación (D.18.2/D.19.2) y el control de saldo (D.20.3):
-- C1 abre con 10000 CUP y 100 USD (exchange_rate 120) — monedas separadas.
-- D.24.1: las filas 'sale' usan la transacción comercial REAL (FK RESTRICT +
-- sale_ref_check: ref_id = transaction_id) y amount_cup la GENERA PostgreSQL.
INSERT INTO transactions(id, store_id, total_amount)
VALUES ('65000000-0000-0000-0000-000000000001', :'S1', 99999);
INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
         currency, exchange_rate, ref_type, ref_id, cash_account_id, paid_by,
         transaction_id)
VALUES
  ('60000000-0000-0000-0000-000000000001', :'S1', 'in', 'cash', 10000, 'CUP', 1,
   'sale', '65000000-0000-0000-0000-000000000001', :'C1', :'U_M',
   '65000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', :'S1', 'in', 'cash', 100, 'USD', 120,
   'sale', '65000000-0000-0000-0000-000000000001', :'C1', :'U_M',
   '65000000-0000-0000-0000-000000000001');

\echo '══ P1: solicitar transferencia gaveta→gaveta (2000 CUP, G1→G2, encargado M autenticado)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         2000, 'CUP', :'U_M', :'U_M', 'idem-T1') AS t1;

\echo '══ P2: entregar DESDE GAVETA (cajero K AUTENTICADO entrega; caso B: J es el transportista ASIGNADO)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_assign_carrier(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_J', :'U_M') AS asignacion_previa_t1;      -- D.24.4 caso B exige asignación
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_K', :'SS_G1', :'U_J') AS leg_out;

\echo '══ P3: transferencia tesorería→gaveta y entrega DESDE TESORERÍA (sin sesión emisora)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', NULL, :'C1', :'G2', NULL,
         5000, 'CUP', :'U_M', :'U_M', 'idem-T2') AS t2;
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2'),
         :'U_K', NULL, NULL) AS leg_out_t2;

\echo '══ P4: recibir EN SESIÓN (cajera L AUTENTICADA en sesión SS_G2 de la gaveta destino G2)'
SELECT set_config('request.jwt.claim.sub', :'U_L', true) AS auth_uid,
       f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2'),
         :'U_L', :'SS_G2L', NULL) AS leg_in;

\echo '══ P5: gaveta→tesorería y recibir EN CUENTA (cuenta receptora C1 exacta del destino)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, NULL, :'C1',
         900, 'CUP', :'U_M', :'U_M', 'idem-T2b') AS t2b;
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2b'),
         :'U_K', :'SS_G1', NULL) AS leg_out_t2b;
SELECT set_config('request.jwt.claim.sub', :'U_L', true) AS auth_uid,
       f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2b'),
         :'U_L', NULL, :'C1') AS leg_in_t2b;

\echo '══ P6: solicitar devolución DESDE entregada (esc. E: rechazo antes de recibir; sin pierna nueva)'
SELECT set_config('request.jwt.claim.sub', :'U_L', true) AS auth_uid,
       f_request_return_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_L', 'el dinero no fue esperado');

\echo '══ P7: devolver al ORIGEN (sesión SS_G1 de la gaveta de origen G1)'
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_return_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_K', :'SS_G1', NULL) AS leg_in_retorno;

\echo '══ P8: cancelar antes de entregar (sin piernas)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         300, 'CUP', :'U_M', :'U_M', 'idem-T3') AS t3;
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_cancel_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T3'),
         :'U_M', 'se solicitó por error');

\echo '══ P9: reintento idempotente de SOLICITUD (misma clave ⇒ mismo id, sin duplicar)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, NULL, :'C1',
         900, 'CUP', :'U_M', :'U_M', 'idem-T2b') AS reintento_solicitud_mismo_id;

\echo '══ P10: eventos de custodia sucesivos (entrega J→reasignación M→recepción L)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         750, 'CUP', :'U_M', :'U_M', 'idem-T4') AS t4;
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_assign_carrier(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_J', :'U_M') AS asignacion_previa_t4;      -- D.24.4 caso B
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_K', :'SS_G1', :'U_J') AS leg_t4;
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_create_custody_event(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_J', :'U_M', :'U_M', :'U_M', 'reasignación de custodia (escenario D)') AS ev_reasignacion;
SELECT set_config('request.jwt.claim.sub', :'U_L', true) AS auth_uid,
       f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_L', :'SS_G2L', NULL) AS leg_in_t4;

\echo '══ P+ (vigencia histórica): recibir y DESPUÉS cerrar la sesión receptora ⇒ sigue siendo válida'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         450, 'CUP', :'U_M', :'U_M', 'idem-T5') AS t5;
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T5'),
         :'U_K', :'SS_G1', NULL) AS leg_t5;
SELECT set_config('request.jwt.claim.sub', :'U_L', true) AS auth_uid,
       f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T5'),
         :'U_L', :'SS_G2L', NULL) AS leg_in_t5;
UPDATE cash_closures SET closed_at = now() WHERE id = :'SS_G2L';   -- se cierra DESPUÉS de recibir
SELECT fn_reconcile_transfer_final(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T5')) AS vigencia_historica_ok;

\echo '══ P+ (orden de escrituras al revés dentro de UNA transacción): no hay bloqueo permanente'
-- El orden inverso (estado antes de pierna) se rechaza de inmediato por FK/CHECK,
-- la transacción revierte ÍNTEGRA y el orden correcto se completa después:
DO $$
DECLARE v_t uuid; v_leg uuid; v_k uuid; v_s uuid; v_estado text; v_piernas int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           600, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-T6') INTO v_t;
  BEGIN
    v_leg := gen_random_uuid();
    UPDATE cash_transfers                                   -- 1º el estado, sin pierna:
       SET status='entregada', leg_out_payment_id=v_leg,
           delivered_by='20000000-0000-0000-0000-000000000002'
     WHERE id=v_t;
    RAISE EXCEPTION 'NO_RECHAZADA: estado sin pierna debió rechazarse';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK orden inverso rechazado de inmediato: %', SQLERRM;
  END;
  SELECT status INTO v_estado FROM cash_transfers WHERE id=v_t;
  SELECT count(*) INTO v_piernas FROM payment_transactions
   WHERE ref_type='cash_transfer' AND ref_id=v_t;
  IF v_estado <> 'solicitada' OR v_piernas <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO: T6 quedó % con % piernas', v_estado, v_piernas;
  END IF;
  RAISE NOTICE 'OK rollback íntegro: T6 sigue solicitada con 0 piernas';
END $$;
-- El orden CORRECTO completa sin bloqueo permanente:
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T6'),
         :'U_K', :'SS_G1', NULL) AS orden_correcto_ok;

\echo '══ P9b: reintento idempotente de ENTREGA (ya entregada ⇒ misma pierna, sin duplicar)'
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T6'),
         :'U_K', :'SS_G1', NULL) AS reintento_entrega_misma_pierna;

\echo '══ P11 (misión 009): saldo de tesorería — consumo real y saldo EXACTO permitido'
-- Tras P3 (−5000) y P5 (+900 en cuenta): saldo C1 CUP = 10000 − 5000 + 900 = 5900.
-- Saldo suficiente: f_check sin excepción; y una transferencia del importe EXACTO pasa:
SELECT f_check_treasury_saldo(:'C1', :'S1', 'CUP', 5900) AS saldo_5900_ok;
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', NULL, :'C1', :'G2', NULL,
         5900, 'CUP', :'U_M', :'U_M', 'idem-T7') AS t7;
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T7'),
         :'U_K', NULL, NULL) AS leg_out_t7;              -- descuenta EXACTO: saldo queda 0
DO $$
BEGIN
  PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
           '10000000-0000-0000-0000-000000000001', 'CUP', 0);   -- saldo 0: pasa (>=0)
  RAISE NOTICE 'OK P11: saldo exacto consumido, C1 CUP queda en 0';
END $$;

\echo '══ P12 (misión 009): separación de monedas — USD opera aparte del CUP'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', NULL, :'C1', :'G2', NULL,
         100, 'USD', :'U_M', :'U_M', 'idem-T7b', 120) AS t7b;   -- PT004: tasa >1
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T7b'),
         :'U_K', NULL, NULL) AS leg_out_t7b;             -- USD 100 disponible: OK
DO $$
BEGIN
  BEGIN
    PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001', 'USD', 0.01);  -- USD agotado
    RAISE EXCEPTION 'NO_RECHAZADA: USD debió estar en 0';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_SALDO_INSUFICIENTE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK P12: USD separado y agotado (%), CUP no afectado', SQLERRM;
  END;
  PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
           '10000000-0000-0000-0000-000000000001', 'CUP', 0);   -- CUP sigue en 0, no mezclado
  RAISE NOTICE 'OK P12: CUP/USD mantienen ámbitos separados';
END $$;

\echo '══ P13/A-P1 (misión 010, D.23.3): ENTREGA por transportista ASIGNADO Y AUTORIZADO'
-- El actor operativo (J) difiere del titular de la sesión emisora (K): permitido
-- SOLO porque existe una asignación previa autorizada por M (no autoasignación),
-- con rol transportista y de la tienda del traspaso (f_assign_carrier).
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         750, 'CUP', :'U_M', :'U_M', 'idem-T8') AS t8;
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_assign_carrier(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T8'),
         :'U_J', :'U_M') AS asignacion_transportista;   -- A-P1/A-P4: autorización previa por encargado
SELECT set_config('request.jwt.claim.sub', :'U_J', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T8'),
         :'U_J', :'SS_G1', :'U_J') AS leg_out_t8_actor_transportista;  -- caso C
SELECT set_config('request.jwt.claim.sub', :'U_X', true) AS auth_uid,
       f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T8'),
         :'U_X', :'SS_G2', NULL) AS leg_in_t8;           -- X AUTENTICADO es titular de SS_G2 ✓ (A-P2)
DO $$
DECLARE v_t8 uuid;
BEGIN
  v_t8 := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T8');
  IF (SELECT new_custodian_user_id FROM cash_transfer_custody_events
       WHERE transfer_id=v_t8 AND event_seq=1)
     <> '20000000-0000-0000-0000-000000000005'::uuid THEN
    RAISE EXCEPTION 'A-P3 FALLO: el custodio inicial no es el transportista asignado J';
  END IF;
  IF (SELECT delivered_by FROM cash_transfers WHERE id=v_t8)
     <> '20000000-0000-0000-0000-000000000005'::uuid THEN
    RAISE EXCEPTION 'A-P3 FALLO: delivered_by no registra al actor operativo J';
  END IF;
  RAISE NOTICE 'OK A-P3: custodia inicial = poseedor físico real (J) y actor auditado separado';
END $$;

\echo '══ A-P8: titular AUTENTICADO entrega a un transportista correctamente ASIGNADO (caso B)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         640, 'CUP', :'U_M', :'U_M', 'idem-T9') AS t9;
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_assign_carrier(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T9'),
         :'U_J', :'U_M') AS asignacion_t9;
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T9'),
         :'U_K', :'SS_G1', :'U_J') AS leg_out_t9;      -- K (titular) entrega; custodio inicial = J

\echo '══ A-P9/A-P6: titular AUTENTICADO entrega y CONSERVA el efectivo (caso A, p_carrier NULL)'
SELECT set_config('request.jwt.claim.sub', :'U_M', true) AS auth_uid,
       f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         620, 'CUP', :'U_M', :'U_M', 'idem-T10') AS t10;
SELECT set_config('request.jwt.claim.sub', :'U_K', true) AS auth_uid,
       f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T10'),
         :'U_K', :'SS_G1', NULL) AS leg_out_t10;       -- custodio inicial = el propio titular

\echo '══ A-P4/A-P5/A-P7/A-P11: auditoría de asignación y custodia en los tres casos'
DO $$
DECLARE v_t1 uuid; v_t8 uuid; v_t9 uuid; v_t10 uuid; v_ev int; v_ok int;
BEGIN
  v_t1  := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
  v_t8  := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T8');
  v_t9  := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T9');
  v_t10 := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T10');
  -- A-P4: la asignación conserva autorizador y transportista (assigned_by=authorized_by=M,
  -- misma acción de firma; CHECK ctr_carrier_no_self impide autoservicio)
  SELECT count(*) INTO v_ok FROM cash_transfer_carriers
   WHERE transfer_id IN (v_t1, v_t8, v_t9)
     AND carrier_user_id = '20000000-0000-0000-0000-000000000005'::uuid
     AND assigned_by = '20000000-0000-0000-0000-000000000001'::uuid
     AND authorized_by = '20000000-0000-0000-0000-000000000001'::uuid
     AND assigned_by <> carrier_user_id;
  IF v_ok <> 3 THEN RAISE EXCEPTION 'A-P4 FALLO: % asignaciones registradas (esperado 3)', v_ok; END IF;
  RAISE NOTICE 'OK A-P4: autorizador (encargado M) y transportista quedan registrados en las 3 asignaciones';
  -- A-P5/A-P10: el transportista asignado ejecutó el caso C (T8)
  IF (SELECT delivered_by FROM cash_transfers WHERE id=v_t8)
     <> '20000000-0000-0000-0000-000000000005'::uuid
     OR (SELECT carrier_user_id FROM cash_transfers WHERE id=v_t8)
     <> '20000000-0000-0000-0000-000000000005'::uuid THEN
    RAISE EXCEPTION 'A-P5 FALLO: el ejecutor/transportista de T8 no es el asignado J';
  END IF;
  RAISE NOTICE 'OK A-P5: el transportista asignado ejecutó la entrega (caso C) y quedó identificado';
  -- A-P6/A-P9: titular entrega sin transportista (T10): carrier_user_id NULL
  IF (SELECT carrier_user_id FROM cash_transfers WHERE id=v_t10) IS NOT NULL
     OR (SELECT delivered_by FROM cash_transfers WHERE id=v_t10)
     <> '20000000-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'A-P6 FALLO: el titular debía conservar el efectivo (carrier NULL)';
  END IF;
  RAISE NOTICE 'OK A-P6: titular legítimo entregó sin transportista externo (carrier NULL)';
  -- A-P7: auditoría separada de actor autenticado, titular, autorizador y transportista
  SELECT count(*) INTO v_ok FROM cash_transfers
   WHERE id IN (v_t1, v_t8, v_t9)
     AND delivered_by IS NOT NULL AND authorized_by = '20000000-0000-0000-0000-000000000001'::uuid
     AND carrier_user_id = '20000000-0000-0000-0000-000000000005'::uuid;
  IF v_ok <> 3 THEN RAISE EXCEPTION 'A-P7 FALLO: auditoría incompleta en % filas', v_ok; END IF;
  RAISE NOTICE 'OK A-P7: auditoría conserva actor, titular, autorizador y transportista';
  -- A-P11: custodia inicial = poseedor físico real en TODOS los escenarios válidos
  SELECT count(*) INTO v_ev FROM cash_transfer_custody_events e
   JOIN cash_transfers t ON t.id = e.transfer_id
   WHERE e.event_seq = 1
     AND e.transfer_id IN (v_t1, v_t8, v_t9, v_t10)
     AND e.new_custodian_user_id = COALESCE(t.carrier_user_id, t.delivered_by);
  IF v_ev <> 4 THEN RAISE EXCEPTION 'A-P11 FALLO: custodias iniciales correctas=% (esperado 4)', v_ev; END IF;
  RAISE NOTICE 'OK A-P11: la custodia inicial coincide con el poseedor físico real (casos A/B/C)';
END $$;


\echo '══ Estado tras las pruebas positivas:'
SELECT status, count(*) FROM cash_transfers GROUP BY status ORDER BY status;
SELECT transfer_id, status, legs_total, out_all, in_all, out_exactas, in_exactas, invalid_legs, inconsistente
  FROM v_cash_transfer_reconciliation ORDER BY status, transfer_id;
