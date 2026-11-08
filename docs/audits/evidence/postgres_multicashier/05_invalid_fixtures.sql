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
\echo '══ N34: evento de custodia que apunta a OTRA transferencia ⇒ FK compuesta'
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
    RAISE EXCEPTION 'NO_RECHAZADA N34';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N34 referencia cruzada entre transferencias rechazada (FK compuesta): %', SQLERRM;
  END;
END $$;

\echo '══ N33: bifurcación (dos sucesores del mismo evento) ⇒ índice único de sucesor'
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
    RAISE EXCEPTION 'NO_RECHAZADA N33';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N33 bifurcación rechazada (único sucesor): %', SQLERRM;
  END;
END $$;

\echo '══ N32: segundo evento inicial (seq=1 duplicado) ⇒ índice único parcial'
DO $$
DECLARE v_t uuid;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6');
  BEGIN
    INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
             new_custodian_user_id, changed_by, reason)
    VALUES (v_t, 1, NULL, '20000000-0000-0000-0000-000000000005',
            '20000000-0000-0000-0000-000000000001', 'segundo evento inicial ilegal');
    RAISE EXCEPTION 'NO_RECHAZADA N32';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N32 segundo evento inicial rechazado: %', SQLERRM;
  END;
END $$;

\echo '══ N30: UPDATE de un evento de custodia ⇒ append-only (D.22.2)'
DO $$
BEGIN
  BEGIN
    UPDATE cash_transfer_custody_events SET reason='manipulación' WHERE event_seq = 1;
    RAISE EXCEPTION 'NO_RECHAZADA N30';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N30 UPDATE de evento rechazado (append-only): %', SQLERRM;
  END;
END $$;

\echo '══ N31: DELETE de un evento de custodia ⇒ append-only (D.22.2)'
DO $$
BEGIN
  BEGIN
    DELETE FROM cash_transfer_custody_events WHERE event_seq = 1;
    RAISE EXCEPTION 'NO_RECHAZADA N31';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N31 DELETE de evento rechazado (append-only): %', SQLERRM;
  END;
END $$;

-- ═════════════════ MISIÓN 009 · P0-1: PIERNAS INMUTABLES (N20-N25) ═══════════
-- La capa inmediata prohibe mutar una fila vinculada a un traspaso y la capa
-- diferida reconcilia TAMBIÉN la transferencia anterior (fn_ctr_legs_final).

\echo '══ N20: cambiar ref_type de una pierna OUT válida ⇒ rechazo INMEDIATO (ERR_LEG_IMMUTABLE)'
DO $$
DECLARE v_leg uuid; v_count int;
BEGIN
  v_leg := (SELECT leg_out_payment_id FROM cash_transfers WHERE idempotency_key='idem-T1');
  BEGIN
    UPDATE payment_transactions SET ref_type='sale' WHERE id=v_leg;
    RAISE EXCEPTION 'NO_RECHAZADA N20';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_LEG_IMMUTABLE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N20 cambio de ref_type rechazado (inmediato): %', SQLERRM;
  END;
  SELECT count(*) INTO v_count FROM payment_transactions
   WHERE id=v_leg AND ref_type='cash_transfer';
  IF v_count <> 1 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N20: la pierna quedó mutada'; END IF;
END $$;

