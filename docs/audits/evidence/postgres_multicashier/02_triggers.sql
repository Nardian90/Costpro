-- ═══════════════════════════════════════════════════════════════════════════════
-- 02_triggers.sql — Validación en DOS CAPAS (D.21.1) y funciones de especificación
-- (equivalentes RPC, SOLO para validar el diseño en esta base desechable; NO son
-- código del módulo). Se carga DESPUÉS de 03 (los triggers usan la vista V3).
--
--   INMEDIATO (por fila, no diferible):
--     · formato de datos (CHECKs de 00/01) · importe positivo (CHECK)
--     · existencia inicial de la transferencia · medio 'cash' · dirección in/out
--     · tienda de la pierna = tienda de la transferencia
--   DIFERIDO al COMMIT (CREATE CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED):
--     · coherencia FINAL cash_transfers ↔ piernas (V3: legs_total, out/in,
--       invalid_legs, identidad registrada, importe, moneda, tienda)
--     · titular físico definitivo con gaveta EXACTA y vigencia temporal
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── CAPA INMEDIATA (trigger ordinario AFTER: dispara al ejecutarse la fila) ────
-- Misión 009 (D.22.1): una fila vinculada a un traspaso es INMUTABLE en sus
-- columnas financieras/de identidad — la desvinculación o reasignación queda
-- prohibida aquí (inmediato) Y la capa diferida reconcilia también OLD (D.22.1).
CREATE FUNCTION fn_pt_immediate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_store uuid; v_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.ref_type = 'cash_transfer' OR NEW.ref_type = 'cash_transfer') THEN
    IF NEW.ref_type  IS DISTINCT FROM OLD.ref_type
       OR NEW.ref_id IS DISTINCT FROM OLD.ref_id
       OR NEW.direction   IS DISTINCT FROM OLD.direction
       OR NEW.amount      IS DISTINCT FROM OLD.amount
       OR NEW.currency    IS DISTINCT FROM OLD.currency
       OR NEW.store_id    IS DISTINCT FROM OLD.store_id
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.cash_closure_id IS DISTINCT FROM OLD.cash_closure_id
       OR NEW.cash_account_id IS DISTINCT FROM OLD.cash_account_id THEN
      RAISE EXCEPTION 'ERR_LEG_IMMUTABLE: fila % vinculada a un traspaso no admite '
        'cambios de ref_type/ref_id/direction/amount/currency/store_id/payment_method/titular',
        OLD.id;
    END IF;
  END IF;
  IF NEW.ref_type = 'cash_transfer' THEN
    IF NEW.ref_id IS NULL THEN
      RAISE EXCEPTION 'ERR_LEG_NO_TRANSFER: pierna % sin ref_id', NEW.id;
    END IF;
    SELECT store_id, status INTO v_store, v_status FROM cash_transfers WHERE id = NEW.ref_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_LEG_NO_TRANSFER: transferencia % inexistente', NEW.ref_id;
    END IF;
    IF NEW.payment_method <> 'cash' THEN
      RAISE EXCEPTION 'ERR_LEG_METHOD: pierna de traspaso exige efectivo, recibió %', NEW.payment_method;
    END IF;
    IF NEW.direction NOT IN ('out','in') THEN
      RAISE EXCEPTION 'ERR_LEG_DIRECTION: dirección % no válida para pierna', NEW.direction;
    END IF;
    IF NEW.store_id <> v_store THEN
      RAISE EXCEPTION 'ERR_LEG_STORE: pierna en tienda distinta a la transferencia';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER pt_immediate
AFTER INSERT OR UPDATE OF ref_type, ref_id, direction, payment_method, store_id,
                          amount, currency, cash_closure_id, cash_account_id
ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION fn_pt_immediate();

-- Append-only del LEDGER para piernas de traspaso (D.22.1): la anulación en
-- producción es una fila nueva con transaction_id; nunca DELETE físico.
-- (Atención: un BEFORE trigger que devuelva NULL CANCELA la fila en silencio;
-- por eso las filas ajenas a traspasos devuelven OLD para permitir su borrado.)
CREATE FUNCTION fn_pt_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.ref_type = 'cash_transfer' THEN
    RAISE EXCEPTION 'ERR_LEDGER_APPEND_ONLY: la pierna % de un traspaso no se elimina '
      '(la anulación es una fila nueva con transaction_id)', OLD.id;
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER pt_no_delete
BEFORE DELETE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION fn_pt_no_delete();

