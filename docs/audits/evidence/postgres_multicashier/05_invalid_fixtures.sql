-- ═══════════════════════════════════════════════════════════════════════════════
-- 05_invalid_fixtures.sql — Las 15 PRUEBAS NEGATIVAS del pliego. Cada una corre
-- en una subtransacción (BEGIN…EXCEPTION) que DEBE revertirse: se verifica que
-- no queda residuo. Si una escritura inválida NO se rechaza, el bloque RAISE
-- 'NO_RECHAZADA' aborta el script y el runner lo marca como FALLO.
-- ═══════════════════════════════════════════════════════════════════════════════

\echo '══ N1: pierna OUT sin transferencia (ref_id inexistente) ⇒ rechazo INMEDIATO'
DO $$
BEGIN
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'out', 'cash',
            100, 'CUP', 'cash_transfer', gen_random_uuid(),
            '50000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'NO_RECHAZADA N1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N1 rechazo inmediato: %', SQLERRM;
  END;
END $$;

\echo '══ N2: pierna IN sin transferencia ⇒ rechazo INMEDIATO'
DO $$
BEGIN
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_account_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'in', 'cash',
            100, 'CUP', 'cash_transfer', gen_random_uuid(),
            '40000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'NO_RECHAZADA N2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N2 rechazo inmediato: %', SQLERRM;
  END;
END $$;

\echo '══ N3: importe distinto (OUT 2000, pierna 1999) ⇒ rechazo DIFERIDO (V3)'
DO $$
DECLARE v_t uuid; v_leg uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N3') INTO v_t;
  v_leg := gen_random_uuid();
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (v_leg,
            '10000000-0000-0000-0000-000000000001', 'out', 'cash', 1999, 'CUP',
            'cash_transfer', v_t, '50000000-0000-0000-0000-000000000001');
    UPDATE cash_transfers SET status='entregada', leg_out_payment_id=v_leg,
             sent_from_session_id='50000000-0000-0000-0000-000000000001',
             delivered_by='20000000-0000-0000-0000-000000000002' WHERE id=v_t;
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N3';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N3 importe distinto rechazado (deferred): %', SQLERRM;
  END;
END $$;

\echo '══ N4: moneda distinta (transferencia CUP, pierna USD) ⇒ rechazo DIFERIDO (V3)'
DO $$
DECLARE v_t uuid; v_leg uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N4') INTO v_t;
  v_leg := gen_random_uuid();
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (v_leg,
            '10000000-0000-0000-0000-000000000001', 'out', 'cash', 2000, 'USD',
            'cash_transfer', v_t, '50000000-0000-0000-0000-000000000001');
    UPDATE cash_transfers SET status='entregada', leg_out_payment_id=v_leg,
             sent_from_session_id='50000000-0000-0000-0000-000000000001',
             delivered_by='20000000-0000-0000-0000-000000000002' WHERE id=v_t;
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N4';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N4 moneda distinta rechazada (deferred): %', SQLERRM;
  END;
END $$;

\echo '══ N5: pierna en OTRA tienda ⇒ rechazo INMEDIATO'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N5') INTO v_t;
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 'out', 'cash',
            2000, 'CUP', 'cash_transfer', v_t,
            '50000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'NO_RECHAZADA N5';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N5 tienda distinta rechazada (inmediato): %', SQLERRM;
  END;
END $$;

\echo '══ N6: medio de pago incorrecto (Zelle como pierna) ⇒ rechazo INMEDIATO'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N6') INTO v_t;
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_account_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'out', 'zelle',
            2000, 'CUP', 'cash_transfer', v_t, NULL);
    RAISE EXCEPTION 'NO_RECHAZADA N6';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N6 medio incorrecto rechazado (inmediato): %', SQLERRM;
  END;
END $$;

\echo '══ N7: titular incorrecto (pierna en sesión ajena a la declarada) ⇒ DIFERIDO'
DO $$
DECLARE v_t uuid; v_leg uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N7') INTO v_t;
  v_leg := gen_random_uuid();
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (v_leg,
            '10000000-0000-0000-0000-000000000001', 'out', 'cash', 2000, 'CUP',
            'cash_transfer', v_t, '50000000-0000-0000-0000-000000000002');  -- sesión de G2, no la emisora
    UPDATE cash_transfers SET status='entregada', leg_out_payment_id=v_leg,
             sent_from_session_id='50000000-0000-0000-0000-000000000001',
             delivered_by='20000000-0000-0000-0000-000000000002' WHERE id=v_t;
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N7';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N7 titular incorrecto rechazado (deferred): %', SQLERRM;
  END;
END $$;

\echo '══ N8: sesión de OTRA gaveta (store correcto, register equivocado) ⇒ DIFERIDO (P0-2)'
DO $$
DECLARE v_t uuid; v_leg uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N8') INTO v_t;
  v_leg := gen_random_uuid();
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (v_leg,
            '10000000-0000-0000-0000-000000000001', 'out', 'cash', 2000, 'CUP',
            'cash_transfer', v_t, '50000000-0000-0000-0000-000000000002');
    UPDATE cash_transfers SET status='entregada', leg_out_payment_id=v_leg,
             sent_from_session_id='50000000-0000-0000-0000-000000000002',   -- sesión de G2
             delivered_by='20000000-0000-0000-0000-000000000002' WHERE id=v_t;
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N8';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N8 gaveta emisora equivocada rechazada (deferred): %', SQLERRM;
  END;
