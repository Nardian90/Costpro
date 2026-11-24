-- ============================================================================
-- CP-OPS-ENERVIDA — Integridad de reportes, terceros, recepciones y CxP
-- Migración 1/4: Reversión explícita de pagos a proveedores.
--
-- Contexto (diagnóstico contra producción, SOLO LECTURA, 2026-11-24):
--   * SRV-20261123-00146 (Aduana, 1.800 CUP) se creó 23/11 16:34 con pago en
--     efectivo y se ANULÓ 18 segundos después; su fila de payment_transactions
--     sobrevivió sin contra-fila ni reversión → el Reporte Entrega siguió
--     restando 1.800 que la operación real (re-creada como SRV-20261123-00147)
--     ya restaba por su propio pago → faltante artificial de 1.800 CUP.
--   * El botón «Anular pago» de Recepciones/CxP/Servicios hace DELETE físico
--     y la BD lo prohíbe por diseño (PT007): no existía flujo de reversión.
--
-- Regla contable que implementa esta migración (misión §2 y §5):
--   1. Nunca se borra ni se edita un pago confirmado: la reversión es una
--      FILA CONTRARIA (direction='reversal', reverses_payment_id=original)
--      con su fecha, usuario, motivo y asiento compensatorio (fin_entries
--      event='anulacion', reversal_of) — mismo patrón que devoluciones.
--   2. La anulación de un SERVICIO revierte sus pagos con contra-filas.
--   3. La cancelación de un BORRADOR con pagos también los revierte.
--   4. El saldo pagado de un documento NETEA original+reversal
--      (update_payment_status): la obligación queda restablecida.
--   5. Un pago realmente ejecutado NO se excluye por un cambio administrativo
--      posterior del PAGO: la fila original permanece; la reversión es otra
--      fila con su propia fecha. Los documentos ANULADOS (servicio
--      voided/cancelled, recepción voided/reversed) no generan efectos
--      económicos activos (elegibilidad — migración 2).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1. Esquema: direction admite 'reversal' + columna reverses_payment_id.
-- ---------------------------------------------------------------------------

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS direction_check;

-- El nombre vivo de la restricción en BD (creada inline en 20261021000001):
-- se elimina por SU nombre real para que la nueva (con 'reversal') sea la única.
ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_direction_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT direction_check
  CHECK (direction IN ('in', 'out', 'refund', 'recovery', 'reversal'));

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS reverses_payment_id uuid;