-- ── CAPA DIFERIDA (constraint triggers: validan el estado FINAL en COMMIT) ────
CREATE FUNCTION fn_reconcile_transfer_final(p_transfer uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM v_cash_transfer_reconciliation WHERE transfer_id = p_transfer;
  IF r.inconsistente THEN
    RAISE EXCEPTION 'ERR_RECONCILE_FINAL: transferencia % inconsistente al final '
      '(estado=%, legs_total=%, out_all=%, in_all=%, out_exactas=%, in_exactas=%, invalid_legs=%)',
      p_transfer, r.status, r.legs_total, r.out_all, r.in_all,
      r.out_exactas, r.in_exactas, r.invalid_legs;
  END IF;
END $$;

CREATE FUNCTION fn_ctr_legs_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP IN ('INSERT','UPDATE')) AND NEW.ref_type = 'cash_transfer' THEN
    PERFORM fn_reconcile_transfer_final(NEW.ref_id);
  END IF;
  -- D.22.1: el extremo ANTERIOR también queda protegido — un UPDATE que cambie
  -- ref_type/ref_id reconcilia la transferencia antigua; un DELETE la suya.
  IF TG_OP = 'UPDATE' AND OLD.ref_type = 'cash_transfer'
     AND (OLD.ref_id IS DISTINCT FROM NEW.ref_id
          OR OLD.ref_type IS DISTINCT FROM NEW.ref_type) THEN
    PERFORM fn_reconcile_transfer_final(OLD.ref_id);
  ELSIF TG_OP = 'DELETE' AND OLD.ref_type = 'cash_transfer' THEN
    PERFORM fn_reconcile_transfer_final(OLD.ref_id);
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ctr_legs_final
AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_ctr_legs_final();

CREATE FUNCTION fn_ctr_transfer_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_reconcile_transfer_final(NEW.id);
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ctr_transfer_final
AFTER INSERT OR UPDATE OF status, leg_out_payment_id, leg_in_payment_id,
                           sent_from_session_id, received_in_session_id,
                           received_in_account_id, return_in_session_id,
                           return_in_account_id
ON cash_transfers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_ctr_transfer_final();

-- ═══ Funciones de ESPECIFICACIÓN (equivalentes RPC; solo para esta validación) ═══

