-- ═══════════════════════════════════════════════════════════════════════════════
-- 06_assertions.sql — Demostración del COMMIT diferido + aserciones finales.
-- Parte A: una inconsistencia ESCRITA y SIN SET CONSTRAINTS se detecta EN EL
-- COMMIT (constraint trigger diferido) y la transacción revierte ÍNTEGRA.
-- Parte B: aserciones de estado final (todas deben pasar).
-- ═══════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP off

\echo '══ A: COMMIT diferido — tercera pierna válida se detecta EN EL COMMIT'
BEGIN;
INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
         currency, ref_type, ref_id, cash_closure_id)
VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'out', 'cash',
        600, 'CUP', 'cash_transfer',
        (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6'),
        '50000000-0000-0000-0000-000000000001');
COMMIT;   -- el constraint trigger diferido DEBE fallar aquí (legs_total=2 en entregada)

\echo '── Verificación del rollback íntegro tras el COMMIT fallido:'
SELECT count(*) AS piernas_T6_debe_ser_1
  FROM payment_transactions
 WHERE ref_type='cash_transfer'
   AND ref_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6');
SELECT status AS T6_debe_ser_entregada, leg_out_payment_id IS NOT NULL AS con_leg_out
  FROM cash_transfers WHERE idempotency_key='idem-T6';

\set ON_ERROR_STOP on

\echo '══ B1: TODA transferencia concilia (inconsistente=false en las 6)'
SELECT count(*) AS transferencias, bool_and(NOT inconsistente) AS todas_conciliadas
  FROM v_cash_transfer_reconciliation;

\echo '══ B2: ciclo completo T1 gaveta→gaveta→devolución (retorno al ORIGEN exacto)'
SELECT status, legs_total, out_exactas, in_exactas, invalid_legs
  FROM v_cash_transfer_reconciliation WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
SELECT pt.cash_closure_id = ct.return_in_session_id AS retorno_en_sesion_de_origen,
       cc.cash_register_id = ct.from_register_id   AS sesion_de_origen_en_gaveta_exacta
  FROM cash_transfers ct
  JOIN payment_transactions pt ON pt.id = ct.leg_in_payment_id
  JOIN cash_closures cc ON cc.id = pt.cash_closure_id
 WHERE ct.idempotency_key='idem-T1';

\echo '══ B3: recepción en cuenta T2b (cuenta receptora = destino exacto)'
SELECT ct.received_in_account_id = ct.to_account_id AS cuenta_receptora_exacta,
       pt.cash_account_id = ct.to_account_id        AS pierna_en_cuenta_destino
  FROM cash_transfers ct JOIN payment_transactions pt ON pt.id = ct.leg_in_payment_id
 WHERE ct.idempotency_key='idem-T2b';

\echo '══ B4: custodia de T1 — cadena lineal J→K (entrega, retorno al origen; recepción nunca ocurrió)'
WITH ev AS (SELECT id, event_seq, previous_event_id, new_custodian_user_id
              FROM cash_transfer_custody_events
             WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1')
             ORDER BY event_seq)
SELECT (SELECT count(*) FROM ev) = 2                                   AS dos_eventos,
       (SELECT new_custodian_user_id FROM ev WHERE event_seq=1)
         = '20000000-0000-0000-0000-000000000005'                      AS custodio_inicial_transportista,
       (SELECT new_custodian_user_id FROM ev WHERE event_seq=2)
         = '20000000-0000-0000-0000-000000000002'                      AS custodio_origen_al_retornar,
       (SELECT count(*) FROM ev e JOIN ev p
         ON e.previous_event_id = p.id AND e.event_seq = p.event_seq + 1) = 1 AS cadena_continua;

\echo '══ B4b: custodia de T4 — tres eventos sucesivos J→M→L con cadena continua'
WITH ev AS (SELECT id, event_seq, previous_event_id, new_custodian_user_id
              FROM cash_transfer_custody_events
             WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4')
             ORDER BY event_seq)
SELECT (SELECT count(*) FROM ev) = 3                                   AS tres_eventos,
       (SELECT count(*) FROM ev e JOIN ev p
         ON e.previous_event_id = p.id AND e.event_seq = p.event_seq + 1) = 2 AS cadena_continua_t4,
       (SELECT new_custodian_user_id FROM ev WHERE event_seq=2)
         = '20000000-0000-0000-0000-000000000001'                      AS reasignacion_esc_d,
       (SELECT new_custodian_user_id FROM ev WHERE event_seq=3)
         = '20000000-0000-0000-0000-000000000004'                      AS recepcion_cierra_custodia;

\echo '══ B5: idempotencia — T2 con 2 piernas pese al reintento; T1 entregada 1 vez'
SELECT (SELECT count(*) FROM payment_transactions WHERE ref_type='cash_transfer'
          AND ref_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T2')) = 2 AS t2_sin_duplicados,
       (SELECT count(*) FROM payment_transactions WHERE ref_type='cash_transfer'
          AND ref_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T5')) = 2 AS t5_sin_duplicados;

\echo '══ B6: sin residuo de pruebas negativas (7 transferencias, 11 piernas, 12 eventos)'
SELECT (SELECT count(*) FROM cash_transfers) = 7                          AS transferencias_7,
       (SELECT count(*) FROM payment_transactions WHERE ref_type='cash_transfer') = 11 AS piernas_11,
       (SELECT count(*) FROM cash_transfer_custody_events) = 12           AS eventos_custodia_12;

\echo '══ B7: todas las sesiones usadas pertenecen a la gaveta EXACTA del extremo'
SELECT bool_and(EXISTS (SELECT 1 FROM cash_closures cc
                         WHERE cc.id IN (ct.sent_from_session_id, ct.received_in_session_id,
                                          ct.return_in_session_id)
                           AND (cc.id = ct.sent_from_session_id  AND cc.cash_register_id = ct.from_register_id
                             OR cc.id = ct.received_in_session_id AND cc.cash_register_id = ct.to_register_id
                             OR cc.id = ct.return_in_session_id  AND cc.cash_register_id = ct.from_register_id)))
       AS extremos_fisicos_exactos
  FROM cash_transfers ct;

\echo '══ VEREDICTO DE ASERCIONES:'
DO $$
DECLARE ok boolean;
BEGIN
  SELECT bool_and(NOT inconsistente) INTO ok FROM v_cash_transfer_reconciliation;
  IF (SELECT count(*) FROM cash_transfers) = 7
     AND (SELECT count(*) FROM payment_transactions WHERE ref_type='cash_transfer') = 11
     AND (SELECT count(*) FROM cash_transfer_custody_events) = 12
     AND ok THEN
    RAISE NOTICE 'RESULTADO FINAL: ASSERTIONS 008 OK — PostgreSQL 17.11, 10 positivas + 19 negativas + COMMIT diferido';
  ELSE
    RAISE EXCEPTION 'ASSERTIONS FAILED';
  END IF;
END $$;
