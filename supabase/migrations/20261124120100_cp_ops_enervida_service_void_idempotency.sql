-- ============================================================================
-- CP-OPS-ENERVIDA — Migración 2/4: anulación de servicios con reversión real
-- de pagos + idempotencia de la creación en modo confirmación.
--
-- Causa raíz §4 (misión): el POST de confirmación crea el draft ANTES de
-- resolver la identidad del proveedor; si la resolución falla (selector que
-- envía suppliers.id como master_party_id) el draft queda huérfano y cada
-- reintento crea otro (create_received_service_v2 sin creation_key).
-- Causa raíz P0: void/cancel dejaban los pagos del servicio como salidas
-- activas (solo una nota de texto; el path legacy ni eso).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1. void_received_service_with_reversal — reemisión con CONTRA-FILAS.
--    Misma firma y contrato (20261010000002 / vigente); cambio: además de la
--    nota de trazabilidad, cada pago recibe su fila contraria
--    (direction='reversal', reverses_payment_id) y su asiento compensatorio.
--    El trigger fin_trg_received_services ya anula los asientos del
--    documento completo; las llamadas por pago son idempotentes (reversal_of).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_payment_status text;
  v_paid_amount numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_eff_date timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_pay record;
  v_reversed_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, payment_status, paid_amount
  INTO v_store_id, v_status, v_service_number, v_payment_status, v_paid_amount
  FROM received_services
  WHERE id = p_service_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  PERFORM set_config('app.is_void_rpc', 'true', true);

  DELETE FROM service_reception_links WHERE service_id = p_service_id;
  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;
  DELETE FROM service_production_order_links WHERE service_id = p_service_id;

  UPDATE received_services
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_service_id;

  -- CP-OPS-ENERVIDA (P0): cada pago del servicio recibe su CONTRA-FILA.
  -- El dinero vuelve al cajón de forma explícita, trazable y con su propia
  -- fecha — nunca un DELETE (PT007) ni una nota de texto como única huella.
  FOR v_pay IN
    SELECT * FROM payment_transactions
    WHERE ref_type = 'service' AND ref_id = p_service_id
      AND COALESCE(direction, 'in') = 'in'
    ORDER BY payment_date, id
  LOOP
    UPDATE payment_transactions
    SET notes = COALESCE(notes, '') || ' [REVERSED by service void ' || p_service_id::text || ' at ' || v_eff_date::text || ']'
    WHERE id = v_pay.id;

    IF NOT EXISTS (SELECT 1 FROM payment_transactions WHERE reverses_payment_id = v_pay.id) THEN
      INSERT INTO payment_transactions (
        store_id, ref_type, ref_id, amount, payment_method,
        currency, exchange_rate, reference, notes, paid_by, idempotency_key,
        payment_date, direction, reverses_payment_id
      ) VALUES (
        v_store_id, 'service', p_service_id, v_pay.amount, v_pay.payment_method,
        v_pay.currency, v_pay.exchange_rate,
        'Reversión (anulación de servicio ' || v_service_number || ')',
        'Reversión automática por anulación del servicio ' || v_service_number ||
          ' — pago ' || v_pay.id::text ||
          CASE WHEN COALESCE(btrim(p_reason), '') <> '' THEN ' — ' || btrim(p_reason) ELSE '' END,
        v_caller_uid,
        'reversal:' || v_pay.id::text,
        v_eff_date,
        'reversal',
        v_pay.id
      );
      v_reversed_count := v_reversed_count + 1;
    END IF;

    -- Asiento compensatorio del 'pago' (idempotente; el annulment integral
    -- del trigger del documento suele llegar primero — belt and suspenders).
    PERFORM public.fin_post_payment_annulment('SERVICIO_RECIBIDO', p_service_id, v_pay.id);
  END LOOP;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_VOIDED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'reason', p_reason,
      'before_status', v_status,
      'after_status', 'voided',
      'before_payment_status', v_payment_status,
      'before_paid_amount', v_paid_amount,
      'payment_transactions_reversed', v_reversed_count,
      'operation_date', v_eff_date
    ));

  PERFORM set_config('app.is_void_rpc', 'false', true);

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'new_status', 'voided',
    'payments_reversed', v_reversed_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid, uuid, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- §2. set_received_service_status — reemisión con reversión de pagos al
