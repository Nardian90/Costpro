-- ============================================================================
-- CP-OPS-ENERVIDA — Migración 4/4: Liquidación múltiple en Cuentas por Pagar.
--
-- register_supplier_payment_multi: un MISMO lote de pago (método, moneda,
-- tasa, fecha, referencia) aplicado a VARIOS documentos (recepciones y
-- servicios), con importe por documento (total o parcial), de forma
-- ATÓMICA (una sola transacción: o se liquidan todos o ninguno) e
-- IDEMPOTENTE (replay por bloque + claves por componente, patrón ADN-008).
--
-- Reglas (misión §6.3):
--   1. Ningún documento puede recibir más que su saldo pendiente (validado
--      BAJO bloqueo del documento, neteando contra-filas de reversión).
--   2. Asignación explícita por documento (p_items), nunca implícita.
--   3. Sin mezcla de medios/monedas en el lote: UN método y UNA moneda por
--      operación (el llamador separa lotes incompatibles; la UI lo avisa).
--   4. Sin tasas inventadas: fail-closed como el motor individual.
--   5. Se conservan los pagos parciales y el historial (payment_transactions
--      por documento + fin_entries 'pago' por pago).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_supplier_payment_multi(
  p_store_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_currency text DEFAULT 'CUP'::text,
  p_exchange_rate numeric DEFAULT 1.0,
  p_paid_by uuid DEFAULT NULL::uuid,
  p_payment_date timestamptz DEFAULT NULL::timestamptz,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer;
  v_idx integer;
  v_item jsonb;
  v_ref_type text;
  v_ref_id uuid;
  v_amount numeric;
  v_method text := p_payment_method;
  v_rate numeric := p_exchange_rate;
  v_payment_id uuid;
  v_doc record;
  v_paid numeric;
  v_doc_balance numeric;
  v_doc_curr text;
  v_doc_rate numeric;
  v_amount_in_doc numeric;
  v_amount_cup numeric;
  v_sum_doc numeric;
  v_total_amount numeric := 0;
  v_total_cup numeric := 0;
  v_ids jsonb := '[]'::jsonb;
  v_block_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_replay_complete boolean := true;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_store_rate numeric;
BEGIN
  -- Catálogos canónicos (mismo contrato que register_supplier_payment).
  IF lower(btrim(COALESCE(v_method, ''))) = 'zelle' THEN v_method := 'external_transfer'; END IF;
  IF v_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'ERR_METHOD_INVALID: medio de pago no soportado (%)', v_method;
  END IF;
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'ERR_CURRENCY_INVALID: moneda no soportada (%)', p_currency;
  END IF;
  IF v_method = 'external_transfer' AND p_currency NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION 'ERR_COMBINACION_NO_SOPORTADA: Transf. Exterior es un riel de divisa (USD/EUR); combinación con % no soportada', p_currency;
  END IF;

  v_count := jsonb_array_length(COALESCE(p_items, '[]'::jsonb));
  IF v_count < 1 OR v_count > 50 THEN
    RAISE EXCEPTION 'ERR_MULTI_SIZE: el lote debe tener entre 1 y 50 documentos (recibidos: %)', v_count;
  END IF;

  -- Validación estructural de TODOS los ítems ANTES de tocar la BD.
  FOR v_idx IN 0 .. v_count - 1 LOOP
    v_item := p_items -> v_idx;
    v_ref_type := lower(btrim(COALESCE(v_item->>'ref_type', '')));
    v_ref_id := NULLIF(btrim(COALESCE(v_item->>'ref_id', '')), '')::uuid;
    v_amount := NULLIF(v_item->>'amount', '')::numeric;
    IF v_ref_type NOT IN ('receipt', 'service') THEN
      RAISE EXCEPTION 'ERR_ITEM_INVALID: ref_type % no soportado en liquidación múltiple (ítem %)', v_ref_type, v_idx + 1;
    END IF;
    IF v_ref_id IS NULL THEN
      RAISE EXCEPTION 'ERR_ITEM_INVALID: ref_id ausente (ítem %)', v_idx + 1;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_INVALID: importe debe ser > 0 (ítem %)', v_idx + 1;
    END IF;
  END LOOP;

  -- Fast path de replay (patrón ADN-008): si TODOS los componentes del
  -- bloque ya existen, devolver sus ids sin escribir nada.
  IF v_block_key IS NOT NULL THEN
    FOR v_idx IN 0 .. v_count - 1 LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.payment_transactions
        WHERE idempotency_key = v_block_key || ':' || v_idx
      ) THEN
        v_replay_complete := false;
        EXIT;
      END IF;
    END LOOP;
    IF v_replay_complete THEN
      FOR v_idx IN 0 .. v_count - 1 LOOP
        SELECT id INTO v_payment_id
        FROM public.payment_transactions
        WHERE idempotency_key = v_block_key || ':' || v_idx
        LIMIT 1;
        v_ids := v_ids || jsonb_build_object(
          'id', v_payment_id, 'index', v_idx,
          'ref_type', p_items -> v_idx ->> 'ref_type',
          'ref_id', p_items -> v_idx ->> 'ref_id',
          'amount', (p_items -> v_idx ->> 'amount')::numeric,
          'replayed', true
        );
      END LOOP;
      RETURN jsonb_build_object('payments', v_ids, 'count', v_count, 'replayed', true);
    END IF;
  END IF;

  -- Bloqueo determinista de TODOS los documentos (orden ref_type, ref_id):
  -- dos lotes concurrentes con documentos solapados se serializan sin
  -- deadlocks. Validación de tienda y estado pagable bajo el bloqueo.
  FOR v_doc IN
    SELECT DISTINCT (it->>'ref_type') AS ref_type, (it->>'ref_id')::uuid AS ref_id
    FROM jsonb_array_elements(p_items) it
    ORDER BY (it->>'ref_type'), ((it->>'ref_id')::uuid)
  LOOP
    IF v_doc.ref_type = 'receipt' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.receipts r
        WHERE r.id = v_doc.ref_id AND r.store_id = p_store_id
          AND r.status NOT IN ('voided', 'reversed')
        FOR UPDATE
      ) THEN
        RAISE EXCEPTION 'ERR_DOC_NOT_PAYABLE: la recepción % no pertenece a la tienda o no admite pagos', v_doc.ref_id;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.received_services s
        WHERE s.id = v_doc.ref_id AND s.store_id = p_store_id
          AND s.status = 'active'
        FOR UPDATE
      ) THEN
        RAISE EXCEPTION 'ERR_DOC_NOT_PAYABLE: el servicio % no pertenece a la tienda o no está activo', v_doc.ref_id;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- Tasa fail-closed (mismo contrato del motor individual).
  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION 'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1).', p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  -- Pre-check de overpay POR DOCUMENTO (suma de los ítems del lote contra
  -- ese documento + pagos existentes, neteando contra-filas).
  FOR v_doc IN
    SELECT (it->>'ref_type') AS ref_type, (it->>'ref_id')::uuid AS ref_id,
           SUM((it->>'amount')::numeric) AS lot_amount
    FROM jsonb_array_elements(p_items) it
    GROUP BY (it->>'ref_type'), ((it->>'ref_id')::uuid)
  LOOP
    IF v_doc.ref_type = 'receipt' THEN
      -- Recepciones: documento en CUP, tasa 1 (contrato del motor individual).
      SELECT r.total_cost INTO v_doc_balance
      FROM public.receipts r WHERE r.id = v_doc.ref_id;
      v_amount_in_doc := v_doc.lot_amount;
      SELECT COALESCE(SUM(
             CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN -pt.amount_cup
                  ELSE pt.amount_cup END), 0) INTO v_paid
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'receipt' AND pt.ref_id = v_doc.ref_id;
    ELSE
      SELECT s.total_amount, s.currency, COALESCE(s.exchange_rate, 1)
        INTO v_doc_balance, v_doc_curr, v_doc_rate
      FROM public.received_services s WHERE s.id = v_doc.ref_id;
      -- Importe del lote en la MONEDA DEL DOCUMENTO (misma aritmética del
      -- motor individual: via CUP si las monedas difieren).
      v_amount_in_doc := CASE
        WHEN p_currency = v_doc_curr THEN v_doc.lot_amount
        ELSE (round(v_doc.lot_amount * v_rate, 2)) / v_doc_rate
      END;
      SELECT COALESCE(SUM(
             CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN
                    -CASE WHEN pt.currency = v_doc_curr THEN pt.amount
                          ELSE pt.amount_cup / v_doc_rate END
                  ELSE
                    CASE WHEN pt.currency = v_doc_curr THEN pt.amount
                         ELSE pt.amount_cup / v_doc_rate END
             END), 0) INTO v_paid
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'service' AND pt.ref_id = v_doc.ref_id;
    END IF;

    IF v_amount_in_doc > (v_doc_balance - v_paid) THEN
      RAISE EXCEPTION
        'ERR_MULTI_OVERPAY: el importe asignado (%) excede el saldo pendiente (%) del documento %',
        v_amount_in_doc, (v_doc_balance - v_paid), v_doc.ref_id;
    END IF;
  END LOOP;

  -- Inserción por componente (misma transacción ⇒ ATÓMICA). El motor
  -- individual re-valida estado/tasa/overpay con la fila ya bloqueada.
  FOR v_idx IN 0 .. v_count - 1 LOOP
    v_item := p_items -> v_idx;
    v_payment_id := public.register_supplier_payment(
      p_store_id => p_store_id,
      p_ref_type => v_item->>'ref_type',
      p_ref_id => (v_item->>'ref_id')::uuid,
      p_amount => (v_item->>'amount')::numeric,
      p_payment_method => v_method,
      p_paid_by => p_paid_by,
      p_currency => p_currency,
      p_exchange_rate => v_rate,
      p_reference => p_reference,
      p_notes => p_notes,
      p_idempotency_key => CASE WHEN v_block_key IS NOT NULL THEN v_block_key || ':' || v_idx ELSE NULL END,
      p_payment_date => v_eff_payment_date
    );
    v_amount := (v_item->>'amount')::numeric;
    v_amount_cup := CASE WHEN p_currency = 'CUP' THEN v_amount ELSE round(v_amount * v_rate, 2) END;
    v_total_amount := v_total_amount + v_amount;
    v_total_cup := v_total_cup + v_amount_cup;
    v_ids := v_ids || jsonb_build_object(
      'id', v_payment_id, 'index', v_idx,
      'ref_type', v_item->>'ref_type', 'ref_id', v_item->>'ref_id',
      'amount', v_amount, 'amount_cup', v_amount_cup
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (p_paid_by, p_store_id, 'SUPPLIER_PAYMENT_MULTI', 'payment_transactions', NULL,
    jsonb_build_object(
      'count', v_count,
      'payment_method', v_method,
      'currency', p_currency,
      'exchange_rate', v_rate,
      'total_amount', v_total_amount,
      'total_cup', v_total_cup,
      'reference', p_reference,
      'payment_date', v_eff_payment_date,
      'idempotency_key', v_block_key,
      'payments', v_ids
    ));

  RETURN jsonb_build_object(
    'payments', v_ids, 'count', v_count,
    'total_amount', v_total_amount, 'total_cup', v_total_cup,
    'replayed', false
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_supplier_payment_multi(uuid, jsonb, text, text, numeric, uuid, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_multi(uuid, jsonb, text, text, numeric, uuid, timestamptz, text, text, text) TO service_role;

COMMENT ON FUNCTION public.register_supplier_payment_multi(uuid, jsonb, text, text, numeric, uuid, timestamptz, text, text, text) IS
  'CP-OPS-ENERVIDA §6: liquidación múltiple ATÓMICA e idempotente de obligaciones (receipt|service) con un método/moneda por lote y asignación explícita por documento.';