END $$;

\echo '══ N9: cuenta de OTRA tienda ⇒ rechazo INMEDIATO (FK compuesta)'
DO $$
BEGIN
  BEGIN
    UPDATE cash_transfers SET received_in_account_id =
             '40000000-0000-0000-0000-000000000002'   -- C2 pertenece a Tienda Norte
     WHERE id = (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
    RAISE EXCEPTION 'NO_RECHAZADA N9';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N9 cuenta de otra tienda rechazada (FK compuesta): %', SQLERRM;
  END;
END $$;

\echo '══ N9b: recepción con cuenta de OTRA tienda vía función ⇒ rechazo INMEDIATO (FK compuesta fk_recv_acc)'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           NULL, '40000000-0000-0000-0000-000000000001',
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N9b') INTO v_t;
  BEGIN
    PERFORM f_deliver_cash_transfer(v_t, '20000000-0000-0000-0000-000000000002',
             '50000000-0000-0000-0000-000000000001', NULL);
    PERFORM f_receive_cash_transfer(v_t, '20000000-0000-0000-0000-000000000004',
             NULL, '40000000-0000-0000-0000-000000000002');   -- C2 de Tienda Norte
    RAISE EXCEPTION 'NO_RECHAZADA N9b';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N9b cuenta receptora de otra tienda rechazada (FK compuesta): %', SQLERRM;
  END;
END $$;

\echo '══ N10: dirección refund como pierna ⇒ rechazo INMEDIATO'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N10') INTO v_t;
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'refund', 'cash',
            2000, 'CUP', 'cash_transfer', v_t, '50000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'NO_RECHAZADA N10';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N10 dirección refund rechazada (inmediato): %', SQLERRM;
  END;
END $$;

\echo '══ N11: TERCERA pierna adicional (tras OUT+IN correctas) ⇒ DIFERIDO (legs_total)'
DO $$
DECLARE v_t uuid;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');  -- devuelta, 2 piernas
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'out', 'cash',
            2000, 'CUP', 'cash_transfer', v_t, '50000000-0000-0000-0000-000000000001');
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N11';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N11 tercera pierna rechazada (deferred legs_total): %', SQLERRM;
  END;
END $$;

\echo '══ N11b: fila adicional Zelle/refund sobre transferencia conciliada ⇒ DIFERIDO'
DO $$
DECLARE v_t uuid;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T2');  -- recibida_en_cuenta
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_account_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'refund', 'zelle',
            5000, 'CUP', 'cash_transfer', v_t, NULL);   -- electrónica, titular libre
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N11b';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N11b fila electrónica adicional rechazada (deferred legs_total): %', SQLERRM;
  END;
END $$;

\echo '══ N12: pierna duplicada (segunda OUT correcta) ⇒ DIFERIDO (out_all=2)'
DO $$
DECLARE v_t uuid;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4');  -- recibida
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'out', 'cash',
            750, 'CUP', 'cash_transfer', v_t, '50000000-0000-0000-0000-000000000001');
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N12';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N12 pierna duplicada rechazada (deferred): %', SQLERRM;
  END;
END $$;

\echo '══ N13: estado sin pierna (entregada con leg_out NULL) ⇒ rechazo INMEDIATO (CHECK)'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N13') INTO v_t;
  BEGIN
    UPDATE cash_transfers SET status='entregada',
             delivered_by='20000000-0000-0000-0000-000000000002' WHERE id=v_t;
    RAISE EXCEPTION 'NO_RECHAZADA N13';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N13 estado sin pierna rechazado (CHECK inmediato): %', SQLERRM;
  END;
END $$;

\echo '══ N14: pierna insertada SIN transición final (solicitada con pierna) ⇒ DIFERIDO al COMMIT'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N14') INTO v_t;
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'out', 'cash',
            2000, 'CUP', 'cash_transfer', v_t, '50000000-0000-0000-0000-000000000001');
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;   -- (sin UPDATE de estado)
    RAISE EXCEPTION 'NO_RECHAZADA N14';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N14 pierna sin transición final rechazada (deferred): %', SQLERRM;
  END;
END $$;

\echo '══ N15a: recepción EN SESIÓN YA CERRADA vía RPC ⇒ guard inmediato'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N15') INTO v_t;
  BEGIN
    PERFORM f_deliver_cash_transfer(v_t, '20000000-0000-0000-0000-000000000002',
             '50000000-0000-0000-0000-000000000001', NULL);
    PERFORM f_receive_cash_transfer(v_t, '20000000-0000-0000-0000-000000000004',
             '50000000-0000-0000-0000-000000000004', NULL);  -- SS_G2C cerrada hace 1 h
    RAISE EXCEPTION 'NO_RECHAZADA N15a';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N15a sesión receptora cerrada rechazada (RPC): %', SQLERRM;
  END;
