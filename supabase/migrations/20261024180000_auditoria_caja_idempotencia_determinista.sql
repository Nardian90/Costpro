-- ============================================================================
-- MISIÓN AUDITORÍA CAJA (2026-10-24) — idempotencia DETERMINISTA de
-- create_cash_flow_document (defecto de alto impacto descubierto en la
-- auditoría contable, Caso D «Reintento después de un error de red»).
--
-- DEFECTO (demostrado en BD aislada, reproducible):
--   v_param_hash incluía COALESCE(p_operation_date, 'now')::text. Con la
--   convención de la casa (fecha hoy ⇒ el cliente NO envía operation_date ⇒
--   el servidor estampa NOW()), el literal 'now' se coacciona a timestamptz
--   ANTES del ::text → el hash incrusta el INSTANTE ACTUAL:
--     SELECT COALESCE(NULL::timestamptz,'now')::text → '2026-10-23 22:57:39.811656+00'
--   Dos llamadas con MISMA clave y MISMO payload a 50 ms de distancia producen
--   hashes DISTINTOS ⇒ el reintento de red (el escenario que la idempotencia
--   existe para proteger) es rechazado con ERR_IDEMPOTENCY_KEY_REUSE (409)
--   en lugar de devolver el documento original (replay benigno).
--
-- CORRECCIÓN (paridad con create_devolution_v2, misma migración v2.24.1 L502):
--   COALESCE(p_operation_date::text, '') — NULL ⇒ '' (determinista). El resto
--   del cuerpo de la función queda INTACTO (sin cambios de comportamiento
--   contable: clasificación, saldos, fondo, turnos, auditoría y validaciones).
--
-- IMPACTO EN DATOS EXISTENTES:
--   Las filas previas de idempotency_registry conservan su hash almacenado
--   (calculado con el patrón antiguo). Un reintento TARDÍO de un documento ya
--   registrado seguirá siendo rechazado como REUSE (exactamente como ocurre HOY
--   para TODOS los reintentos); los reintentos NUEVOS serán benignos. Efecto
--   neto: estrictamente mejor, sin migración de datos ni reescritura de historia.
--
-- PLAN DE APLICACIÓN (pendiente de autorización del propietario — NO aplicar
-- a producción desde esta misión):
--   1. Revisión del diff (solo 1 línea funcional).
--   2. Aplicar en ventana de baja actividad (CREATE OR REPLACE atómico; las
--      transacciones en vuelo completan con la definición que tomaron al
--      inicio — sin estados intermedios).
--   3. Verificación post-aplicación: repro del escenario D (misma clave+payload
--      dos veces → mismo document_id, cero filas nuevas).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_cash_flow_document(p_store_id uuid, p_doc_type text, p_concept text, p_amount numeric, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_counterparty text DEFAULT NULL::text, p_justification text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_related_document_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc_type text := lower(btrim(p_doc_type));
  v_concept text := lower(btrim(COALESCE(p_concept, '')));
  v_amount numeric;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CUP')));
  v_rate numeric;
  v_rate_effective timestamptz;
  v_amount_cup numeric;
  v_op_date timestamptz := COALESCE(p_operation_date, now());
  v_justification text;
  v_shift RECORD;
  v_number text;
  v_doc_id uuid;
  v_payment_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_expected_cash numeric := 0;
  v_fondo numeric := 0;
  v_param_hash text;
  v_idem jsonb;
  v_idem_hash text;
  v_result jsonb;
  v_related public.cash_flow_documents%ROWTYPE;
  v_has_shift boolean := false;
  v_balance_currency numeric := 0;
BEGIN
  -- 1. AUTH actor-explícito (fail-closed) + rol con autoridad para registrar
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado', 'clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda';
  END IF;

  -- 1b. MISIÓN CAJA 2026-10-23 (D4): la ENTREGA de efectivo acumulado exige rol
  --     de autoridad (admin/manager/encargado — clerk NO entrega efectivo) y
  --     contraparte OBLIGATORIA (la persona que recibe el dinero).
  IF v_concept = 'entrega_efectivo' THEN
    IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
      RAISE EXCEPTION 'ERR_DELIVERY_ROLE: la entrega de efectivo requiere rol admin, manager o encargado';
    END IF;
    IF NULLIF(btrim(COALESCE(p_counterparty, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ERR_COUNTERPARTY_REQUIRED: identifique a la persona que recibe el efectivo (contraparte)';
    END IF;
  END IF;

  -- 2. Validación del documento
  IF v_doc_type NOT IN ('ingreso', 'egreso') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOC_TYPE: %', p_doc_type;
  END IF;
  IF v_concept = '' THEN
    RAISE EXCEPTION 'ERR_CONCEPT_REQUIRED';
  END IF;
  IF NOT (
       (v_doc_type = 'ingreso' AND v_concept IN ('constitucion_fondo', 'reposicion_fondo', 'otro_ingreso'))
    OR (v_doc_type = 'egreso'  AND v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso', 'entrega_efectivo'))
  ) THEN
    RAISE EXCEPTION 'ERR_CONCEPT_TYPE_MISMATCH: concepto % no válido para tipo %', v_concept, v_doc_type;
  END IF;
  v_justification := btrim(COALESCE(p_justification, ''));
  IF v_justification = '' THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_REQUIRED';
  END IF;
  IF length(v_justification) > 500 THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_TOO_LONG';
  END IF;

  v_amount := COALESCE(p_amount, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: %', p_amount;
  END IF;
  IF v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;
  IF v_currency NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;

  -- 3. Tasa de cambio (D8): resolución SERVER-SIDE exclusiva. La tasa del
  --    cliente NO tiene autoridad financiera (se ignora, como en ventas).
  IF v_currency = 'CUP' THEN
    v_rate := 1;
  ELSE
    v_rate := NULL;
    v_rate_effective := NULL;
    SELECT ser.rate, ser.updated_at INTO v_rate, v_rate_effective
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL OR v_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda antes de operar en esa moneda';
    END IF;
    IF v_rate_effective < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: effective=%', v_rate_effective;
    END IF;
  END IF;

  v_amount_cup := CASE WHEN v_currency = 'CUP' THEN v_amount ELSE v_amount * v_rate END;

  -- 4. Advisory lock por tienda: serializa creaciones/anulaciones concurrentes
  --    sobre la misma caja (evita doble gasto y carreras sobre el fondo).
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 5. IDEMPOTENCIA (replay seguro ante reintentos de red)
  v_param_hash := md5(
    p_store_id::text || '|' || v_caller_uid::text || '|' || v_doc_type || '|' || v_concept || '|'
    || v_amount::text || '|' || v_currency || '|' || COALESCE(p_operation_date::text, '') || '|'
    || COALESCE(btrim(p_counterparty), '') || '|' || v_justification || '|'
    || COALESCE(btrim(p_notes), '') || '|' || COALESCE(p_related_document_id::text, '')
  );
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    -- REVISIÓN FINAL v2.24.1: comparar el hash del payload NUEVO contra el hash
    -- ALMACENADO. (Defecto corregido: la variable v_param_hash se sobrescribía
    -- con el hash almacenado y la comparación nunca ocurría — misma clave con
    -- payload distinto devolvía el documento original EN SILENCIO.) Paridad
    -- con create_sale_v2: conflicto SIN retorno silencioso.
    SELECT ir.result, ir.param_hash INTO v_idem, v_idem_hash
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'create_cash_flow_document'
      LIMIT 1;
    IF v_idem IS NOT NULL THEN
      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: la clave % ya está ligada a otra identidad de documento (payload/actor/tienda)', p_idempotency_key;
      END IF;
      -- hash idéntico ⇒ devolver el resultado original (reintento benigno)
      RETURN v_idem;
    END IF;
  END IF;

  -- 6. TURNO (D5 v2.23.0 + MISIÓN CAJA 2026-10-23): los conceptos ordinarios
  --    exigen turno ABIERTO. La ENTREGA DE EFECTIVO es la única operación
  --    autorizada FUERA de turno: queda identificada como outside_shift con
  --    closure_id NULL (no se fabrica un turno artificial — misión §6).
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  v_has_shift := FOUND;
  IF NOT v_has_shift AND v_concept <> 'entrega_efectivo' THEN
    RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: la caja no tiene un turno abierto — abra el turno en Caja antes de registrar ingresos o egresos';
  END IF;

  -- 7. FECHA OPERATIVA: política temporal global (piso 6 meses, no futuro,
  --    días hábiles Habana). Ventana del turno SOLO cuando hay turno.
  --    La entrega fuera de turno conserva su fecha operativa REAL (misión
  --    §5: la entrega del 22/10 se registra con fecha 22/10) y la fecha
  --    física de registro queda en created_at.
  PERFORM public.validate_operation_date(v_op_date, p_store_id);
  IF v_has_shift THEN
    IF v_op_date <= v_shift.created_at OR v_op_date > now() THEN
      RAISE EXCEPTION 'ERR_DATE_OUTSIDE_SHIFT: la fecha operativa debe caer dentro del turno abierto (apertura %)', v_shift.created_at;
    END IF;
  END IF;

  -- 8. SALDO Y FONDO VIGENTES — misma fórmula v2.23.0 que el cierre calculará
  --    (una sola fuente de verdad; se recalcula AHORA bajo advisory lock).
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_shift.created_at AND created_at <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_shift.created_at AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_shift.created_at AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_shift.created_at AND paid_at <= now();

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_shift.created_at AND payment_date <= now();

  -- Reembolsos EN EFECTIVO de devoluciones (P1, 2026-10-21): el disponible
  -- real del cajón ya los restó — la validación de egresos también. (Los
  -- refunds por transferencia/zelle NO entran aquí: no afectan el efectivo.)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_shift.created_at AND payment_date <= now();

  v_opening := COALESCE(v_shift.opening_balance, 0);
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                     - v_cash_refunds;

  -- Fondo de cambio vigente (D2): apertura + constituciones/reposiciones −
  -- devoluciones (documentos CONFIRMADOS de fondo en la ventana del turno).
  SELECT COALESCE(SUM(
           CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE -amount_cup END
         ), 0)
    INTO v_fondo
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_shift.created_at
      AND operation_date <= now();
  v_fondo := v_opening + v_fondo;

  -- 9. REGLAS DE NEGOCIO por tipo
  IF v_doc_type = 'egreso' THEN
    IF v_concept = 'entrega_efectivo' THEN
      -- MISIÓN CAJA 2026-10-23 (D4): la entrega se valida contra el SALDO
      -- FÍSICO DEL LIBRO en la MONEDA del documento (acumulado desde los
      -- movimientos persistidos — misión §6: «validar que el importe no
      -- exceda el saldo disponible de la moneda correspondiente»). Con o
      -- sin turno, el cajón es el cajón: la validación NO depende de la
      -- ventana canónica del turno.
      SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, NULL)
                       -> 'net' ->> v_currency)::numeric, 0)
        INTO v_balance_currency;
      IF v_amount > v_balance_currency + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, entrega=%', v_currency, round(v_balance_currency, 2), round(v_amount, 2);
      END IF;
    ELSE
      -- Imposibilidad de egresar más efectivo del disponible (canonical CUP,
      -- ventana del turno — concepto ordinario: turno garantizado arriba)
      IF v_amount_cup > v_expected_cash + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: disponible=%, egreso=%', round(v_expected_cash, 2), round(v_amount_cup, 2);
      END IF;
      -- Devolución de fondo: nunca más del fondo vigente (5.000 − 2.000 ⇒ quedan 3.000)
      IF v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
        IF v_amount_cup > v_fondo + 0.005 THEN
          RAISE EXCEPTION 'ERR_FUND_INSUFFICIENT: fondo vigente=%, devolución=%', round(v_fondo, 2), round(v_amount_cup, 2);
        END IF;
      END IF;
    END IF;
  END IF;

  -- 10. Vínculo opcional devolución → documento de fondo que la origina
  IF p_related_document_id IS NOT NULL THEN
    IF v_concept NOT IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_NOT_ALLOWED: solo las devoluciones de fondo pueden vincular un documento origen';
    END IF;
    SELECT * INTO v_related FROM public.cash_flow_documents
      WHERE id = p_related_document_id AND store_id = p_store_id
      FOR UPDATE;
    IF NOT FOUND
       OR v_related.status <> 'confirmado'
       OR v_related.doc_type <> 'ingreso'
       OR v_related.concept NOT IN ('constitucion_fondo', 'reposicion_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_INVALID: el documento origen debe ser una constitución/reposición de fondo confirmada de la misma tienda';
    END IF;
  END IF;

  -- 11. NUMERACIÓN (atómica: FOR UPDATE dentro de esta misma transacción)
  v_number := public.next_document_number(p_store_id, 'cash_flow', v_caller_uid);

  -- 12. INSERT documento (confirmado — D4) + efecto financiero UNA vez (D1)
  INSERT INTO public.cash_flow_documents (
    store_id, document_number, doc_type, concept,
    amount, currency, exchange_rate, payment_method,
    operation_date, status, closure_id, responsible_user_id,
    counterparty, justification, notes, related_document_id,
    created_by, confirmed_by, idempotency_key
  ) VALUES (
    p_store_id, v_number, v_doc_type, v_concept,
    v_amount, v_currency, v_rate, 'cash',
    v_op_date, 'confirmado', CASE WHEN v_has_shift THEN v_shift.id ELSE NULL END, v_caller_uid,
    NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
    v_justification,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_related_document_id,
    v_caller_uid, v_caller_uid,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), '')
  )
  RETURNING id INTO v_doc_id;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    p_store_id, 'cash_flow', v_doc_id, v_amount, 'cash',
    v_currency, v_rate, v_op_date,
    v_number || ' · ' || v_concept || ': ' || v_justification,
    v_caller_uid,
    'cf-' || v_doc_id::text,
    CASE v_doc_type WHEN 'ingreso' THEN 'in' ELSE 'out' END
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.cash_flow_documents
    SET payment_transaction_id = v_payment_id
    WHERE id = v_doc_id;

  -- 13. AUDITORÍA atómica (misma transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'CASH_FLOW_CREATED', 'cash_flow_documents', v_doc_id,
    jsonb_build_object(
      'document_number', v_number,
      'doc_type', v_doc_type,
      'concept', v_concept,
      'amount', v_amount,
      'currency', v_currency,
      'exchange_rate', v_rate,
      'amount_cup', round(v_amount_cup, 2),
      'operation_date', v_op_date,
      'closure_id', CASE WHEN v_has_shift THEN v_shift.id ELSE NULL END,
      'outside_shift', (v_concept = 'entrega_efectivo' AND NOT v_has_shift),
      'counterparty', NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
      'justification', v_justification,
      'related_document_id', p_related_document_id,
      'cash_before', round(v_expected_cash, 2),
      'fondo_before', round(v_fondo, 2),
      'payment_transaction_id', v_payment_id,
      'formula', 'v2.24.0'
    )
  );

  v_result := jsonb_build_object(
    'status', 'success',
    'document_id', v_doc_id,
    'document_number', v_number,
    'doc_type', v_doc_type,
    'concept', v_concept,
    'amount', v_amount,
    'currency', v_currency,
    'exchange_rate', v_rate,
    'amount_cup', round(v_amount_cup, 2),
    'operation_date', v_op_date,
    'status_doc', 'confirmado',
    'outside_shift', (v_concept = 'entrega_efectivo' AND NOT v_has_shift),
    'payment_transaction_id', v_payment_id,
    'cash_before', round(v_expected_cash, 2),
    'cash_after', round(v_expected_cash + CASE WHEN v_doc_type = 'ingreso' THEN v_amount_cup ELSE -v_amount_cup END, 2),
    'fondo_before', round(v_fondo, 2),
    'fondo_after', round(
      v_fondo + CASE
        WHEN v_concept IN ('constitucion_fondo', 'reposicion_fondo') THEN v_amount_cup
        WHEN v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN -v_amount_cup
        ELSE 0
      END, 2)
  );

  -- 14. Registro de idempotencia (después del éxito — patrón v2.26)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (btrim(p_idempotency_key), 'create_cash_flow_document', v_doc_id, v_param_hash, v_result)
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;
-- Grants espejo de v2.24.1
REVOKE EXECUTE ON FUNCTION public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamp with time zone, text, text, text, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamp with time zone, text, text, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_flow_document(uuid, text, text, numeric, text, numeric, timestamp with time zone, text, text, text, uuid, text, uuid) TO service_role;
