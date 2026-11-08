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
-- Roles de los fixtures: U_M encargado (solicita/autoriza), U_K cajero entrega G1,
-- U_X cajero en G2, U_L cajera recibe, U_J transportista, U_N encargado de S2.
-- Sesiones: SS_G1/SS_G2/SS_G3 abiertas hace 2 h; SS_G2C cerrada hace 1 h (para N15).

INSERT INTO stores(id, name, multicashier_enabled_at) VALUES
  (:'S1', 'Tienda Centro', now() - interval '1 year'),   -- ámbito multicaja activo
  (:'S2', 'Tienda Norte',  now() - interval '1 year');

INSERT INTO profiles(id, store_id, role) VALUES
  (:'U_M', :'S1', 'encargado'),
  (:'U_K', :'S1', 'cajero'),
  (:'U_X', :'S1', 'cajero'),
  (:'U_L', :'S1', 'cajera'),
  (:'U_J', :'S1', 'transportista'),
  (:'U_N', :'S2', 'encargado');

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
INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
         currency, exchange_rate, ref_type, ref_id, cash_account_id, created_by)
VALUES
  ('60000000-0000-0000-0000-000000000001', :'S1', 'in', 'cash', 10000, 'CUP', 1,
   'sale', NULL, :'C1', :'U_M'),
  ('60000000-0000-0000-0000-000000000002', :'S1', 'in', 'cash', 100, 'USD', 120,
   'sale', NULL, :'C1', :'U_M');

\echo '══ P1: solicitar transferencia gaveta→gaveta (2000 CUP, G1→G2, encargado M)'
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         2000, 'CUP', :'U_M', :'U_M', 'idem-T1') AS t1;

\echo '══ P2: entregar DESDE GAVETA (cajero K por sesión SS_G1; transportista J lleva)'
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_K', :'SS_G1', :'U_J') AS leg_out;

\echo '══ P3: transferencia tesorería→gaveta y entrega DESDE TESORERÍA (sin sesión emisora)'
SELECT f_request_cash_transfer(:'S1', NULL, :'C1', :'G2', NULL,
         5000, 'CUP', :'U_M', :'U_M', 'idem-T2') AS t2;
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2'),
         :'U_K', NULL, NULL) AS leg_out_t2;

\echo '══ P4: recibir EN SESIÓN (cajera L en sesión SS_G2 de la gaveta destino G2; T2 venía de tesorería)'
SELECT f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2'),
         :'U_L', :'SS_G2L', NULL) AS leg_in;

\echo '══ P5: gaveta→tesorería y recibir EN CUENTA (cuenta receptora C1 exacta del destino)'
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, NULL, :'C1',
         900, 'CUP', :'U_M', :'U_M', 'idem-T2b') AS t2b;
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2b'),
         :'U_K', :'SS_G1', NULL) AS leg_out_t2b;
SELECT f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T2b'),
         :'U_L', NULL, :'C1') AS leg_in_t2b;

\echo '══ P6: solicitar devolución DESDE entregada (esc. E: rechazo antes de recibir; sin pierna nueva)'
SELECT f_request_return_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_L', 'el dinero no fue esperado');

\echo '══ P7: devolver al ORIGEN (sesión SS_G1 de la gaveta de origen G1)'
SELECT f_return_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T1'),
         :'U_K', :'SS_G1', NULL) AS leg_in_retorno;

\echo '══ P8: cancelar antes de entregar (sin piernas)'
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         300, 'CUP', :'U_M', :'U_M', 'idem-T3') AS t3;
SELECT f_cancel_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T3'),
         :'U_M', 'se solicitó por error');

\echo '══ P9: reintento idempotente de SOLICITUD (misma clave ⇒ mismo id, sin duplicar)'
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, NULL, :'C1',
         900, 'CUP', :'U_M', :'U_M', 'idem-T2b') AS reintento_solicitud_mismo_id;

\echo '══ P10: eventos de custodia sucesivos (entrega→reasignación esc.D→recepción)'
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         750, 'CUP', :'U_M', :'U_M', 'idem-T4') AS t4;
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_K', :'SS_G1', :'U_J') AS leg_t4;
SELECT f_create_custody_event(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_J', :'U_M', :'U_M', :'U_M', 'reasignación de custodia (escenario D)') AS ev_reasignacion;
SELECT f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T4'),
         :'U_L', :'SS_G2L', NULL) AS leg_in_t4;

\echo '══ P+ (vigencia histórica): recibir y DESPUÉS cerrar la sesión receptora ⇒ sigue siendo válida'
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         450, 'CUP', :'U_M', :'U_M', 'idem-T5') AS t5;
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T5'),
         :'U_K', :'SS_G1', NULL) AS leg_t5;
SELECT f_receive_cash_transfer(
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
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T6'),
         :'U_K', :'SS_G1', NULL) AS orden_correcto_ok;

\echo '══ P9b: reintento idempotente de ENTREGA (ya entregada ⇒ misma pierna, sin duplicar)'
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T6'),
         :'U_K', :'SS_G1', NULL) AS reintento_entrega_misma_pierna;

\echo '══ P11 (misión 009): saldo de tesorería — consumo real y saldo EXACTO permitido'
-- Tras P3 (−5000) y P5 (+900 en cuenta): saldo C1 CUP = 10000 − 5000 + 900 = 5900.
-- Saldo suficiente: f_check sin excepción; y una transferencia del importe EXACTO pasa:
SELECT f_check_treasury_saldo(:'C1', :'S1', 'CUP', 5900) AS saldo_5900_ok;
SELECT f_request_cash_transfer(:'S1', NULL, :'C1', :'G2', NULL,
         5900, 'CUP', :'U_M', :'U_M', 'idem-T7') AS t7;
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T7'),
         :'U_K', NULL, NULL) AS leg_out_t7;              -- descuenta EXACTO: saldo queda 0
DO $$
BEGIN
  PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
           '10000000-0000-0000-0000-000000000001', 'CUP', 0);   -- saldo 0: pasa (>=0)
  RAISE NOTICE 'OK P11: saldo exacto consumido, C1 CUP queda en 0';
END $$;

\echo '══ P12 (misión 009): separación de monedas — USD opera aparte del CUP'
SELECT f_request_cash_transfer(:'S1', NULL, :'C1', :'G2', NULL,
         100, 'USD', :'U_M', :'U_M', 'idem-T7b') AS t7b;
SELECT f_deliver_cash_transfer(
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

\echo '══ P13 (misión 009, decisión B): ENTREGA por el transportista desde la sesión del cajero'
-- El actor operativo (J) difiere del titular de la sesión emisora (K): permitido
-- porque J es el transportista registrado en custodia (auditoría conserva ambos).
SELECT f_request_cash_transfer(:'S1', :'G1', NULL, :'G2', NULL,
         750, 'CUP', :'U_M', :'U_M', 'idem-T8') AS t8;
SELECT f_deliver_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T8'),
         :'U_J', :'SS_G1', :'U_J') AS leg_out_t8_actor_transportista;
SELECT f_receive_cash_transfer(
         (SELECT id FROM cash_transfers WHERE idempotency_key = 'idem-T8'),
         :'U_X', :'SS_G2', NULL) AS leg_in_t8;           -- X es titular de SS_G2 ✓

\echo '══ Estado tras las pruebas positivas:'
SELECT status, count(*) FROM cash_transfers GROUP BY status ORDER BY status;
SELECT transfer_id, status, legs_total, out_all, in_all, out_exactas, in_exactas, invalid_legs, inconsistente
  FROM v_cash_transfer_reconciliation ORDER BY status, transfer_id;