-- Una sola reversión por pago original (idempotencia estructural: el doble
-- clic y el reintento no pueden crear dos contra-filas del mismo pago).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_reversal_origin
  ON public.payment_transactions (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_txn_reverses
  ON public.payment_transactions (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

COMMENT ON COLUMN public.payment_transactions.reverses_payment_id IS
  'CP-OPS-ENERVIDA: pago original que esta fila revierte (direction=''reversal''). Nunca se borra el original (PT007).';

-- ---------------------------------------------------------------------------
-- §2. update_payment_status — el saldo pagado NETEA las reversiones.
--    (Reemisión íntegra de 20260712000001 §4 con el neteo por direction.)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_type TEXT := NEW.ref_type;
  v_ref_id UUID := NEW.ref_id;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
BEGIN
  IF v_ref_type = 'receipt' THEN
    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    -- CP-OPS-ENERVIDA: las contra-filas (direction='reversal') RESTAN del
    -- saldo pagado — la obligación queda restablecida por el importe revertido.
    SELECT COALESCE(SUM(
             CASE WHEN COALESCE(direction, 'in') = 'reversal' THEN -amount_cup
                  ELSE amount_cup END), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'receipt' AND ref_id = v_ref_id
         AND COALESCE(direction, 'in') <> 'reversal'
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(
             CASE WHEN COALESCE(direction, 'in') = 'reversal' THEN -amount_cup
                  ELSE amount_cup END), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'service' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'service' AND ref_id = v_ref_id
         AND COALESCE(direction, 'in') <> 'reversal'
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_payment_status ON payment_transactions;
CREATE TRIGGER trg_update_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_payment_status();

-- ---------------------------------------------------------------------------
-- §3. fin_post_payment_annulment — asiento compensatorio de UN pago.
--    Variante por pago de fin_post_document_annulment (20261113120100 §6):
--    mismo patrón (entrada 'anulacion' enlazada por reversal_of, sentidos
--    invertidos, nunca UPDATE del histórico), filtrada por payment_ref.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fin_post_payment_annulment(
  p_doctype text, p_document_id uuid, p_payment_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  e record; m record; v_new uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));

  FOR e IN
    SELECT * FROM public.fin_entries
    WHERE document_type = p_doctype AND document_id = p_document_id
      AND payment_ref = p_payment_id
      AND status = 'posted' AND event = 'pago'
    ORDER BY posted_at
  LOOP
    -- Idempotente: ¿ya tiene compensatorio? (doble clic, reintento, y el
    -- annulment integral del documento que llega primero).
    IF EXISTS (SELECT 1 FROM public.fin_entries x WHERE x.reversal_of = e.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, payment_ref,
      economic_date, rule_version_id, movements_snapshot, reversal_of, description, created_by)
    VALUES (
      e.store_id, e.document_type, e.document_id, e.document_number, 'anulacion', e.payment_ref,
      e.economic_date, e.rule_version_id, e.movements_snapshot, e.id,
      'Anulación de pago: ' || coalesce(e.description, ''), e.created_by)
    RETURNING id INTO v_new;

    FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = e.id LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, traza)
      VALUES (
        v_new, m.store_id, m.category_code,
        CASE WHEN m.sense = 'debito' THEN 'credito' ELSE 'debito' END,
        m.amount, m.currency, m.exchange_rate, m.economic_date, m.document_number,
        'Anulación de pago: ' || coalesce(m.description, ''), m.currency_origin,
        m.traza || jsonb_build_object('anulacion_de', m.id));
    END LOOP;

    RETURN v_new;
  END LOOP;

  RETURN NULL;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fin_post_payment_annulment(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_post_payment_annulment(text, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- §4. reverse_supplier_payment — RPC de reversión de pago de proveedor.
--    Anula el PAGO, no el documento: la recepción/servicio sigue confirmado,
--    su inventario y costo intactos; la obligación se restablece (neteo del
--    trigger §2); caja/banco recibe su contra-fila; el asiento 'pago' recibe
--    su compensatorio. Transaccional e idempotente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_supplier_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_operation_date timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_orig record;
  v_reversal_id uuid;
  v_existing_reversal_id uuid;
  v_doctype text;
  v_parent_status text;
  v_parent_number text;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_eff_date timestamptz := COALESCE(p_operation_date, NOW());
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('revpay:' || p_payment_id::text));

  SELECT * INTO v_orig FROM public.payment_transactions
  WHERE id = p_payment_id FOR UPDATE;
  IF v_orig.id IS NULL THEN
    RAISE EXCEPTION 'ERR_PAYMENT_NOT_FOUND: %', p_payment_id;
  END IF;
  IF v_orig.ref_type NOT IN ('receipt', 'service') THEN
    RAISE EXCEPTION 'ERR_REVERSAL_NOT_SUPPORTED: ref_type % (solo receipt|service)', v_orig.ref_type;
  END IF;
  IF COALESCE(v_orig.direction, 'in') <> 'in' THEN
    RAISE EXCEPTION 'ERR_PAYMENT_NOT_REVERSIBLE: la fila ya es una contra-fila (direction=%)', v_orig.direction;
  END IF;

  -- Idempotencia: una sola reversión por pago original (índice único §1).
  SELECT id INTO v_existing_reversal_id
  FROM public.payment_transactions
  WHERE reverses_payment_id = p_payment_id
  LIMIT 1;
  IF v_existing_reversal_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'idempotent',
      'reversal_payment_id', v_existing_reversal_id,
      'original_payment_id', p_payment_id
    );
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, v_orig.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(v_eff_date, v_orig.store_id);

  -- Documento padre: SOLO informativo/doctype — la reversión del pago NO
  -- anula el documento (misión §5: no confundir anular pago con anular
  -- recepción). Se admite también sobre padres ya anulados (limpieza de
  -- anomalías históricas: pagos huérfanos de documentos anulados).
  IF v_orig.ref_type = 'receipt' THEN
    v_doctype := 'RECEPCION';
    SELECT status, COALESCE(document_number, reference_doc) INTO v_parent_status, v_parent_number
    FROM public.receipts WHERE id = v_orig.ref_id;
  ELSE
    v_doctype := 'SERVICIO_RECIBIDO';
    SELECT status, service_number INTO v_parent_status, v_parent_number
    FROM public.received_services WHERE id = v_orig.ref_id;
  END IF;

  -- Contra-fila: MISMO importe/medio/moneda/tasa del original, fecha de la
  -- reversión, usuario que la ejecuta, motivo trazable y clave idempotente.
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date, direction, reverses_payment_id
  ) VALUES (
    v_orig.store_id, v_orig.ref_type, v_orig.ref_id, v_orig.amount, v_orig.payment_method,
    v_orig.currency, v_orig.exchange_rate,
    'Reversión de pago' || CASE WHEN COALESCE(v_orig.reference, '') <> '' THEN ' · ' || v_orig.reference ELSE '' END,
    CASE
      WHEN v_reason <> '' THEN 'Reversión de pago ' || p_payment_id::text || ' — ' || v_reason
      ELSE 'Reversión de pago ' || p_payment_id::text
    END,
    v_caller_uid,
    'reversal:' || p_payment_id::text,
    v_eff_date,
    'reversal',
    p_payment_id
  ) RETURNING id INTO v_reversal_id;

  -- Asiento compensatorio del 'pago' original (nunca UPDATE del histórico).
  PERFORM public.fin_post_payment_annulment(v_doctype, v_orig.ref_id, p_payment_id);

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_orig.store_id, 'PAYMENT_REVERSED', 'payment_transactions', v_reversal_id,
    jsonb_build_object(
      'original_payment_id', p_payment_id,
      'ref_type', v_orig.ref_type,
      'ref_id', v_orig.ref_id,
      'document_number', v_parent_number,
      'amount', v_orig.amount,
      'currency', v_orig.currency,
      'amount_cup', v_orig.amount_cup,
      'payment_method', v_orig.payment_method,
      'reason', NULLIF(v_reason, ''),
      'parent_status_at_reversal', v_parent_status,
      'operation_date', v_eff_date
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'reversal_payment_id', v_reversal_id,
    'original_payment_id', p_payment_id,
    'parent_status', v_parent_status
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz) IS
  'CP-OPS-ENERVIDA §5: anula un PAGO de recepción/servicio con fila contraria + asiento compensatorio. El documento queda intacto (confirmado) y su obligación restablecida. Idempotente por (reverses_payment_id) e idempotency_key.';