-- Evento de custodia (D.22.2): continuidad FORZADA, no confiada al llamante.
-- 1) serializa con FOR UPDATE sobre la transferencia (dos reasignaciones
--    concurrentes se ordenan aquí); 2) lee el último evento real; 3) el primer
--    evento no admite custodio previo declarado; 4) previous_event_id es SIEMPRE
--    el último evento real; 5) event_seq = último+1; 6) previous_custodian_user_id
--    DEBE coincidir con el custodio vigente del último evento.
CREATE FUNCTION f_create_custody_event(p_transfer uuid, p_prev_custodian uuid,
  p_new_custodian uuid, p_changed_by uuid, p_authorized_by uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_ct uuid; v_last_seq int; v_last_id uuid; v_last_cust uuid; v_seq int; v_new_id uuid;
BEGIN
  SELECT id INTO v_ct FROM cash_transfers WHERE id = p_transfer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NO_TRANSFER: transferencia % inexistente', p_transfer; END IF;
  SELECT event_seq, id, new_custodian_user_id INTO v_last_seq, v_last_id, v_last_cust
    FROM cash_transfer_custody_events
   WHERE transfer_id = p_transfer
   ORDER BY event_seq DESC LIMIT 1;
  IF v_last_id IS NULL THEN
    IF p_prev_custodian IS NOT NULL THEN
      RAISE EXCEPTION 'ERR_CUSTODY_FIRST_HAS_PREV: el evento inicial no admite custodio previo';
    END IF;
  ELSE
    IF p_prev_custodian IS NULL OR p_prev_custodian <> v_last_cust THEN
      RAISE EXCEPTION 'ERR_CUSTODY_PREV_MISMATCH: custodio previo declarado % no coincide '
        'con el vigente % del evento %', p_prev_custodian, v_last_cust, v_last_id;
    END IF;
  END IF;
  v_seq := COALESCE(v_last_seq, 0) + 1;
  INSERT INTO cash_transfer_custody_events(transfer_id, event_seq, previous_event_id,
           previous_custodian_user_id, new_custodian_user_id, changed_by,
           authorized_by, reason)
  VALUES (p_transfer, v_seq, v_last_id,
          CASE WHEN v_last_id IS NULL THEN NULL ELSE v_last_cust END,
          p_new_custodian, p_changed_by, p_authorized_by, p_reason)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END $$;

-- 1) SOLICITUD (D.22.4): idempotencia por CLAVE + HUELLA de parámetros.
--    Política: la clave es OBLIGATORIA para la operación financiera. Misma clave
--    y mismos parámetros ⇒ mismo id; misma clave con parámetros distintos ⇒
--    ERR_IDEMPOTENCY_KEY_REUSE. Concurrencia: INSERT ... ON CONFLICT DO NOTHING
--    (el ganador inserta); el perdedor bloquea con FOR UPDATE sobre la fila del
--    ganador y compara la huella; si el ganador hizo ROLLBACK, reintenta.
CREATE FUNCTION f_request_cash_transfer(p_store uuid, p_from_register uuid,
  p_from_account uuid, p_to_register uuid, p_to_account uuid,
  p_amount numeric, p_currency text, p_requested_by uuid, p_authorized_by uuid,
  p_idem text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_fp text; v_existing_id uuid; v_existing_fp text; v_attempt int;
BEGIN
  IF p_idem IS NULL OR p_idem = '' THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED: la clave de idempotencia es obligatoria';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'ERR_AMOUNT: importe positivo requerido'; END IF;
  v_fp := md5(p_store::text || '|' || COALESCE(p_from_register::text,'') || '|'
              || COALESCE(p_from_account::text,'') || '|' || COALESCE(p_to_register::text,'')
              || '|' || COALESCE(p_to_account::text,'') || '|' || p_amount::text || '|'
              || p_currency || '|' || p_requested_by::text);
  FOR v_attempt IN 1..2 LOOP
    INSERT INTO cash_transfers(store_id, amount, currency, status,
             from_register_id, from_account_id, to_register_id, to_account_id,
             requested_by, authorized_by, idempotency_key, request_fingerprint)
    VALUES (p_store, p_amount, p_currency, 'solicitada',
            p_from_register, p_from_account, p_to_register, p_to_account,
            p_requested_by, COALESCE(p_authorized_by, p_requested_by), p_idem, v_fp)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_id;
    EXIT WHEN v_id IS NOT NULL;
    SELECT id, request_fingerprint INTO v_existing_id, v_existing_fp
      FROM cash_transfers WHERE idempotency_key = p_idem FOR UPDATE;
    IF FOUND THEN
      IF v_existing_fp IS DISTINCT FROM v_fp THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: clave % ya usada con parámetros distintos',
          p_idem;
      END IF;
      RETURN v_existing_id;
    END IF;
    -- el ganador de la carrera hizo ROLLBACK: reintenta el INSERT
  END LOOP;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;   -- éxito en la primera pasada
  RAISE EXCEPTION 'ERR_IDEMPOTENCY_UNRESOLVED: no se resolvió la clave % tras reintento', p_idem;
END $$;

-- ── D.22.3: SALDO DE TESORERÍA fail-closed por ÁMBITO (especificación de D.20.3,
--    ejecutada por primera vez en SQL real) ────────────────────────────────────
CREATE FUNCTION f_check_treasury_saldo(p_account uuid, p_store uuid,
  p_currency text, p_amount numeric) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_saldo numeric(14,2);
BEGIN
  -- Paso 0. Serialización: bloquear la fila de la cuenta (dos entregas
  -- simultáneas jamás leen el mismo saldo).
  PERFORM 1 FROM cash_accounts WHERE id = p_account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NO_ACCOUNT: cuenta % inexistente', p_account; END IF;
  -- Paso 1. Validación GLOBAL del ámbito (tienda + moneda, NO por holder):
  -- un movimiento físico sin titular o sin clasificar en el ámbito impide
  -- toda conciliación segura (incluye filas huérfanas, que no tienen holder_id).
  IF EXISTS (
    SELECT 1 FROM v_cash_ledger_classification v
     WHERE v.store_id = p_store
       AND v.currency = p_currency
       AND v.model_scope = 'multicaja'
       AND v.payment_method = 'cash'
       AND (v.holder_id IS NULL OR v.class IN ('sin_titular','sin_clasificar'))
  ) THEN
    RAISE EXCEPTION 'ERR_LEDGER_UNCLASSIFIED: movimiento físico sin titular o sin clasificar '
      'en el ámbito tienda=% moneda=%', p_store, p_currency;
  END IF;
  -- Paso 2. Saldo EXCLUSIVO de la cuenta y de UNA moneda: SUM(sign*amount);
  -- nunca mezcla de nominales; sin electrónicos ni históricos preactivación.
  SELECT COALESCE(SUM(v.sign * v.amount), 0) INTO v_saldo
    FROM v_cash_ledger_classification v
   WHERE v.holder_type = 'cuenta' AND v.holder_id = p_account
     AND v.currency = p_currency
     AND v.model_scope = 'multicaja'
     AND v.class NOT IN ('electronico','historico_sin_titular');
  -- Paso 3. Saldo suficiente (el importe EXACTO pasa: v_saldo >= p_amount).
  IF v_saldo < p_amount THEN
    RAISE EXCEPTION 'ERR_SALDO_INSUFICIENTE: saldo=% requerido=%', v_saldo, p_amount;
  END IF;
END $$;

-- 2) ENTREGA (secuencia D.21.1): pierna OUT → estado+referencias → custodia →
--    validación diferida forzada (SET CONSTRAINTS ... IMMEDIATE) → COMMIT externo.
CREATE FUNCTION f_deliver_cash_transfer(p_transfer uuid, p_delivered_by uuid,
  p_session uuid, p_carrier uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE ct record; v_leg uuid; v_owner uuid;
BEGIN
  -- Semántica SET CONSTRAINTS (D.21.1): el modo IMMEDIATE fijado por otra función
  -- en la MISMA transacción persiste; se restaura DEFERRED para no validar estados
  -- transitorios entre sentencias, y se fuerza IMMEDIATE solo al final.
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final DEFERRED;
  SELECT * INTO ct FROM cash_transfers WHERE id = p_transfer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NO_TRANSFER'; END IF;
  IF ct.status = 'entregada' AND ct.leg_out_payment_id IS NOT NULL THEN
    RETURN ct.leg_out_payment_id;                       -- reintento idempotente
  END IF;
  IF ct.status <> 'solicitada' THEN
    RAISE EXCEPTION 'ERR_STATE: entregada exige solicitada, estado=%', ct.status;
  END IF;
  -- D.22.3: control de saldo de tesorería (D.20.3) en la MISMA transacción,
  -- ANTES de escribir la pierna; con lock de la cuenta (serialización).
  IF ct.from_account_id IS NOT NULL THEN
    PERFORM f_check_treasury_saldo(ct.from_account_id, ct.store_id, ct.currency, ct.amount);
  END IF;
  -- Autorización de la sesión emisora: abierta AHORA (vigencia actual de la RPC)
  IF ct.from_register_id IS NOT NULL THEN
    IF p_session IS NULL OR NOT EXISTS (
      SELECT 1 FROM cash_closures cc
       WHERE cc.id = p_session AND cc.cash_register_id = ct.from_register_id
         AND cc.closed_at IS NULL) THEN
      RAISE EXCEPTION 'ERR_SESSION_NOT_OPEN: sesión emisora no abierta en la gaveta de origen';
    END IF;
    -- D.22.5 (decisión B): el actor puede diferir del titular de la sesión, pero
    -- debe ser el TITULAR de la sesión emisora o el TRANSPORTISTA en custodia.
    SELECT user_id INTO v_owner FROM cash_closures WHERE id = p_session;
    IF p_delivered_by IS DISTINCT FROM v_owner
       AND (p_carrier IS NULL OR p_delivered_by IS DISTINCT FROM p_carrier) THEN
      RAISE EXCEPTION 'ERR_DELIVER_ACTOR_UNAUTHORIZED: el actor % no es el titular de la '
        'sesión emisora ni el transportista registrado', p_delivered_by;
    END IF;
  END IF;
  v_leg := gen_random_uuid();                           -- 1) UUID previsto
  INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
           currency, at, ref_type, ref_id, cash_closure_id, cash_account_id, created_by)
  VALUES (v_leg, ct.store_id, 'out', 'cash', ct.amount, ct.currency, now(),
          'cash_transfer', p_transfer,                       -- 2) fila OUT
          CASE WHEN ct.from_register_id IS NOT NULL THEN p_session END,
          CASE WHEN ct.from_account_id  IS NOT NULL THEN ct.from_account_id END,
          p_delivered_by);                                   --    titular correcto
  UPDATE cash_transfers                                      -- 3)+4) estado y pierna
     SET status = 'entregada', leg_out_payment_id = v_leg,
         sent_from_session_id =
           CASE WHEN ct.from_register_id IS NOT NULL THEN p_session END,
         delivered_by = p_delivered_by, carrier_user_id = p_carrier,
         updated_at = now()                                  -- 5) responsable entrega
   WHERE id = p_transfer;
  PERFORM f_create_custody_event(p_transfer, NULL,           -- 6) custodia inicial
           COALESCE(p_carrier, p_delivered_by),              --    poseedor físico real
           p_delivered_by, ct.authorized_by, 'entrega física');
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;  -- 7) validación final
  RETURN v_leg;