END $$;

\echo '══ N15b: recepción en sesión cerrada ANTES (bypass RPC, escritura directa) ⇒ DIFERIDO'
DO $$
DECLARE v_t uuid; v_leg uuid; v_at timestamptz;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-N15b') INTO v_t;
  BEGIN
    PERFORM f_deliver_cash_transfer(v_t, '20000000-0000-0000-0000-000000000002',
             '50000000-0000-0000-0000-000000000001', NULL);
    v_leg := gen_random_uuid();
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, at, ref_type, ref_id, cash_closure_id)
    VALUES (v_leg, '10000000-0000-0000-0000-000000000001', 'in', 'cash', 2000, 'CUP',
            now(), 'cash_transfer', v_t, '50000000-0000-0000-0000-000000000004'); -- cerrada
    UPDATE cash_transfers SET status='recibida', leg_in_payment_id=v_leg,
             received_in_session_id='50000000-0000-0000-0000-000000000004',
             received_by='20000000-0000-0000-0000-000000000004' WHERE id=v_t;
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N15b';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N15b recepción en sesión cerrada antes rechazada (deferred V3): %', SQLERRM;
  END;
END $$;

\echo '══ Cadena de custodia: casos negativos estructurales'
\echo '══ N16: evento de custodia que apunta a OTRA transferencia ⇒ FK compuesta'
DO $$
DECLARE v_t uuid; v_prev uuid;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6');
  v_prev := (SELECT id FROM cash_transfer_custody_events
              WHERE transfer_id=(SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4')
              ORDER BY event_seq DESC LIMIT 1);
  BEGIN
    INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
             new_custodian_user_id, changed_by, reason)
    VALUES (v_t, 2, v_prev, '20000000-0000-0000-0000-000000000005',
            '20000000-0000-0000-0000-000000000001', 'intento de referencia cruzada');
    RAISE EXCEPTION 'NO_RECHAZADA N16';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N16 referencia cruzada entre transferencias rechazada (FK compuesta): %', SQLERRM;
  END;
END $$;

\echo '══ N17: bifurcación (dos sucesores del mismo evento) ⇒ índice único de sucesor'
DO $$
DECLARE v_t4 uuid; v_ev1 uuid; v_ev2 uuid;
BEGIN
  v_t4 := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T4');
  SELECT id INTO v_ev1 FROM cash_transfer_custody_events
   WHERE transfer_id=v_t4 AND event_seq=1;
  BEGIN
    INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
             new_custodian_user_id, changed_by, reason)
    VALUES (v_t4, 4, v_ev1, '20000000-0000-0000-0000-000000000005',
            '20000000-0000-0000-0000-000000000001', 'bifurcación ilegal');
    RAISE EXCEPTION 'NO_RECHAZADA N17';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N17 bifurcación rechazada (único sucesor): %', SQLERRM;
  END;
END $$;

\echo '══ N18: segundo evento inicial (seq=1 duplicado) ⇒ índice único parcial'
DO $$
DECLARE v_t uuid;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6');
  BEGIN
    INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
             new_custodian_user_id, changed_by, reason)
    VALUES (v_t, 1, NULL, '20000000-0000-0000-0000-000000000005',
            '20000000-0000-0000-0000-000000000001', 'segundo evento inicial ilegal');
    RAISE EXCEPTION 'NO_RECHAZADA N18';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N18 segundo evento inicial rechazado: %', SQLERRM;
  END;
END $$;

\echo '══ N19: append-only (UPDATE/DELETE de eventos de custodia) ⇒ REVOKE implícito del propietario: trigger anti-escritura'
DO $$
BEGIN
  BEGIN
    UPDATE cash_transfer_custody_events SET reason='manipulación' WHERE event_seq = 1;
    RAISE EXCEPTION 'NO_RECHAZADA N19';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N19 append-only reforzado: %', SQLERRM;
  END;
END $$;

\echo '══ VERIFICACIÓN DE ROLLBACK ÍNTEGRO: ningún intento negativo dejó piernas ni custodia'
SELECT bool_and(legs_total = 0 AND invalid_legs = 0) AS negativos_sin_residuo
  FROM v_cash_transfer_reconciliation
 WHERE transfer_id IN (SELECT id FROM cash_transfers WHERE idempotency_key LIKE 'idem-N%');
SELECT bool_and(status = 'solicitada') AS negativos_en_estado_inicial
  FROM cash_transfers WHERE idempotency_key LIKE 'idem-N%';

\echo '══ Limpieza del arnés de pruebas (solo transferencias solicitada/sin piernas del expediente desechable)'
DELETE FROM cash_transfer_custody_events
 WHERE transfer_id IN (SELECT id FROM cash_transfers WHERE idempotency_key LIKE 'idem-N%');
DELETE FROM cash_transfers WHERE idempotency_key LIKE 'idem-N%';