-- ---------------------------------------------------------------------------
-- §5. register_supplier_payment — reemisión íntegra de la versión vigente
--    (20261121200000) con UN cambio: el saldo pagado NETEA contra-filas
--    (direction='reversal') para el overpay. Firma y contrato intactos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_doc_currency text;
  v_doc_rate numeric;
  v_doc_status text;
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_rate numeric := p_exchange_rate;
  v_store_rate numeric;
BEGIN
  -- ADN-009 (F2/§4): BLOQUEO COMPARTIDO del documento SIEMPRE primero.
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1, status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.receipts WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1), status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.received_services WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  IF p_ref_type = 'receipt' AND COALESCE(v_doc_status, 'active') IN ('voided', 'reversed') THEN
    RAISE EXCEPTION
      'ERR_RECEIPT_NOT_PAYABLE: la recepción está % y no admite pagos nuevos',
      v_doc_status;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'Moneda de pago no soportada: %', p_currency;
  END IF;
  IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'Medio de pago no soportado: %', p_payment_method;
  END IF;

  IF p_payment_method = 'external_transfer' AND p_currency NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION
      'ERR_COMBINACION_NO_SOPORTADA: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada',
      p_currency;
  END IF;

  IF p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active' THEN
    RAISE EXCEPTION
      'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: %)',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION
          'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1). Configúrela en Tasas o envíela con el pago.',
          p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE round(p_amount * v_rate, 2)
  END;

  -- R3: overpay en la MONEDA DEL DOCUMENTO. CP-OPS-ENERVIDA: el saldo pagado
  -- NETEA las contra-filas (direction='reversal' resta) — una obligación con
  -- pago revertido vuelve a admitir pagos por el importe restablecido.
  SELECT COALESCE(SUM(
         CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN
                -CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                      ELSE pt.amount_cup / v_doc_rate END
              ELSE
                CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                     ELSE pt.amount_cup / v_doc_rate END
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_amount_in_doc_currency := CASE
    WHEN p_currency = v_doc_currency THEN p_amount
    ELSE v_amount_cup / v_doc_rate
  END;

  v_balance := v_total - v_paid;
  IF v_amount_in_doc_currency > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_in_doc_currency, v_balance;
  END IF;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, v_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) TO service_role;