\echo '══ N21: reasignar una pierna de la transferencia A a la B ⇒ rechazo INMEDIATO'
DO $$
DECLARE v_leg uuid; v_b uuid; v_ref uuid;
BEGIN
  v_leg := (SELECT leg_out_payment_id FROM cash_transfers WHERE idempotency_key='idem-T1');
  v_b   := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T2');
  BEGIN
    UPDATE payment_transactions SET ref_id=v_b WHERE id=v_leg;
    RAISE EXCEPTION 'NO_RECHAZADA N21';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_LEG_IMMUTABLE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N21 reasignación A→B rechazada (inmediato): %', SQLERRM;
  END;
  SELECT ref_id INTO v_ref FROM payment_transactions WHERE id=v_leg;
  IF v_ref <> (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1') THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N21: la pierna quedó reasignada';
  END IF;
END $$;

\echo '══ N22: cambiar el identificador de la pierna conservada ⇒ rechazo DIFERIDO (V3)'
DO $$
DECLARE v_t6 uuid; v_leg_ajena uuid;
BEGIN
  v_t6 := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T6');
  v_leg_ajena := (SELECT leg_out_payment_id FROM cash_transfers WHERE idempotency_key='idem-T1');
  BEGIN
    UPDATE cash_transfers SET leg_out_payment_id=v_leg_ajena WHERE id=v_t6;
    SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
    RAISE EXCEPTION 'NO_RECHAZADA N22';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_RECONCILE_FINAL%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N22 pierna conservada cambiada por otra ajena rechazada (deferred V3): %', SQLERRM;
  END;
  IF (SELECT leg_out_payment_id FROM cash_transfers WHERE id=v_t6)
     = v_leg_ajena THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N22: T6 quedó apuntando a pierna ajena';
  END IF;
END $$;

\echo '══ N23: eliminar una pierna OUT válida ⇒ rechazo INMEDIATO (ERR_LEDGER_APPEND_ONLY)'
DO $$
DECLARE v_leg uuid; v_count int;
BEGIN
  v_leg := (SELECT leg_out_payment_id FROM cash_transfers WHERE idempotency_key='idem-T1');
  BEGIN
    DELETE FROM payment_transactions WHERE id=v_leg;
    RAISE EXCEPTION 'NO_RECHAZADA N23';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_LEDGER_APPEND_ONLY%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N23 DELETE de pierna OUT rechazado (inmediato): %', SQLERRM;
  END;
  SELECT count(*) INTO v_count FROM payment_transactions WHERE id=v_leg;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N23: la pierna fue eliminada'; END IF;
END $$;

\echo '══ N24: eliminar una pierna IN válida ⇒ rechazo INMEDIATO (ERR_LEDGER_APPEND_ONLY)'
DO $$
DECLARE v_leg uuid; v_count int;
BEGIN
  v_leg := (SELECT leg_in_payment_id FROM cash_transfers WHERE idempotency_key='idem-T1');
  BEGIN
    DELETE FROM payment_transactions WHERE id=v_leg;
    RAISE EXCEPTION 'NO_RECHAZADA N24';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_LEDGER_APPEND_ONLY%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N24 DELETE de pierna IN rechazado (inmediato): %', SQLERRM;
  END;
  SELECT count(*) INTO v_count FROM payment_transactions WHERE id=v_leg;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N24: la pierna fue eliminada'; END IF;
END $$;

\echo '══ N25: ningún cambio deja transferencias inconsistentes tras COMMIT (estado global)'
DO $$
DECLARE v_incons int; v_piernas int; v_tr int;
BEGIN
  SELECT count(*) INTO v_incons FROM v_cash_transfer_reconciliation WHERE inconsistente;
  SELECT count(*) INTO v_piernas FROM payment_transactions
   WHERE ref_type='cash_transfer'
     AND ref_id IN (SELECT id FROM cash_transfers WHERE idempotency_key !~ '^idem-(N|S|I|A)');
  SELECT count(*) INTO v_tr FROM cash_transfers WHERE idempotency_key !~ '^idem-(N|S|I|A)';
  IF v_incons <> 0 OR v_piernas <> 15 OR v_tr <> 10 THEN
    RAISE EXCEPTION 'N25 FALLO: inconsistente=% piernas=% transferencias=% (esperado 0/15/10)',
      v_incons, v_piernas, v_tr;
  END IF;
  RAISE NOTICE 'OK N25 estado global íntegro tras N20-N24: 0 inconsistentes, 15 piernas, 10 transferencias';
END $$;

-- ═════════ MISIÓN 009 · SALDO DE TESORERÍA fail-closed (D.22.3) ═══════════════
-- Las filas anómalas se inyectan con session_replication_role=replica (simula
-- datos que burlan la RPC: carga masiva/legacy) y se revierten con el caso.

\echo '══ S-N1: salida con saldo inferior al importe ⇒ ERR_SALDO_INSUFICIENTE y rollback íntegro'
DO $$
DECLARE v_t uuid; v_legs int; v_estado text;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           NULL, '40000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000002', NULL,
           10000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-SN1') INTO v_t;
  BEGIN
    PERFORM f_deliver_cash_transfer(v_t, '20000000-0000-0000-0000-000000000002', NULL, NULL);
    RAISE EXCEPTION 'NO_RECHAZADA SN1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_SALDO_INSUFICIENTE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK S-N1 saldo insuficiente rechazado: %', SQLERRM;
  END;
  SELECT count(*) INTO v_legs FROM payment_transactions
   WHERE ref_type='cash_transfer' AND ref_id=v_t;
  SELECT status INTO v_estado FROM cash_transfers WHERE id=v_t;
  IF v_legs <> 0 OR v_estado <> 'solicitada' THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO SN1: % piernas, estado %', v_legs, v_estado;
  END IF;
END $$;

\echo '══ S-N2: movimiento físico SIN TITULAR en el ámbito ⇒ ERR_LEDGER_UNCLASSIFIED (fail-closed)'
DO $$
BEGIN
  -- Simula datos que burlan la RPC (carga masiva/legacy): el CHECK estructural
  -- pt_holder_required_physical se relaja TEMPORALMENTE para inyectar la fila
  -- anómala; si el caso falla, la transacción entera revierte y el CHECK vuelve.
  ALTER TABLE payment_transactions DROP CONSTRAINT pt_holder_required_physical;
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_closure_id, cash_account_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'in', 'cash',
            500, 'CUP', 'sale', NULL, NULL, NULL);  -- física SIN titular (huérfana)
    PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001', 'CUP', 1);
    RAISE EXCEPTION 'NO_RECHAZADA SN2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_LEDGER_UNCLASSIFIED%' THEN RAISE; END IF;
    RAISE NOTICE 'OK S-N2 fila física sin titular bloquea el ámbito: %', SQLERRM;
  END;
  -- rollback íntegro: la fila anómala NO persiste y el CHECK se restaura
  DELETE FROM payment_transactions
   WHERE payment_method='cash' AND cash_closure_id IS NULL AND cash_account_id IS NULL;
  ALTER TABLE payment_transactions
    ADD CONSTRAINT pt_holder_required_physical
    CHECK (payment_method <> 'cash' OR num_nonnulls(cash_closure_id, cash_account_id) = 1);
  IF EXISTS (SELECT 1 FROM payment_transactions
              WHERE payment_method='cash' AND cash_closure_id IS NULL AND cash_account_id IS NULL) THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO SN2: la fila sin titular persiste';
  END IF;
  PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
           '10000000-0000-0000-0000-000000000001', 'CUP', 0);
  RAISE NOTICE 'OK S-N2 rollback íntegro: CHECK restaurado y ámbito conciliable';
