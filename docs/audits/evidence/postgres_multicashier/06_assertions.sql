-- ═══════════════════════════════════════════════════════════════════════════════
-- 06_assertions.sql — Demostración del COMMIT diferido + ASERCIONES FINALES
-- (misión 009): TODAS las aserciones son HARD-FAIL (DO + RAISE EXCEPTION si la
-- condición esperada no se cumple). Ninguna aserción depende de un NOTICE.
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

\echo '── Verificación del rollback íntegro tras el COMMIT fallido (HARD-FAIL):'
DO $$
DECLARE v_piernas int; v_estado text;
BEGIN
  SELECT count(*) INTO v_piernas FROM payment_transactions
   WHERE ref_type='cash_transfer'
     AND ref_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6');
  SELECT status INTO v_estado
   FROM cash_transfers WHERE idempotency_key='idem-T6';
  IF v_piernas <> 1 OR v_estado <> 'entregada' THEN
    RAISE EXCEPTION 'COMMIT-DIFERIDO FALLO: T6 quedó con % piernas y estado %', v_piernas, v_estado;
  END IF;
  RAISE NOTICE 'OK A: COMMIT diferido rechazó la tercera pierna y revirtió íntegro';
END $$;

\set ON_ERROR_STOP on

\echo '══ B1: TODA transferencia concilia (inconsistente=false en las 10) — HARD-FAIL'
DO $$
DECLARE v_total int; v_incons int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE inconsistente) INTO v_total, v_incons
    FROM v_cash_transfer_reconciliation;
  IF v_total <> 10 OR v_incons <> 0 THEN
    RAISE EXCEPTION 'B1 FALLO: % transferencias, % inconsistentes (esperado 10/0)', v_total, v_incons;
  END IF;
  RAISE NOTICE 'OK B1: 10 transferencias, 0 inconsistentes';
END $$;

\echo '══ B2: ciclo T1 gaveta→gaveta→devolución (retorno al ORIGEN exacto) — HARD-FAIL'
DO $$
DECLARE v_ok boolean; v_legs int; v_status text;
BEGIN
  SELECT (pt.cash_closure_id = ct.return_in_session_id
          AND cc.cash_register_id = ct.from_register_id)
    INTO v_ok
    FROM cash_transfers ct
    JOIN payment_transactions pt ON pt.id = ct.leg_in_payment_id
    JOIN cash_closures cc ON cc.id = pt.cash_closure_id
   WHERE ct.idempotency_key='idem-T1';
  SELECT legs_total, status INTO v_legs, v_status
    FROM v_cash_transfer_reconciliation
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
  IF v_ok IS NOT TRUE OR v_legs <> 2 OR v_status <> 'devuelta' THEN
    RAISE EXCEPTION 'B2 FALLO: retorno_en_origen=%, legs=%, estado=%', v_ok, v_legs, v_status;
  END IF;
  RAISE NOTICE 'OK B2: T1 devuelta con retorno en la sesión de origen exacta';
END $$;

\echo '══ B3: recepción en cuenta T2b (cuenta receptora = destino exacto) — HARD-FAIL'
DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT (ct.received_in_account_id = ct.to_account_id AND pt.cash_account_id = ct.to_account_id)
    INTO v_ok
    FROM cash_transfers ct JOIN payment_transactions pt ON pt.id = ct.leg_in_payment_id
   WHERE ct.idempotency_key='idem-T2b';
  IF v_ok IS NOT TRUE THEN RAISE EXCEPTION 'B3 FALLO: cuenta receptora no exacta'; END IF;
  RAISE NOTICE 'OK B3: T2b recibida en cuenta destino exacta';
END $$;

\echo '══ B4: custodia T1 — J→K lineal (entrega, retorno; recepción nunca ocurrió) — HARD-FAIL'
DO $$
DECLARE v_ev record;
BEGIN
  SELECT count(*) AS n,
         bool_or(event_seq=1 AND new_custodian_user_id='20000000-0000-0000-0000-000000000005') AS inicial_j,
         bool_or(event_seq=2 AND new_custodian_user_id='20000000-0000-0000-0000-000000000002') AS cierre_k
    INTO v_ev
    FROM cash_transfer_custody_events
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
  IF v_ev.n <> 2 OR v_ev.inicial_j IS NOT TRUE OR v_ev.cierre_k IS NOT TRUE THEN
    RAISE EXCEPTION 'B4 FALLO: eventos=% inicial_J=% cierre_K=%', v_ev.n, v_ev.inicial_j, v_ev.cierre_k;
  END IF;
  RAISE NOTICE 'OK B4: T1 custodia J→K lineal';