--    cancelar/anular. Mismo contrato (20261121120000); cambio: las
--    transiciones a estado terminal (cancelled desde draft, voided desde
--    active) revierten los pagos existentes con contra-filas (los borradores
--    pueden tener pagos por caminos históricos — nunca se pierden, se
--    revierten de forma explícita y auditable).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_current text;
  v_service_number text;
  v_supplier text;
  v_total numeric;
  v_allowed text[];
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay record;
  v_reversed_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, supplier, total_amount
  INTO v_store_id, v_current, v_service_number, v_supplier, v_total
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_current = p_new_status THEN
    RETURN jsonb_build_object('status', 'no_change', 'service_status', v_current);
  END IF;

  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['active', 'cancelled']::text[]
    WHEN 'active'  THEN ARRAY['voided']::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current, p_new_status, array_to_string(v_allowed, ', ');
  END IF;

  IF v_current = 'draft' AND p_new_status = 'active' THEN
    IF COALESCE(btrim(COALESCE(v_supplier, '')), '') = '' THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: completa el proveedor antes de confirmar el servicio';
    END IF;
    IF v_total IS NULL OR v_total <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_AMOUNT: el importe del servicio debe ser > 0 para confirmar';
    END IF;
  END IF;

  PERFORM set_config('app.is_status_change_rpc', 'true', true);

  UPDATE received_services SET status = p_new_status, updated_at = NOW()
  WHERE id = p_service_id;

  PERFORM set_config('app.is_status_change_rpc', 'false', true);

  -- CP-OPS-ENERVIDA: transición a estado terminal ⇒ reversión explícita de
  -- los pagos (contra-filas + asientos compensatorios). Un servicio
  -- cancelado/anulado NO puede seguir generando efectos económicos activos.
  IF p_new_status IN ('cancelled', 'voided') THEN
    FOR v_pay IN
      SELECT * FROM payment_transactions
      WHERE ref_type = 'service' AND ref_id = p_service_id
        AND COALESCE(direction, 'in') = 'in'
      ORDER BY payment_date, id
    LOOP
      IF NOT EXISTS (SELECT 1 FROM payment_transactions WHERE reverses_payment_id = v_pay.id) THEN
        INSERT INTO payment_transactions (
          store_id, ref_type, ref_id, amount, payment_method,
          currency, exchange_rate, reference, notes, paid_by, idempotency_key,
          payment_date, direction, reverses_payment_id
        ) VALUES (
          v_store_id, 'service', p_service_id, v_pay.amount, v_pay.payment_method,
          v_pay.currency, v_pay.exchange_rate,
          'Reversión (' || CASE WHEN p_new_status = 'cancelled' THEN 'cancelación' ELSE 'anulación' END || ' de servicio ' || v_service_number || ')',
          'Reversión automática por ' ||
            CASE WHEN p_new_status = 'cancelled' THEN 'cancelación' ELSE 'anulación' END ||
            ' del servicio ' || v_service_number || ' — pago ' || v_pay.id::text,
          v_caller_uid,
          'reversal:' || v_pay.id::text,
          now(),
          'reversal',
          v_pay.id
        );
        v_reversed_count := v_reversed_count + 1;
      END IF;
      PERFORM public.fin_post_payment_annulment('SERVICIO_RECIBIDO', p_service_id, v_pay.id);
    END LOOP;

    UPDATE received_services
    SET payment_status = 'unpaid', paid_amount = 0, paid_at = NULL
    WHERE id = p_service_id;
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_STATUS_CHANGED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'from_status', v_current, 'to_status', p_new_status, 'reason', p_reason,
      'payments_reversed', v_reversed_count
    ));

  RETURN jsonb_build_object('status', 'success', 'service_status', p_new_status, 'previous_status', v_current, 'payments_reversed', v_reversed_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- §3. create_received_service_v2 — reemisión con p_creation_key (idempotencia
--    del MODO CONFIRMACIÓN, paridad con create_received_service_draft).
--    El parámetro nuevo es opcional y va al final: llamada posicional y por
--    nombre de los llamadores existentes siguen intactas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid, p_production_order_ids jsonb, p_creation_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_service_id uuid;
  v_service_number text;
  v_count integer;
  v_link_count integer;
  v_allocated_per_receipt numeric;
  v_receipt_id uuid;
  v_order_id uuid;
  v_ot_count integer := 0;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid())
    ELSE auth.uid()
  END;
  v_key text := NULLIF(btrim(COALESCE(p_creation_key, '')), '');
  v_existing_service_id uuid;
  v_existing_number text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- CP-OPS-ENERVIDA §4: idempotencia por creation_key ANTES de cualquier
  -- escritura (mismo contrato que create_received_service_draft). Un
  -- reintento de confirmación devuelve el servicio ya creado en lugar de
  -- crear un duplicado.
  IF v_key IS NOT NULL THEN
    SELECT al.record_id, al.metadata->>'service_number'
      INTO v_existing_service_id, v_existing_number
    FROM public.audit_logs al
    WHERE al.store_id = p_store_id
      AND al.action = 'SERVICE_CREATED'
      AND al.metadata->>'creation_key' = v_key
    ORDER BY al.created_at DESC
    LIMIT 1;
    IF v_existing_service_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'idempotent', 'service_id', v_existing_service_id,
        'service_number', v_existing_number, 'link_count', 0,
        'production_order_link_count', 0
      );
    END IF;
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
  END IF;

  IF p_exchange_rate < 0.01 OR p_exchange_rate > 10000 THEN
    RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: % out of range [0.01, 10000]', p_exchange_rate;
  END IF;

  IF p_payment_terms_days < 1 OR p_payment_terms_days > 365 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_TERMS: % out of range [1, 365]', p_payment_terms_days;
  END IF;

  IF p_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
    RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
  END IF;

  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id AND store_id = p_store_id AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
    END IF;
  END IF;

  PERFORM public.validate_operation_date(COALESCE(p_service_date, CURRENT_DATE)::timestamp with time zone, p_store_id);

  SELECT 'SRV-' || to_char(COALESCE(p_service_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
         LPAD(nextval('service_number_seq')::text, 5, '0')
  INTO v_service_number;

  INSERT INTO received_services (
    store_id, service_number, service_date, service_type_id, service_type_name,
    supplier, reference_doc, currency, exchange_rate, total_amount,
    observations, status, distribution_method, created_by,
    payment_terms_days, due_date
  ) VALUES (
    p_store_id, v_service_number, COALESCE(p_service_date, CURRENT_DATE),
    p_service_type_id, p_service_type_name, p_supplier, p_reference_doc,
    p_currency, p_exchange_rate, p_total_amount, p_observations,
    'draft', p_distribution_method, v_caller_uid,
    p_payment_terms_days, (COALESCE(p_service_date, CURRENT_DATE) + p_payment_terms_days)::date
  ) RETURNING id INTO v_service_id;

  v_link_count := jsonb_array_length(p_receipt_ids);
  IF v_link_count > 0 THEN
    v_allocated_per_receipt := p_total_amount / v_link_count;
    FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
      IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = p_store_id AND status = 'active') THEN
        RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
      END IF;
      INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
      VALUES (v_service_id, v_receipt_id, 100.0 / v_link_count, v_allocated_per_receipt);
    END LOOP;
  END IF;

  IF jsonb_array_length(p_production_order_ids) > 0 THEN
    FOR v_order_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_production_order_ids) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM production_orders
        WHERE id = v_order_id
          AND store_id = p_store_id
          AND status NOT IN ('voided', 'closed')
      ) THEN
        RAISE EXCEPTION 'ERR_PRODUCTION_ORDER_INVALID: % no pertenece a la tienda o su estado no admite vinculación', v_order_id;
      END IF;
      INSERT INTO service_production_order_links (service_id, production_order_id)
      VALUES (v_service_id, v_order_id)
      ON CONFLICT (service_id, production_order_id) DO NOTHING;
      v_ot_count := v_ot_count + 1;
    END LOOP;
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'SERVICE_CREATED', 'received_services', v_service_id,
    jsonb_build_object(
      'service_number', v_service_number, 'supplier', p_supplier,
      'total_amount', p_total_amount, 'currency', p_currency,
      'receipt_ids_linked', v_link_count,
      'production_order_ids_linked', v_ot_count,
      'creation_key', v_key
    ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', v_service_id,
    'service_number', v_service_number, 'link_count', v_link_count,
    'production_order_link_count', v_ot_count
  );
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb, text) IS
  'CP-OPS-ENERVIDA §4: añade p_creation_key (idempotencia del modo confirmación, paridad con create_received_service_draft). El resto del contrato es el de v2.18.0.';

-- Defensa en profundidad (patrón ADN-009 F5/§7): índice único parcial por
-- tienda+clave sobre las auditorías de creación — dos confirmaciones con la
-- misma clave no pueden persistir dos servicios.
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_service_created_creation_key
  ON public.audit_logs (store_id, (metadata->>'creation_key'))
  WHERE action = 'SERVICE_CREATED' AND metadata->>'creation_key' IS NOT NULL;