END $$;

-- 3) RECEPCIÓN: pierna IN → estado+referencias → custodia al receptor → final.
CREATE FUNCTION f_receive_cash_transfer(p_transfer uuid, p_receiver uuid,
  p_session uuid, p_account uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE ct record; v_leg uuid; v_prev_cust uuid; v_owner uuid;
BEGIN
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final DEFERRED;  -- ver nota en f_deliver
  SELECT * INTO ct FROM cash_transfers WHERE id = p_transfer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NO_TRANSFER'; END IF;
  IF ct.status <> 'entregada' THEN
    RAISE EXCEPTION 'ERR_STATE: recepción exige entregada, estado=%', ct.status;
  END IF;
  -- Vigencia ACTUAL: la sesión debe estar abierta al confirmar (RPC), y la V3
  -- revalida la vigencia HISTÓRICA al COMMIT (cerrada después sigue siendo válida).
  IF ct.to_register_id IS NOT NULL THEN
    IF p_session IS NULL OR NOT EXISTS (
      SELECT 1 FROM cash_closures cc
       WHERE cc.id = p_session AND cc.cash_register_id = ct.to_register_id
         AND cc.store_id = ct.store_id AND cc.closed_at IS NULL) THEN
      RAISE EXCEPTION 'ERR_SESSION_NOT_OPEN: sesión receptora no abierta en la gaveta destino';
    END IF;
    -- D.22.5 (decisión B): en la RECEPCIÓN el actor DEBE ser el titular de la
    -- sesión receptora — el dinero entra a SU gaveta; otro receptor falsificaría
    -- la atribución (el titular y el actor se conservan por separado en auditoría).
    SELECT user_id INTO v_owner FROM cash_closures WHERE id = p_session;
    IF v_owner IS DISTINCT FROM p_receiver THEN
      RAISE EXCEPTION 'ERR_ACTOR_NOT_SESSION_OWNER: el receptor % no es el titular % '
        'de la sesión receptora', p_receiver, v_owner;
    END IF;
  END IF;
  v_leg := gen_random_uuid();
  INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
           currency, at, ref_type, ref_id, cash_closure_id, cash_account_id, created_by)
  VALUES (v_leg, ct.store_id, 'in', 'cash', ct.amount, ct.currency, now(),
          'cash_transfer', p_transfer,
          CASE WHEN ct.to_register_id IS NOT NULL THEN p_session END,
          CASE WHEN ct.to_account_id  IS NOT NULL THEN p_account END,
          p_receiver);
  UPDATE cash_transfers
     SET status = CASE WHEN ct.to_register_id IS NOT NULL THEN 'recibida'
                       ELSE 'recibida_en_cuenta' END,
         leg_in_payment_id = v_leg,
         received_in_session_id = CASE WHEN ct.to_register_id IS NOT NULL THEN p_session END,
         received_in_account_id = CASE WHEN ct.to_account_id  IS NOT NULL THEN p_account END,
         received_by = p_receiver, updated_at = now()
   WHERE id = p_transfer;
  SELECT new_custodian_user_id INTO v_prev_cust
    FROM cash_transfer_custody_events
   WHERE transfer_id = p_transfer ORDER BY event_seq DESC LIMIT 1;
  PERFORM f_create_custody_event(p_transfer, v_prev_cust, p_receiver,
           p_receiver, ct.authorized_by, 'recepción física');
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
  RETURN v_leg;