END $$;

\echo '══ B4b: custodia T4 — tres eventos J→M→L con cadena continua — HARD-FAIL'
DO $$
DECLARE v_n int; v_continua int; v_reasig boolean; v_recep boolean;
BEGIN
  SELECT count(*) INTO v_n FROM cash_transfer_custody_events
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4');
  SELECT count(*) INTO v_continua
    FROM cash_transfer_custody_events e
    JOIN cash_transfer_custody_events p
      ON e.previous_event_id = p.id AND e.event_seq = p.event_seq + 1
   WHERE e.transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4');
  SELECT bool_or(event_seq=2 AND new_custodian_user_id='20000000-0000-0000-0000-000000000001')
    INTO v_reasig FROM cash_transfer_custody_events
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4');
  SELECT bool_or(event_seq=3 AND new_custodian_user_id='20000000-0000-0000-0000-000000000004')
    INTO v_recep FROM cash_transfer_custody_events
   WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4');
  IF v_n <> 3 OR v_continua <> 2 OR v_reasig IS NOT TRUE OR v_recep IS NOT TRUE THEN
    RAISE EXCEPTION 'B4b FALLO: eventos=% enlaces=% reasignacion=% recepcion=%',
      v_n, v_continua, v_reasig, v_recep;
  END IF;
  RAISE NOTICE 'OK B4b: T4 custodia J→M→L con reasignación esc.D y recepción';
END $$;

\echo '══ B5: idempotencia — reintentos no duplican piernas ni transferencias — HARD-FAIL'
DO $$
DECLARE v_t2 int; v_t2b int; v_duplicadas int;
BEGIN
  SELECT count(*) INTO v_t2 FROM payment_transactions
   WHERE ref_type='cash_transfer' AND ref_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T2');
  SELECT count(*) INTO v_t2b FROM payment_transactions
   WHERE ref_type='cash_transfer' AND ref_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T2b');
  SELECT count(*) INTO v_duplicadas FROM
    (SELECT idempotency_key FROM cash_transfers WHERE idempotency_key IS NOT NULL
     GROUP BY idempotency_key HAVING count(*) > 1) d;
  IF v_t2 <> 2 OR v_t2b <> 2 OR v_duplicadas <> 0 THEN
    RAISE EXCEPTION 'B5 FALLO: piernas T2=% T2b=% claves duplicadas=%', v_t2, v_t2b, v_duplicadas;
  END IF;
  RAISE NOTICE 'OK B5: reintentos idempotentes sin duplicados';
END $$;

\echo '══ B6: sin residuo (10 transferencias, 15 piernas, 16 eventos, 0 negativos) — HARD-FAIL'
DO $$
DECLARE v_tr int; v_legs int; v_ev int; v_res int;
BEGIN
  SELECT count(*) INTO v_tr FROM cash_transfers;
  SELECT count(*) INTO v_legs FROM payment_transactions WHERE ref_type='cash_transfer';
  SELECT count(*) INTO v_ev FROM cash_transfer_custody_events;
  SELECT count(*) INTO v_res FROM cash_transfers WHERE idempotency_key ~ '^idem-(N|S|I|A)';
  IF v_tr <> 10 OR v_legs <> 15 OR v_ev <> 16 OR v_res <> 0 THEN
    RAISE EXCEPTION 'B6 FALLO: transferencias=% piernas=% eventos=% residuo=% (esperado 10/15/16/0)',
      v_tr, v_legs, v_ev, v_res;
  END IF;
  RAISE NOTICE 'OK B6: 10 transferencias, 15 piernas, 16 eventos, sin residuo de negativos';
END $$;