END $$;

\echo '══ S-N3: movimiento SIN CLASIFICAR en el ámbito ⇒ ERR_LEDGER_UNCLASSIFIED (fail-closed)'
DO $$
BEGIN
  BEGIN
    INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
             currency, ref_type, ref_id, cash_account_id)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'in', 'cash',
            500, 'CUP', 'carga_masiva_desconocida', NULL,
            '40000000-0000-0000-0000-000000000001');   -- titular válido, ref_type ignoto
    PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
             '10000000-0000-0000-0000-000000000001', 'CUP', 1);
    RAISE EXCEPTION 'NO_RECHAZADA SN3';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_LEDGER_UNCLASSIFIED%' THEN RAISE; END IF;
    RAISE NOTICE 'OK S-N3 fila sin clasificar bloquea el ámbito: %', SQLERRM;
  END;
  IF EXISTS (SELECT 1 FROM payment_transactions WHERE ref_type='carga_masiva_desconocida') THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO SN3: la fila sin clasificar persiste';
  END IF;
  PERFORM f_check_treasury_saldo('40000000-0000-0000-0000-000000000001',
           '10000000-0000-0000-0000-000000000001', 'CUP', 0);
  RAISE NOTICE 'OK S-N3 rollback íntegro: ámbito conciliable de nuevo';
END $$;