END $$;

-- 4) SOLICITUD DE DEVOLUCIÓN: desde 'entregada' (esc. E del diseño: el receptor
--    se niega ANTES de confirmar; la matriz exige pierna IN nula en en_devolucion).
CREATE FUNCTION f_request_return_cash_transfer(p_transfer uuid, p_by uuid, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ct record;
BEGIN
  SELECT * INTO ct FROM cash_transfers WHERE id = p_transfer FOR UPDATE;
  IF ct.status <> 'entregada' THEN
    RAISE EXCEPTION 'ERR_STATE: solicitud de devolución exige entregada, estado=%', ct.status;
  END IF;
  UPDATE cash_transfers SET status = 'en_devolucion', updated_at = now()
   WHERE id = p_transfer;
  -- La custodia NO cambia al solicitar la devolución (el dinero sigue con quien lo recibió);
  -- el cambio de custodia se registra en el retorno físico (f_return_cash_transfer).
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
END $$;

-- 5) DEVOLUCIÓN al ORIGEN: pierna IN con titular de origen → 'devuelta' → final.
CREATE FUNCTION f_return_cash_transfer(p_transfer uuid, p_receiver uuid,
  p_session uuid, p_account uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE ct record; v_leg uuid; v_prev_cust uuid; v_owner uuid;
BEGIN
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final DEFERRED;  -- ver nota en f_deliver
  SELECT * INTO ct FROM cash_transfers WHERE id = p_transfer FOR UPDATE;
  IF ct.status <> 'en_devolucion' THEN
    RAISE EXCEPTION 'ERR_STATE: devolución física exige en_devolucion, estado=%', ct.status;
  END IF;
  IF ct.from_register_id IS NOT NULL THEN
    IF p_session IS NULL OR NOT EXISTS (
      SELECT 1 FROM cash_closures cc
       WHERE cc.id = p_session AND cc.cash_register_id = ct.from_register_id
         AND cc.store_id = ct.store_id AND cc.closed_at IS NULL) THEN
      RAISE EXCEPTION 'ERR_SESSION_NOT_OPEN: sesión de origen no abierta para el retorno';
    END IF;
    -- D.22.5 (decisión B): el retorno entra a la gaveta de ORIGEN — el receptor
    -- debe ser su titular (misma regla que la recepción).
    SELECT user_id INTO v_owner FROM cash_closures WHERE id = p_session;
    IF v_owner IS DISTINCT FROM p_receiver THEN
      RAISE EXCEPTION 'ERR_ACTOR_NOT_SESSION_OWNER: el receptor del retorno % no es el '
        'titular % de la sesión de origen', p_receiver, v_owner;
    END IF;
  END IF;
  v_leg := gen_random_uuid();
  INSERT INTO payment_transactions(id, store_id, direction, payment_method, amount,
           currency, at, ref_type, ref_id, cash_closure_id, cash_account_id, created_by)
  VALUES (v_leg, ct.store_id, 'in', 'cash', ct.amount, ct.currency, now(),
          'cash_transfer', p_transfer,
          CASE WHEN ct.from_register_id IS NOT NULL THEN p_session END,
          CASE WHEN ct.from_account_id  IS NOT NULL THEN p_account END,
          p_receiver);
  UPDATE cash_transfers
     SET status = 'devuelta', leg_in_payment_id = v_leg,
         return_in_session_id = CASE WHEN ct.from_register_id IS NOT NULL THEN p_session END,
         return_in_account_id = CASE WHEN ct.from_account_id  IS NOT NULL THEN p_account END,
         updated_at = now()
   WHERE id = p_transfer;
  SELECT new_custodian_user_id INTO v_prev_cust FROM cash_transfer_custody_events
   WHERE transfer_id = p_transfer ORDER BY event_seq DESC LIMIT 1;
  PERFORM f_create_custody_event(p_transfer, v_prev_cust, p_receiver,
           p_receiver, ct.authorized_by, 'cierre de custodia: retorno al origen');
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
  RETURN v_leg;
END $$;

-- 6) CANCELACIÓN antes de entregar (sin piernas).
CREATE FUNCTION f_cancel_cash_transfer(p_transfer uuid, p_by uuid, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ct record;
BEGIN
  SELECT * INTO ct FROM cash_transfers WHERE id = p_transfer FOR UPDATE;
  IF ct.status <> 'solicitada' THEN
    RAISE EXCEPTION 'ERR_STATE: cancelación exige solicitada, estado=%', ct.status;
  END IF;
  UPDATE cash_transfers SET status = 'cancelada', updated_at = now() WHERE id = p_transfer;
  SET CONSTRAINTS ctr_legs_final, ctr_transfer_final IMMEDIATE;
END $$;

-- ── Append-only de la custodia (D.20.4/D.21.2): inmutabilidad reforzada ───────
CREATE FUNCTION fn_custody_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ERR_CUSTODY_APPEND_ONLY: los eventos de custodia son inmutables';
END $$;

CREATE TRIGGER ctr_custody_append_only
BEFORE UPDATE OR DELETE ON cash_transfer_custody_events
FOR EACH ROW EXECUTE FUNCTION fn_custody_append_only();

-- ── CONTINUIDAD de la custodia (misión 009, D.22.2): se aplica a TODO INSERT,
-- incluso directo (no solo a la función): serializa con FOR UPDATE sobre la
-- transferencia y exige seq = último+1, previous_event_id = último evento real
-- y previous_custodian_user_id = custodio vigente.
CREATE FUNCTION fn_custody_continuity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_ct uuid; v_last_seq int; v_last_id uuid; v_last_cust uuid;
BEGIN
  SELECT id INTO v_ct FROM cash_transfers WHERE id = NEW.transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_NO_TRANSFER: evento para transferencia % inexistente', NEW.transfer_id;
  END IF;
  SELECT event_seq, id, new_custodian_user_id INTO v_last_seq, v_last_id, v_last_cust
    FROM cash_transfer_custody_events
   WHERE transfer_id = NEW.transfer_id
   ORDER BY event_seq DESC LIMIT 1;
  IF v_last_id IS NULL THEN
    IF NEW.event_seq <> 1 OR NEW.previous_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'ERR_CUSTODY_FIRST_INVALID: el primer evento debe ser seq=1 sin previo';
    END IF;
  ELSE
    IF NEW.event_seq <> v_last_seq + 1 THEN
      RAISE EXCEPTION 'ERR_CUSTODY_SEQ_GAP: event_seq % debía ser %',
        NEW.event_seq, v_last_seq + 1;
    END IF;
    IF NEW.previous_event_id IS DISTINCT FROM v_last_id THEN
      RAISE EXCEPTION 'ERR_CUSTODY_PREV_NOT_LAST: previous_event_id no es el último evento %',
        v_last_id;
    END IF;
    IF NEW.previous_custodian_user_id IS DISTINCT FROM v_last_cust THEN
      RAISE EXCEPTION 'ERR_CUSTODY_PREV_MISMATCH: custodio previo % no coincide con el vigente %',
        NEW.previous_custodian_user_id, v_last_cust;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ctr_custody_continuity
BEFORE INSERT ON cash_transfer_custody_events
FOR EACH ROW EXECUTE FUNCTION fn_custody_continuity();