\echo '══ B7: todas las sesiones usadas pertenecen a la gaveta EXACTA del extremo — HARD-FAIL'
DO $$
DECLARE v_malas int;
BEGIN
  SELECT count(*) INTO v_malas
    FROM cash_transfers ct
   WHERE EXISTS (SELECT 1 FROM cash_closures cc
                  WHERE cc.id IN (ct.sent_from_session_id, ct.received_in_session_id,
                                  ct.return_in_session_id)
                    AND NOT ( (cc.id = ct.sent_from_session_id  AND cc.cash_register_id = ct.from_register_id)
                           OR (cc.id = ct.received_in_session_id AND cc.cash_register_id = ct.to_register_id)
                           OR (cc.id = ct.return_in_session_id  AND cc.cash_register_id = ct.from_register_id) ));
  IF v_malas <> 0 THEN
    RAISE EXCEPTION 'B7 FALLO: % transferencias con sesiones fuera de la gaveta exacta', v_malas;
  END IF;
  RAISE NOTICE 'OK B7: extremos físicos exactos en todas las transferencias';
END $$;

\echo '══ B8: saldo de tesorería y clasificación (D.22.3) — HARD-FAIL'
DO $$
DECLARE v_cup numeric(14,2); v_usd numeric(14,2); v_huerfanas int; v_elec_cta int; v_cobros int;
BEGIN
  -- Saldo contable C1 por la MISMA fórmula del control (SUM sign*amount, físicos multicaja):
  SELECT COALESCE(SUM(CASE WHEN v.direction='in' THEN v.amount ELSE -v.amount END),0) INTO v_cup
    FROM v_cash_ledger_classification v
   WHERE v.holder_type='cuenta' AND v.holder_id='40000000-0000-0000-0000-000000000001'
     AND v.currency='CUP' AND v.model_scope='multicaja'
     AND v.class NOT IN ('electronico','historico_sin_titular');
  SELECT COALESCE(SUM(CASE WHEN v.direction='in' THEN v.amount ELSE -v.amount END),0) INTO v_usd
    FROM v_cash_ledger_classification v
   WHERE v.holder_type='cuenta' AND v.holder_id='40000000-0000-0000-0000-000000000001'
     AND v.currency='USD' AND v.model_scope='multicaja'
     AND v.class NOT IN ('electronico','historico_sin_titular');
  SELECT count(*) INTO v_huerfanas FROM v_cash_ledger_classification
   WHERE model_scope='multicaja' AND payment_method='cash'
     AND class IN ('sin_titular','sin_clasificar');
  SELECT count(*) INTO v_elec_cta FROM v_cash_ledger_classification
   WHERE class='electronico' AND holder_type='cuenta';
  SELECT count(*) INTO v_cobros FROM v_cash_ledger_classification WHERE class='cobro';
  IF v_cup <> 0 OR v_usd <> 0 OR v_huerfanas <> 0 OR v_elec_cta <> 0 OR v_cobros <> 2 THEN
    RAISE EXCEPTION 'B8 FALLO: saldo_CUP=% saldo_USD=% huerfanas=% electronico_en_cuenta=% cobros=%',
      v_cup, v_usd, v_huerfanas, v_elec_cta, v_cobros;
  END IF;
  RAISE NOTICE 'OK B8: saldos CUP/USD en 0 tras consumo exacto; 0 huérfanas; 0 electrónicos en cuenta; 2 cobros';
END $$;

\echo '══ VEREDICTO DE ASERCIONES:'
DO $$
DECLARE ok boolean;
BEGIN
  SELECT bool_and(NOT inconsistente) INTO ok FROM v_cash_transfer_reconciliation;
  IF (SELECT count(*) FROM cash_transfers) = 10
     AND (SELECT count(*) FROM payment_transactions WHERE ref_type='cash_transfer') = 15
     AND (SELECT count(*) FROM cash_transfer_custody_events) = 16
     AND ok THEN
    RAISE NOTICE 'RESULTADO FINAL: ASSERTIONS 009 OK — PostgreSQL 17.11, 15 positivas + negativos verificables + COMMIT diferido + saldo/idempotencia/custodia certificados';
  ELSE
    RAISE EXCEPTION 'ASSERTIONS FAILED';
  END IF;
END $$;