\echo '══ S-N4: movimiento ELECTRÓNICO no incrementa ni reduce el efectivo físico'
DO $$
DECLARE v_antes numeric(14,2); v_despues numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)
    INTO v_antes FROM payment_transactions
   WHERE cash_account_id='40000000-0000-0000-0000-000000000001' AND currency='CUP'
     AND payment_method='cash' AND ref_type <> 'cash_transfer';
  INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
           currency, ref_type, ref_id, cash_account_id)
  VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'in', 'zelle',
          9999, 'CUP', 'sale', NULL, '40000000-0000-0000-0000-000000000001');  -- zelle CON titular
  SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)
    INTO v_despues FROM payment_transactions
   WHERE cash_account_id='40000000-0000-0000-0000-000000000001' AND currency='CUP'
     AND payment_method='cash' AND ref_type <> 'cash_transfer';
  IF v_antes <> v_despues THEN
    RAISE EXCEPTION 'S-N4 FALLO: el efectivo físico cambió % → %', v_antes, v_despues;
  END IF;
  RAISE NOTICE 'OK S-N4 el electrónico no altera el efectivo físico (%)', v_despues;
  DELETE FROM payment_transactions WHERE payment_method='zelle' AND amount=9999
    AND ref_type='sale';   -- limpieza del arnés (fila electrónica de prueba, sin titular financiero)
END $$;

-- ═════════ MISIÓN 009 · IDEMPOTENCIA con HUELLA (D.22.4) ══════════════════════

\echo '══ I-N1: misma clave, IMPORTE distinto ⇒ ERR_IDEMPOTENCY_KEY_REUSE'
DO $$
BEGIN
  BEGIN
    PERFORM f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             2500, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-T1');
    RAISE EXCEPTION 'NO_RECHAZADA IN1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_IDEMPOTENCY_KEY_REUSE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK I-N1 clave reutilizada con importe distinto rechazada: %', SQLERRM;
  END;
  IF (SELECT count(*) FROM cash_transfers WHERE idempotency_key='idem-T1') <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO IN1: idem-T1 duplicada';
  END IF;
END $$;

\echo '══ I-N2: misma clave, MONEDA distinta ⇒ ERR_IDEMPOTENCY_KEY_REUSE'
DO $$
BEGIN
  BEGIN
    PERFORM f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             2000, 'USD', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-T1');
    RAISE EXCEPTION 'NO_RECHAZADA IN2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_IDEMPOTENCY_KEY_REUSE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK I-N2 clave reutilizada con moneda distinta rechazada: %', SQLERRM;
  END;
END $$;

\echo '══ I-N3: misma clave, ORIGEN distinto ⇒ ERR_IDEMPOTENCY_KEY_REUSE'
DO $$
BEGIN
  BEGIN
    PERFORM f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000002', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             2000, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-T1');
    RAISE EXCEPTION 'NO_RECHAZADA IN3';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_IDEMPOTENCY_KEY_REUSE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK I-N3 clave reutilizada con origen distinto rechazada: %', SQLERRM;
  END;
END $$;

\echo '══ I-N4: misma clave, DESTINO distinto ⇒ ERR_IDEMPOTENCY_KEY_REUSE'
DO $$
BEGIN
  BEGIN
    PERFORM f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             NULL, '40000000-0000-0000-0000-000000000001',
             2000, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', 'idem-T1');
    RAISE EXCEPTION 'NO_RECHAZADA IN4';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_IDEMPOTENCY_KEY_REUSE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK I-N4 clave reutilizada con destino distinto rechazada: %', SQLERRM;
  END;
END $$;

\echo '══ I-N5: misma clave, TIENDA distinta ⇒ ERR_IDEMPOTENCY_KEY_REUSE'
DO $$
BEGIN
  BEGIN
    PERFORM f_request_cash_transfer('10000000-0000-0000-0000-000000000002',
             '30000000-0000-0000-0000-000000000003', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             2000, 'CUP', '20000000-0000-0000-0000-000000000006',
             '20000000-0000-0000-0000-000000000006', 'idem-T1');
    RAISE EXCEPTION 'NO_RECHAZADA IN5';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_IDEMPOTENCY_KEY_REUSE%' THEN RAISE; END IF;
    RAISE NOTICE 'OK I-N5 clave reutilizada con tienda distinta rechazada: %', SQLERRM;
  END;
END $$;

\echo '══ I-N6: sin clave de idempotencia ⇒ ERR_IDEMPOTENCY_KEY_REQUIRED (política: obligatoria)'
DO $$
BEGIN
  BEGIN
    PERFORM f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', NULL,
             '30000000-0000-0000-0000-000000000002', NULL,
             2000, 'CUP', '20000000-0000-0000-0000-000000000001',
             '20000000-0000-0000-0000-000000000001', NULL);
    RAISE EXCEPTION 'NO_RECHAZADA IN6';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_IDEMPOTENCY_KEY_REQUIRED%' THEN RAISE; END IF;
    RAISE NOTICE 'OK I-N6 solicitud sin clave rechazada (política D.22.4): %', SQLERRM;
  END;
END $$;

-- ═════════ MISIÓN 009 · SESIÓN FINANCIERA vs RESPONSABLE (D.22.5) ═════════════

\echo '══ A-N1: entrega desde sesión por actor ajeno (no titular, no transportista) ⇒ rechazo'
DO $$
DECLARE v_t uuid; v_legs int;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-AN1') INTO v_t;
  BEGIN
    PERFORM f_deliver_cash_transfer(v_t, '20000000-0000-0000-0000-000000000004',
             '50000000-0000-0000-0000-000000000001', NULL);   -- L no es titular de SS_G1 ni transportista
    RAISE EXCEPTION 'NO_RECHAZADA AN1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_DELIVER_ACTOR_UNAUTHORIZED%' THEN RAISE; END IF;
    RAISE NOTICE 'OK A-N1 entrega por actor ajeno rechazada (decisión B): %', SQLERRM;
  END;
  SELECT count(*) INTO v_legs FROM payment_transactions
   WHERE ref_type='cash_transfer' AND ref_id=v_t;
  IF v_legs <> 0 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO AN1: quedó una pierna'; END IF;
END $$;

\echo '══ A-N2: recepción en sesión por NO-titular ⇒ ERR_ACTOR_NOT_SESSION_OWNER'
DO $$
DECLARE v_t uuid;
BEGIN
  SELECT f_request_cash_transfer('10000000-0000-0000-0000-000000000001',
           '30000000-0000-0000-0000-000000000001', NULL,
           '30000000-0000-0000-0000-000000000002', NULL,
           2000, 'CUP', '20000000-0000-0000-0000-000000000001',
           '20000000-0000-0000-0000-000000000001', 'idem-AN2') INTO v_t;
  BEGIN
    PERFORM f_deliver_cash_transfer(v_t, '20000000-0000-0000-0000-000000000002',
             '50000000-0000-0000-0000-000000000001', NULL);
    PERFORM f_receive_cash_transfer(v_t, '20000000-0000-0000-0000-000000000004',
             '50000000-0000-0000-0000-000000000002', NULL);   -- L recibe en SS_G2 (titular X)
    RAISE EXCEPTION 'NO_RECHAZADA AN2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_ACTOR_NOT_SESSION_OWNER%' THEN RAISE; END IF;
    RAISE NOTICE 'OK A-N2 recepción por no-titular rechazada (decisión B): %', SQLERRM;
  END;
  -- rollback íntegro: la subtransacción revierte TAMBIÉN la entrega previa
  IF (SELECT count(*) FROM payment_transactions
       WHERE ref_type='cash_transfer' AND ref_id=v_t) <> 0
     OR (SELECT status FROM cash_transfers WHERE id=v_t) <> 'solicitada' THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETO AN2: la recepción fallida dejó residuo';
  END IF;
END $$;

-- ═════════ MISIÓN 009 · CONTINUIDAD DE CUSTODIA (N26-N28) ═════════════════════
-- N29 (concurrencia) se ejecuta con DOS conexiones reales en la fase de
-- concurrencia del runner; N30/N31/N32/N33/N34 arriba.

\echo '══ N26: custodio previo incorrecto ⇒ ERR_CUSTODY_PREV_MISMATCH'
DO $$
DECLARE v_t uuid; v_ultimo_cust uuid; v_n int;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
  SELECT new_custodian_user_id INTO v_ultimo_cust FROM cash_transfer_custody_events
   WHERE transfer_id=v_t ORDER BY event_seq DESC LIMIT 1;   -- custodio vigente real
  BEGIN
    PERFORM f_create_custody_event(v_t,
             (CASE WHEN v_ultimo_cust = '20000000-0000-0000-0000-000000000005'::uuid
                   THEN '20000000-0000-0000-0000-000000000004'::uuid
                   ELSE '20000000-0000-0000-0000-000000000005'::uuid END),
             '20000000-0000-0000-0000-000000000002'::uuid,
             '20000000-0000-0000-0000-000000000001'::uuid, NULL, 'custodio previo falso');
    RAISE EXCEPTION 'NO_RECHAZADA N26';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_CUSTODY_PREV_MISMATCH%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N26 custodio previo incorrecto rechazado: %', SQLERRM;
  END;
  SELECT count(*) INTO v_n FROM cash_transfer_custody_events WHERE transfer_id=v_t;
  IF v_n <> 2 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N26: T1 tiene % eventos', v_n; END IF;
END $$;

\echo '══ N27: secuencia con salto (INSERT directo event_seq=99) ⇒ ERR_CUSTODY_SEQ_GAP'
DO $$
DECLARE v_t uuid; v_n int;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
  BEGIN
    INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
             previous_custodian_user_id, new_custodian_user_id, changed_by, reason)
    VALUES (v_t, 99,
            (SELECT id FROM cash_transfer_custody_events WHERE transfer_id=v_t
              ORDER BY event_seq DESC LIMIT 1),
            '20000000-0000-0000-0000-000000000002',
            '20000000-0000-0000-0000-000000000005',
            '20000000-0000-0000-0000-000000000001', 'salto de secuencia');
    RAISE EXCEPTION 'NO_RECHAZADA N27';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_CUSTODY_SEQ_GAP%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N27 salto de secuencia rechazado (trigger continuidad): %', SQLERRM;
  END;
  SELECT count(*) INTO v_n FROM cash_transfer_custody_events WHERE transfer_id=v_t;
  IF v_n <> 2 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N27: T1 tiene % eventos', v_n; END IF;
END $$;

\echo '══ N28: previous_event_id que NO es el último evento ⇒ ERR_CUSTODY_PREV_NOT_LAST'
DO $$
DECLARE v_t uuid; v_primero uuid; v_n int;
BEGIN
  v_t := (SELECT id FROM cash_transfers WHERE idempotency_key='idem-T1');
  SELECT id INTO v_primero FROM cash_transfer_custody_events
   WHERE transfer_id=v_t AND event_seq=1;
  BEGIN
    INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
             previous_custodian_user_id, new_custodian_user_id, changed_by, reason)
    VALUES (v_t, 3, v_primero, '20000000-0000-0000-0000-000000000002',
            '20000000-0000-0000-0000-000000000005',
            '20000000-0000-0000-0000-000000000001', 'previo no es el último');
    RAISE EXCEPTION 'NO_RECHAZADA N28';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'NO_RECHAZADA%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'ERR_CUSTODY_PREV_NOT_LAST%' THEN RAISE; END IF;
    RAISE NOTICE 'OK N28 previous_event_id ajeno al último rechazado: %', SQLERRM;
  END;
  SELECT count(*) INTO v_n FROM cash_transfer_custody_events WHERE transfer_id=v_t;
  IF v_n <> 2 THEN RAISE EXCEPTION 'ROLLBACK_INCOMPLETO N28: T1 tiene % eventos', v_n; END IF;
END $$;

\echo '══ VERIFICACIÓN DE ROLLBACK ÍNTEGRO: ningún intento negativo dejó piernas ni custodia'
SELECT bool_and(legs_total = 0 AND invalid_legs = 0) AS negativos_sin_residuo
  FROM v_cash_transfer_reconciliation
 WHERE transfer_id IN (SELECT id FROM cash_transfers
                        WHERE idempotency_key ~ '^idem-(N|S|I|A)');
SELECT bool_and(status = 'solicitada') AS negativos_en_estado_inicial
  FROM cash_transfers WHERE idempotency_key ~ '^idem-(N|S|I|A)';

\echo '══ Limpieza del arnés de pruebas (solo transferencias solicitada/sin piernas del expediente desechable)'
DELETE FROM cash_transfer_custody_events
 WHERE transfer_id IN (SELECT id FROM cash_transfers WHERE idempotency_key ~ '^idem-(N|S|I|A)');
DELETE FROM cash_transfers WHERE idempotency_key ~ '^idem-(N|S|I|A)';
