-- ═══════════════════════════════════════════════════════════════════════════
-- 20261026000000_caja_serializacion_commit_coherente.sql
-- MISIÓN AUTÓNOMA INTEGRAL — Cierre definitivo y certificación de Caja
-- (PR posterior al merge de #1470 · Fase A: carrera entre escritores del cajón)
--
-- DEFECTO (residual §18.7.1, mecanismo ahora demostrado): dos operaciones que
-- consumen efectivo lanzadas con desfase <~2ms pueden ambas pasar la
-- validación física. CAUSA RAÍZ: el advisory lock por tienda SÍ serializa las
-- escrituras, pero las lecturas de autorización agregan con ventana
-- '<= now()' y now() es el INICIO DE LA TRANSACCIÓN DEL LECTOR. Cuando el
-- orden de inicio y el orden de adquisición del lock se invierten (ventana
-- sub-2ms), el lector que empezó antes NO ve las filas confirmadas del otro:
-- quedan fuera de su ventana (timestamp > now() del lector). Evidencia:
-- experimento ventana-decisiva.mjs (reproducible al 100%).
--
-- CORRECTIVA ESTRUCTURAL (misma fuente de verdad — el ledger — sin saldos
-- materializados que requieran reconciliación):
--  R1. Lecturas de AUTORIZACIÓN con upper bound 'infinity'::timestamptz:
--      todo movimiento confirmado es un hecho físico YA ocurrido (el insert
--      ES la entrega de billetes); la autorización post-lock ve TODO lo
--      confirmado (lectura coherente con el orden del lock). Los REPORTES
--      (get_cash_ledger / get_cash_report / get_cash_flow_summary UI)
--      conservan su contrato as-of (now() / p_to explícito) — sin cambios.
--      Movimientos con fecha futura: solo mismos-día (validate_operation_date
--      tope HOY); representan dinero físicamente ya movido al insertarse →
--      incluirlos es la verdad física del cajón (fail-closed se preserva).
--  R2. Todos los REDUCTORES del cajón bajo el MISMO protocolo de
--      serialización: advisory lock por tienda adquirido ANTES de las
--      lecturas que autorizan la salida, mantenido hasta el commit:
--        · create_cash_flow_document / reverse_cash_flow_document /
--          create_devolution_v2 / reverse_devolution / close_cash_shift
--          (ya lo tenían — se les corrige la ventana de lectura).
--        · register_supplier_payment (pagos a proveedor/comisión en efectivo
--          vía bulk-pay): ANTES sin lock NI validación física — ahora ambos.
--        · NUEVO register_cash_adjustment (reemplaza el INSERT directo de
--          /api/cash-report/adjustments): lock + validación por moneda.
--        · NUEVO pay_commission (reemplaza el UPDATE directo de
--          /api/commissions/payments/[id] y /api/accounts-payable/bulk-pay):
--          lock + validación por moneda para efectivo.
--  R3. Orden de bloqueos uniforme (sin ciclos): advisory(tienda) → locks de
--      fila (venta/documento) → escrituras. Idempotencia y aislamiento
--      multitienda intactos. RLS sin cambios.
--
-- PRECONDICIÓN: cadena 20261024220000 → 20261024230000 → 20261024400000
-- aplicada (los cuerpos base se toman verbatim de esa cadena final).
-- Invariante certificada: saldo físico final por moneda = inicial + entradas
-- confirmadas − salidas confirmadas; NUNCA negativo por carrera.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) create_cash_flow_document/13 — ventana de autorización coherente con lock
-- ───────────────────────────────────────────────────────────────────────────

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
      AND created_at > v_shift.created_at AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_shift.created_at AND paid_at <= 'infinity'::timestamptz;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos EN EFECTIVO de devoluciones (P1, 2026-10-21): el disponible
  -- real del cajón ya los restó — la validación de egresos también. (Los
  -- refunds por transferencia/zelle NO entran aquí: no afectan el efectivo.)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

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
      AND operation_date <= 'infinity'::timestamptz;
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
      SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                       -> 'net' ->> v_currency)::numeric, 0)
        INTO v_balance_currency;
      IF v_amount > v_balance_currency + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, entrega=%', v_currency, round(v_balance_currency, 2), round(v_amount, 2);
      END IF;
    ELSE
      -- MISIÓN POST-MERGE 2026-10-24 (riesgo contable cerrado): un egreso
      -- ordinario entrega BILLETES de la moneda del documento. La existencia
      -- de saldo económico equivalente en la OTRA moneda NO sustituye esos
      -- billetes: una conversión solo puede ocurrir mediante una operación
      -- de cambio explícita (este modelo nunca convierte implícitamente).
      -- Misma fuente autoritativa que entrega_efactivo: net por moneda del
      -- libro físico (get_cash_currency_summary — una sola fuente de verdad).
      SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                       -> 'net' ->> v_currency)::numeric, 0)
        INTO v_balance_currency;
      IF v_amount > v_balance_currency + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, egreso=%', v_currency, round(v_balance_currency, 2), round(v_amount, 2);
      END IF;
      -- Imposibilidad de egresar más efectivo del disponible (canonical CUP,
      -- ventana del turno — concepto ordinario: turno garantizado arriba).
      -- Se CONSERVA como disciplina contable del turno (v2.23.0): el egreso
      -- debe caber TAMBIÉN en el arqueo canónico de la ventana.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 2) reverse_cash_flow_document/3 — ventana de autorización coherente con lock
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document(p_document_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc public.cash_flow_documents%ROWTYPE;
  v_reason text;
  v_contra_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_expected_cash numeric := 0;
  v_balance_currency numeric := 0;
  v_shift RECORD;
BEGIN
  -- 1. Documento con lock de fila (evita doble anulación concurrente)
  SELECT * INTO v_doc FROM public.cash_flow_documents
    WHERE id = p_document_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_DOCUMENT_NOT_FOUND';
  END IF;

  -- 2. AUTH actor-explícito contra la tienda del documento + rol superior
  --    (anular exige admin/manager/encargado — doctrina de reversas)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_doc.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, v_doc.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: anular requiere admin, manager o encargado';
  END IF;

  -- 3. Motivo obligatorio (>= 3 caracteres, como el resto de reversas)
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_TOO_LONG';
  END IF;

  -- 4. Advisory lock por tienda (serializa contra creaciones concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(v_doc.store_id::text));

  -- 5. Estado: solo un confirmado puede anularse (idempotencia de anulación)
  IF v_doc.status <> 'confirmado' THEN
    RAISE EXCEPTION 'ERR_ALREADY_ANNULLED: status=%', v_doc.status;
  END IF;

  -- 6. Anular un INGRESO saca dinero de la caja (fila contra 'out'): exigir
  --    efectivo disponible suficiente para absorber la reversión. Anular un
  --    EGRESO devuelve dinero ('in'): siempre físicamente posible.
  --    El disponible se calcula con la fórmula v2.23.0 (incluye el término
  --    de reembolsos en efectivo — MISIÓN DE SEGUIMIENTO 2026-10-21).
  IF v_doc.doc_type = 'ingreso' THEN
    SELECT * INTO v_shift FROM public.cash_closures
      WHERE store_id = v_doc.store_id AND status = 'pendiente'
      ORDER BY created_at DESC LIMIT 1;
    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: no hay turno abierto para registrar la reversión del efectivo';
    END IF;
    SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
      FROM public.transactions
      WHERE store_id = v_doc.store_id AND status = 'completed'
        AND created_at > v_shift.created_at AND created_at <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('receipt', 'service')
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('production_order', 'work')
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
      FROM public.commission_payments
      WHERE store_id = v_doc.store_id AND status = 'paid' AND payment_method = 'cash'
        AND paid_at > v_shift.created_at AND paid_at <= 'infinity'::timestamptz;
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
      INTO v_cash_flow_in, v_cash_flow_out
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'cash_flow'
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'devolution' AND direction = 'refund'
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    -- MISIÓN DE CIERRE (2026-10-24 §4): recuperaciones simétricas — el dinero
    -- que VOLVIÓ al cajón por reversiones de devoluciones suma al esperado.
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'devolution' AND direction = 'recovery'
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    v_opening := COALESCE(v_shift.opening_balance, 0);
    v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                       - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                       - v_cash_refunds + v_cash_recoveries;
    -- MISIÓN POST-MERGE 2026-10-24: anular un ingreso retira BILLETES de su
    -- moneda del cajón; el saldo físico de ESA moneda no puede quedar en
    -- negativo (el canónico con la otra moneda no compensa billetes).
    SELECT COALESCE((public.get_cash_currency_summary(v_doc.store_id, NULL, 'infinity'::timestamptz)
                     -> 'net' ->> v_doc.currency)::numeric, 0)
      INTO v_balance_currency;
    IF v_doc.amount > v_balance_currency + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: anular este ingreso dejaría el saldo físico % en negativo (disponible=%, reversión=%)', v_doc.currency, round(v_balance_currency, 2), round(v_doc.amount, 2);
    END IF;
    IF v_doc.amount_cup > v_expected_cash + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: anular este ingreso dejaría el efectivo esperado en negativo (disponible=%, reversión=%)', round(v_expected_cash, 2), round(v_doc.amount_cup, 2);
    END IF;
  END IF;

  -- 7. Fila CONTRARIA en el ledger (nunca DELETE ni UPDATE de importes; la
  --    corrección física ocurre AHORA — payment_date = now()). Si el documento
  --    original pertenecía a un turno ya cerrado, ese cierre histórico queda
  --    intacto (sus sumas están congeladas) y la reversión entra a la ventana
  --    del turno actual: procedimiento de corrección sin reabrir historia.
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    v_doc.store_id, 'cash_flow', v_doc.id, v_doc.amount, 'cash',
    v_doc.currency, v_doc.exchange_rate, now(),
    'Anulación ' || v_doc.document_number || ': ' || v_reason,
    v_caller_uid,
    'cf-anul-' || v_doc.id::text,
    CASE v_doc.doc_type WHEN 'ingreso' THEN 'out' ELSE 'in' END
  )
  RETURNING id INTO v_contra_id;

  -- 8. Estado terminal + trazabilidad completa de la anulación
  UPDATE public.cash_flow_documents SET
    status = 'anulado',
    annulled_at = now(),
    annulled_by = v_caller_uid,
    annulment_reason = v_reason,
    annulment_payment_transaction_id = v_contra_id
  WHERE id = v_doc.id;

  -- 9. Auditoría atómica
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_doc.store_id, 'CASH_FLOW_ANNULLED', 'cash_flow_documents', v_doc.id,
    jsonb_build_object(
      'document_number', v_doc.document_number,
      'doc_type', v_doc.doc_type,
      'concept', v_doc.concept,
      'amount', v_doc.amount,
      'currency', v_doc.currency,
      'amount_cup', v_doc.amount_cup,
      'reason', v_reason,
      'before_status', v_doc.status,
      'after_status', 'anulado',
      'annulment_payment_transaction_id', v_contra_id,
      'original_payment_transaction_id', v_doc.payment_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'document_id', v_doc.id,
    'document_number', v_doc.document_number,
    'status_doc', 'anulado',
    'annulled_at', now(),
    'annulled_by', v_caller_uid,
    'annulment_payment_transaction_id', v_contra_id
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) create_devolution_v2/12 — reembolso: validación física post-lock total
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_refund_currency text DEFAULT 'CUP'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_sold_qty numeric;
  v_devolved_qty numeric;
  v_locked_sale uuid;
  v_session_id uuid;
  v_pt_id uuid;
  v_eff timestamptz;
  -- MISIÓN CAJA 2026-10-23: moneda real del reembolso
  v_refund_currency text := upper(btrim(COALESCE(NULLIF(p_refund_currency, ''), 'CUP')));
  v_refund_rate numeric := 1.0;
  v_refund_amount numeric := 0;
  -- REVISIÓN FINAL v2.24.1: identidad de idempotencia + precio anclado al servidor
  v_param_hash text;
  v_idem_hash text;
  v_sale_unit_cup numeric;
  -- MISIÓN POST-MERGE FINAL (2026-10-24): regla contable del reembolso —
  -- tope por moneda (neto pagado − ya reembolsado no convertido) y saldo
  -- físico por moneda (misma fuente autoritativa que el libro de caja).
  v_paid_rows integer := 0;
  v_row_cash_cup numeric := 0;
  v_row_cash_usd numeric := 0;
  v_row_bank_cup numeric := 0;
  v_row_bank_usd numeric := 0;
  v_settle_present boolean := false;
  v_carve_usd numeric := 0;
  v_carve_cup numeric := 0;
  v_paid_cup numeric := 0;
  v_paid_usd numeric := 0;
  v_refunded_cup numeric := 0;
  v_refunded_usd numeric := 0;
  v_refundable numeric := 0;
  v_balance_currency numeric := 0;
  -- MISIÓN DE CIERRE (2026-10-24): tasa histórica implícita + mixto + crédito
  v_rate_sale numeric := NULL;
  v_usd_rows_amt numeric := 0;
  v_usd_rows_cup numeric := 0;
  v_comp_cup numeric := 0;
  v_comp_usd numeric := 0;
  v_credit_refundable numeric := 0;
  v_refund_components jsonb := '[]'::jsonb;
BEGIN
  v_eff := COALESCE(p_operation_date, NOW());
  PERFORM public.validate_operation_date(v_eff, p_store_id);

  -- REVISIÓN FINAL v2.24.1: advisory lock por tienda (misma llave que
  -- create_cash_flow_document / close_cash_shift / create_sale_v2) — serializa
  -- devoluciones frente a entregas/cierres concurrentes sobre el cajón físico
  -- (cierra la ventana de carrera entrega-vs-reembolso detectada en revisión).
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- REVISIÓN FINAL v2.24.1: identidad de idempotencia con hash de payload
  -- (paridad create_sale_v2). Misma clave + payload distinto ⇒ conflicto
  -- explícito; jamás retorno silencioso de la devolución previa.
  v_param_hash := md5(
    p_store_id::text || '|' || COALESCE(v_caller_uid::text, '') || '|'
    || COALESCE(p_original_transaction_id::text, '') || '|' || COALESCE(p_reason, '') || '|'
    || COALESCE(p_payment_method, '') || '|' || v_refund_currency || '|'
    || COALESCE(p_customer_id::text, '') || '|'
    || (SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM jsonb_array_elements(p_items) x) || '|'
    || COALESCE(p_operation_date::text, '')
  );
  IF p_idempotency_key IS NOT NULL THEN
    SELECT ir.param_hash INTO v_idem_hash
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'create_devolution_v2'
      LIMIT 1;
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: la clave % ya está ligada a otra identidad de devolución (payload/actor/tienda)', p_idempotency_key;
      END IF;
      RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing);
    END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- DF-07: LOCK venta original PRIMERO
  IF p_original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original';
  END IF;
  SELECT id INTO v_locked_sale FROM public.transactions
    WHERE id = p_original_transaction_id AND store_id = p_store_id
    FOR UPDATE;
  IF v_locked_sale IS NULL THEN
    RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
  END IF;

  -- DF-07: tope por (venta, producto) DESPUÉS del lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: qty=%', v_qty;
    END IF;

    SELECT COALESCE(SUM(ti.quantity), 0) INTO v_sold_qty
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;

    SELECT COALESCE(SUM(di.quantity), 0) INTO v_devolved_qty
    FROM public.devolution_items di
    JOIN public.devolutions d ON d.id = di.devolution_id
    WHERE d.original_transaction_id = p_original_transaction_id
      AND di.product_id = v_pid
      AND d.status IN ('pending','completed');

    IF v_devolved_qty + v_qty > v_sold_qty THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CAP_EXCEEDED: producto % vendido=% devuelto=% solicitado=% (tope acumulado, lock de venta adquirido)',
        v_pid, v_sold_qty, v_devolved_qty, v_qty;
    END IF;
  END LOOP;

  -- Método permitido
  IF p_payment_method NOT IN ('cash','transfer','zelle','store_credit') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_METHOD: %', p_payment_method;
  END IF;

  -- MISIÓN CAJA 2026-10-23: moneda del reembolso (por la que SALE el dinero).
  -- La tasa SIEMPRE server-side (jerarquía tienda→BCC→elToque, fail-closed) —
  -- sin tasas inventadas. CUP ⇒ rate 1 (comportamiento previo exacto).
  IF v_refund_currency NOT IN ('CUP', 'USD', 'AS_PAID') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_CURRENCY: % (CUP|USD|AS_PAID)', v_refund_currency;
  END IF;
  -- MISIÓN DE CIERRE (§6): el multi-moneda «según lo pagado» exige entrega
  -- física simultánea de ambas monedas → solo efectivo. Zelle es riel USD.
  IF v_refund_currency = 'AS_PAID' AND p_payment_method <> 'cash' THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_AS_PAID_CASH_ONLY: el reembolso según lo pagado (multi-moneda) exige entrega en efectivo (ambas monedas simultáneamente)';
  END IF;
  IF p_payment_method = 'zelle' AND v_refund_currency = 'CUP' THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_ZELLE_CURRENCY: zelle opera en USD (riel del exterior) — un reembolso por zelle no puede emitirse en CUP';
  END IF;
  -- MISIÓN DE CIERRE (Fase E §7): el importe USD del reembolso NO usa la
  -- tasa VIGENTE de la tienda (jerarquía retirada): se ancla a la TASA
  -- IMPLÍCITA HISTÓRICA de los pagos USD de ESTA venta, calculada más abajo
  -- (tras la determinación del pagado — mismas fuentes). Sin tasa histórica
  -- reconstruible el flujo USD falla cerrado: ERR_DEVOLUTION_RATE_UNDETERMINED.

  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, v_eff
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    -- REVISIÓN FINAL v2.24.1 (anti-sobre-reembolso): el precio del reembolso
    -- lo fija el SERVIDOR a partir de la venta original — price_at_sale_cup
    -- ponderado por cantidad; fallback price_at_sale × tasa del ítem con la
    -- convención fail-safe de la casa (tasa ausente ⇒ 1, nunca > pagado en
    -- CUP). El unit_price del payload se IGNORA: DF-07 topa la CANTIDAD y
    -- este gate topa el PRECIO — un payload manipulado ya no puede reembolsar
    -- más de lo cobrado.
    SELECT COALESCE(
             SUM(ti.price_at_sale_cup * ti.quantity) / NULLIF(SUM(ti.quantity), 0),
             SUM(ti.price_at_sale * COALESCE(ti.exchange_rate, 1) * ti.quantity) / NULLIF(SUM(ti.quantity), 0)
           )
      INTO v_sale_unit_cup
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;
    v_price := COALESCE(v_sale_unit_cup, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    -- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): los servicios (is_service=true)
    -- NO tienen existencias propias → NO se registra movimiento de entrada
    -- de stock (evita stock/inventory/kardex fantasma). El reembolso
    -- financiero DF-03 y la trazabilidad documental se conservan íntegros.
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := v_qty, p_movement_type := 'return',
        p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
        p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  -- REVISIÓN FINAL v2.24.1: registrar la identidad en el registry (paridad
  -- create_sale_v2) — hace posible la comparación de hash en reintentos.
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (p_idempotency_key, 'create_devolution_v2', v_devolution_id, v_param_hash,
            jsonb_build_object('status', 'pending'))
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  -- ═══ DF-03: CONTRA-ASIENTO FINANCIERO en la MISMA TX ═══
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_AMOUNT_POSITIVE';
  END IF;

  IF p_payment_method IN ('cash','transfer','zelle') THEN
    -- sesión de caja abierta de la tienda (find-or-create para que el out nunca se pierda)
    SELECT id INTO v_session_id FROM public.cash_register_sessions
      WHERE store_id = p_store_id AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO public.cash_register_sessions (store_id, cashier_id, opening_cash, opened_at, status)
      VALUES (p_store_id, v_caller_uid, 0, NOW(), 'open')
      RETURNING id INTO v_session_id;
    END IF;

    -- contra-asiento de caja: out por el total devuelto
    INSERT INTO public.cash_movements (session_id, movement_type, method, amount, reason, store_id)
    VALUES (v_session_id, 'out', p_payment_method::payment_method_enum, v_total,
            'Devolución ' || v_dev_number || ': ' || COALESCE(p_reason,''), p_store_id);

    -- asiento financiero trazable: venta → devolución → reversión.
    -- MISIÓN CAJA 2026-10-23: moneda REAL del reembolso (física por la que
    -- salió el dinero). amount = canónico / tasa para USD ⇒ amount_cup
    -- generado conserva el total canónico (invariante intacta).
    -- MISIÓN DE CIERRE: el importe del reembolso se fija MÁS ABAJO, tras la
    -- determinación del pagado y de la tasa implícita histórica (v_rate_sale).

    -- ═══ MISIÓN POST-MERGE FINAL 2026-10-24 — REGLA CONTABLE DEL REEMBOLSO ═══
    -- (misión §3/§10, estándar SAS Premium). Un reembolso monetario devuelve
    -- valor por la MONEDA en que SALE el dinero. Dos validaciones DEFINITIVAS
    -- en PostgreSQL (la del frontend es solo espejo):
    --
    -- (a) TOPE POR MONEDA: nunca más efectivo de X que lo NETO pagado por
    --     esta venta en X menos lo ya reembolsado (no convertido) en X. La
    --     equivalencia canónica CUP NO autoriza por sí sola una salida en CUP
    --     de una venta cobrada en USD, ni al revés: la conversión implícita
    --     queda estructuralmente imposible (el modelo NO tiene operación de
    --     cambio; una conversión solo podría existir como operación explícita
    --     con tasa, importes en ambas monedas y doble asiento — hoy inexistente).
    -- (b) FÍSICO POR MONEDA (solo efectivo): misma fuente autoritativa que el
    --     libro (get_cash_currency_summary → net → v_refund_currency) — el
    --     reembolso no puede llevar el cajón a negativo (paridad con la
    --     correctiva 20261024220000 de egresos ordinarios y reversiones).
    --
    -- NETO PAGADO por moneda — mismas fuentes de verdad que el libro usa para
    -- explicar el saldo (§1 liquidación / §2 legacy+carve de get_cash_currency_
    -- summary), más las filas de pago reales (v2.25: una por componente) para
    -- los rieles bancarios:
    --   1) liquidación explícita (cash_received_* − change_given_*, v2.24+)
    --      + filas transfer/zelle;
    --   2) sin liquidación, con filas reales no-CUP (v2.25 sin liquidación);
    --   3) legacy: filas/pools canónicos CUP + carve USD por ítems
    --      (la fila canónica CUP de v2.24 NUNCA se toma como CUP físico pagado
    --      cuando la liquidación declara USD — no asumir que amount_cup son
    --      billetes CUP, misión §3);
    --   4) sin ninguna fuente ⇒ pagos indeterminables ⇒ flujo AMBIGUO
    --      bloqueado (fail-closed, misión §10: no inventar la conversión).
    -- Lo YA REEMBOLSADO cuenta las filas refund de devoluciones NO revertidas
    -- (la reversión deshace la devolución a efectos del tope; su fila refund
    -- persiste en el libro — residual documentado en el expediente). El
    -- store_credit NO consume el tope por moneda: es pasivo CUP-canónico ya
    -- acotado por el tope de cantidad DF-07 y no mueve efectivo.
    SELECT COUNT(*),
           COALESCE(SUM(CASE WHEN pt.payment_method = 'cash'     AND pt.currency = 'CUP' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method = 'cash'     AND pt.currency = 'USD' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method IN ('transfer','zelle') AND pt.currency = 'CUP' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method IN ('transfer','zelle') AND pt.currency = 'USD' THEN pt.amount END), 0)
      INTO v_paid_rows, v_row_cash_cup, v_row_cash_usd, v_row_bank_cup, v_row_bank_usd
      FROM public.payment_transactions pt
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'sale';

    SELECT COALESCE(SUM(ti.cash_paid), 0),
           COALESCE(SUM(ti.cash_paid * ti.exchange_rate), 0)
      INTO v_carve_usd, v_carve_cup
      FROM public.transaction_items ti
      WHERE ti.transaction_id = p_original_transaction_id
        AND ti.cash_currency = 'USD' AND ti.currency = 'USD'
        AND COALESCE(ti.cash_paid, 0) > 0;

    SELECT (t.cash_received_cup IS NOT NULL OR t.cash_received_usd IS NOT NULL
            OR t.change_given_cup IS NOT NULL OR t.change_given_usd IS NOT NULL),
           COALESCE(t.cash_received_cup, 0) - COALESCE(t.change_given_cup, 0),
           COALESCE(t.cash_received_usd, 0) - COALESCE(t.change_given_usd, 0)
      INTO v_settle_present, v_paid_cup, v_paid_usd
      FROM public.transactions t
      WHERE t.id = p_original_transaction_id;

    IF v_settle_present THEN
      -- (1) liquidación explícita: billetes reales ± vuelto + rieles bancarios
      v_paid_cup := v_paid_cup + v_row_bank_cup;
      v_paid_usd := v_paid_usd + v_row_bank_usd;
    ELSIF v_row_cash_usd > 0 THEN
      -- (2) filas reales no-CUP sin liquidación (v2.25 defensivo)
      v_paid_cup := v_row_cash_cup + v_row_bank_cup;
      v_paid_usd := v_row_cash_usd + v_row_bank_usd;
    ELSIF v_paid_rows > 0 THEN
      -- (3) legacy con filas canónicas: split por carve USD de los ítems.
      --     Las filas transfer/zelle son SIEMPRE reales (ambas eras) y se
      --     cuentan íntegras en su moneda.
      v_paid_cup := v_row_cash_cup - v_carve_cup + v_row_bank_cup;
      v_paid_usd := v_carve_usd + v_row_bank_usd;
    ELSE
      -- (3b) muy legacy: pools de la venta + carve
      SELECT COALESCE(t.cash_amount, 0) - v_carve_cup + COALESCE(t.transfer_amount, 0),
             v_carve_usd
        INTO v_paid_cup, v_paid_usd
        FROM public.transactions t
        WHERE t.id = p_original_transaction_id;
    END IF;

    -- MISIÓN DE CIERRE (§5): el tope cuenta DINERO, no estado documental —
    -- reembolsos NO recuperados = Σ refunds − Σ recoveries de la venta, sin
    -- filtro de estado: una reversión documental ya no libera capacidad.
    SELECT COALESCE(SUM(CASE WHEN pt.direction = 'refund'   AND pt.currency = 'CUP' THEN pt.amount
                              WHEN pt.direction = 'recovery' AND pt.currency = 'CUP' THEN -pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.direction = 'refund'   AND pt.currency = 'USD' THEN pt.amount
                              WHEN pt.direction = 'recovery' AND pt.currency = 'USD' THEN -pt.amount END), 0)
      INTO v_refunded_cup, v_refunded_usd
      FROM public.payment_transactions pt
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'devolution'
        AND pt.direction IN ('refund', 'recovery');

    -- MISIÓN DE CIERRE (Fase E §7): TASA IMPLÍCITA HISTÓRICA de los pagos USD
    -- de ESTA venta — misma jerarquía de fuentes que el tope: (a) filas de
    -- pago USD (v2.25, tasa persistida por fila) → media ponderada;
    -- (b) liquidación explícita pura (v2.24, sin rieles bancarios) →
    -- (canónico − CUP neto)/USD neto; (c) carve por ítems (legacy) → media
    -- ponderada de cash_paid×tasa. Indeterminable → NULL y fail-closed.
    SELECT COALESCE(SUM(pt.amount), 0), COALESCE(SUM(pt.amount * pt.exchange_rate), 0)
      INTO v_usd_rows_amt, v_usd_rows_cup
      FROM public.payment_transactions pt
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'sale' AND pt.currency = 'USD' AND pt.exchange_rate > 1;
    IF v_usd_rows_amt > 0 THEN
      v_rate_sale := v_usd_rows_cup / v_usd_rows_amt;
    ELSIF v_settle_present AND v_paid_usd > 0
          AND v_row_bank_cup = 0 AND v_row_bank_usd = 0 THEN
      SELECT (COALESCE(t.total_amount, 0)
                - (COALESCE(t.cash_received_cup, 0) - COALESCE(t.change_given_cup, 0)))
             / NULLIF(COALESCE(t.cash_received_usd, 0) - COALESCE(t.change_given_usd, 0), 0)
        INTO v_rate_sale
        FROM public.transactions t WHERE t.id = p_original_transaction_id;
    ELSE
      SELECT COALESCE(SUM(ti.cash_paid), 0), COALESCE(SUM(ti.cash_paid * ti.exchange_rate), 0)
        INTO v_usd_rows_amt, v_usd_rows_cup
        FROM public.transaction_items ti
        WHERE ti.transaction_id = p_original_transaction_id
          AND ti.cash_currency = 'USD' AND ti.currency = 'USD'
          AND COALESCE(ti.cash_paid, 0) > 0;
      IF v_usd_rows_amt > 0 THEN
        v_rate_sale := v_usd_rows_cup / v_usd_rows_amt;
      END IF;
    END IF;
    IF v_rate_sale IS NOT NULL AND v_rate_sale <= 1 THEN
      v_rate_sale := NULL;  -- tasa implícita sin sentido contable → indeterminada
    END IF;

    -- ═══ MISIÓN DE CIERRE (§6/§7): IMPORTE DEL REEMBOLSO (tras la tasa) ═══
    IF v_refund_currency = 'AS_PAID' THEN
      -- §6 criterio de diseño: la devolución multi-moneda representa CADA
      -- componente con su importe y moneda, bajo UNA transacción atómica.
      -- Componentes = restante reembolsable POR MONEDA (pagado − reembolsado
      -- no recuperado). Sin regla inequívoca de asignación por artículo, el
      -- caso ambiguo (parcial de mixta en AS_PAID) se BLOQUEA: la validación
      -- canónica exige consumir íntegramente lo reembolsable.
      v_comp_cup := v_paid_cup - v_refunded_cup;
      v_comp_usd := v_paid_usd - v_refunded_usd;
      IF v_comp_cup < 0 OR v_comp_usd < 0 THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_CAP: reembolsado no recuperado excede lo pagado (CUP %/%, USD %/%) — inconsistencia de datos',
          v_paid_cup, v_refunded_cup, v_paid_usd, v_refunded_usd;
      END IF;
      IF v_comp_usd > 0 AND v_rate_sale IS NULL THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RATE_UNDETERMINED: la venta pagó USD pero su tasa histórica no es reconstruible (sin filas con tasa, liquidación pura o carve) — el reembolso mixto queda bloqueado';
      END IF;
      IF abs(v_total - (v_comp_cup + v_comp_usd * COALESCE(v_rate_sale, 1))) > 0.05 THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_MIXED_ALLOCATION: la devolución mixta exige consumir íntegramente lo reembolsable por moneda (valor devuelto=%, componentes=% CUP + % USD a tasa %) — no existe regla de asignación por artículo: el caso ambiguo se bloquea',
          round(v_total, 2), round(v_comp_cup, 2), round(v_comp_usd, 2), COALESCE(v_rate_sale, 1);
      END IF;
      v_refund_components := jsonb_build_object('CUP', v_comp_cup, 'USD', v_comp_usd, 'rate_sale', v_rate_sale);
    ELSIF v_refund_currency = 'USD' THEN
      IF v_rate_sale IS NULL THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RATE_UNDETERMINED: la venta pagó USD pero su tasa histórica no es reconstruible — el reembolso USD queda bloqueado (regla §7: devolver la moneda y el importe neto realmente cobrados)';
      END IF;
      v_refund_rate := v_rate_sale;
      v_refund_amount := round(v_total / v_rate_sale, 2);
    ELSE
      v_refund_amount := v_total;
    END IF;

    IF v_paid_cup = 0 AND v_paid_usd = 0
       AND v_refunded_cup = 0 AND v_refunded_usd = 0 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_PAYMENTS_UNDETERMINED: la venta original no tiene pagos determinables (sin filas de pago, liquidación ni efectivo registrado) — el reembolso monetario queda bloqueado (regla contable: sin conversión implícita entre monedas)';
    END IF;

    v_refundable := CASE v_refund_currency
                      WHEN 'USD' THEN v_paid_usd - v_refunded_usd
                      ELSE v_paid_cup - v_refunded_cup
                    END;
    IF v_refund_currency <> 'AS_PAID' AND v_refund_amount > v_refundable + 0.005 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_CAP: reembolso en % excede lo reembolsable de esa moneda para esta venta (pagado neto=%, ya reembolsado=%, solicitado=%) — no se convierte implícitamente el pago de otra moneda',
        v_refund_currency,
        round(CASE v_refund_currency WHEN 'USD' THEN v_paid_usd ELSE v_paid_cup END, 2),
        round(CASE v_refund_currency WHEN 'USD' THEN v_refunded_usd ELSE v_refunded_cup END, 2),
        round(v_refund_amount, 2);
    END IF;

    IF p_payment_method = 'cash' THEN
      IF v_refund_currency = 'AS_PAID' THEN
        IF v_comp_cup > 0 THEN
          SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                           -> 'net' ->> 'CUP')::numeric, 0) INTO v_balance_currency;
          IF v_comp_cup > v_balance_currency + 0.005 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, reembolso=%',
              round(v_balance_currency, 2), round(v_comp_cup, 2);
          END IF;
        END IF;
        IF v_comp_usd > 0 THEN
          SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                           -> 'net' ->> 'USD')::numeric, 0) INTO v_balance_currency;
          IF v_comp_usd > v_balance_currency + 0.005 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico USD disponible=%, reembolso=%',
              round(v_balance_currency, 2), round(v_comp_usd, 2);
          END IF;
        END IF;
      ELSE
        SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                         -> 'net' ->> v_refund_currency)::numeric, 0)
          INTO v_balance_currency;
        IF v_refund_amount > v_balance_currency + 0.005 THEN
          RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, reembolso=%',
            v_refund_currency, round(v_balance_currency, 2), round(v_refund_amount, 2);
        END IF;
      END IF;
    END IF;
    -- ═══ fin de la regla contable del reembolso ═══
    IF v_refund_currency = 'AS_PAID' THEN
      IF v_comp_cup > 0 THEN
        INSERT INTO public.payment_transactions (
          store_id, ref_type, ref_id, transaction_id,
          amount, payment_method, currency, exchange_rate,
          payment_date, direction, paid_by, idempotency_key
        ) VALUES (
          p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
          v_comp_cup, p_payment_method, 'CUP', 1,
          v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund-CUP'
        ) RETURNING id INTO v_pt_id;
      END IF;
      IF v_comp_usd > 0 THEN
        INSERT INTO public.payment_transactions (
          store_id, ref_type, ref_id, transaction_id,
          amount, payment_method, currency, exchange_rate,
          payment_date, direction, paid_by, idempotency_key
        ) VALUES (
          p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
          v_comp_usd, p_payment_method, 'USD', v_rate_sale,
          v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund-USD'
        ) RETURNING id INTO v_pt_id;
      END IF;
    ELSE
      INSERT INTO public.payment_transactions (
        store_id, ref_type, ref_id, transaction_id,
        amount, payment_method, currency, exchange_rate,
        payment_date, direction, paid_by, idempotency_key
      ) VALUES (
        p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
        v_refund_amount, p_payment_method, v_refund_currency, v_refund_rate,
        v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
      ) RETURNING id INTO v_pt_id;
    END IF;

  ELSIF p_payment_method = 'store_credit' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
    END IF;
    -- MISIÓN DE CIERRE (§8): tope canónico del crédito — lo EMITIDO no
    -- compensado no puede exceder lo pagado canónico de la venta (las
    -- compensaciones de reversión son filas negativas → SUM = neto vigente).
    -- Sin este tope, revertir sin compensar y re-devolver duplicaba el pasivo.
    SELECT COALESCE(t.total_amount, 0)
         - COALESCE((SELECT SUM(scl.amount) FROM public.store_credit_ledger scl
                     WHERE scl.origin_transaction_id = p_original_transaction_id), 0)
      INTO v_credit_refundable
      FROM public.transactions t WHERE t.id = p_original_transaction_id;
    IF v_total > v_credit_refundable + 0.005 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CREDIT_CAP: el crédito de tienda excede lo emitible canónico de la venta (pagado=%, crédito vigente=%, solicitado=%)',
        round(COALESCE((SELECT t2.total_amount FROM public.transactions t2 WHERE t2.id = p_original_transaction_id), 0), 2),
        round(COALESCE((SELECT t2.total_amount FROM public.transactions t2 WHERE t2.id = p_original_transaction_id), 0)
              - v_credit_refundable, 2),
        round(v_total, 2);
    END IF;
    -- pasivo visible y auditable; la caja NO se toca (el dinero ya no sale)
    INSERT INTO public.store_credit_ledger
      (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
    VALUES
      (p_store_id, p_customer_id, v_total, v_devolution_id, p_original_transaction_id,
       'dev-' || v_devolution_id::text || '-credit', v_caller_uid);
  END IF;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items),
      'operation_date', v_eff,
      'import_origin', 'ENERVIDA-EXCEL-IMPORT',
      'cap_lock_df07', true,
      'refund_currency', v_refund_currency,
      'refund_rate', v_refund_rate,
      'refund_amount', v_refund_amount,
      'refund_components', v_refund_components,
      'rate_sale', v_rate_sale,
      'pricing_source', 'server_price_at_sale_cup_v2_24_1',
      'idempotency_param_hash', COALESCE(v_param_hash, ''),
      'financial_contra_entry_df03',
        jsonb_build_object('method', p_payment_method, 'amount', v_total,
          'cash_out', (p_payment_method <> 'store_credit'),
          'idempotency_key', 'dev-' || v_devolution_id::text || '-refund')
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total,
    'refund_currency', v_refund_currency,
    'refund_components', v_refund_components,
    'rate_sale', v_rate_sale,
    'financial_effect', CASE WHEN p_payment_method = 'store_credit' THEN 'store_credit_ledger' ELSE 'cash_out_and_refund' END
  );
END $function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) close_cash_shift/6 — arqueo congelado coherente con el orden del lock
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_declared_cash_usd numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_voucher_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_voucher_recoveries numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
  v_window_usd_net numeric := 0;
  v_system_cash_usd numeric := 0;
  v_difference_usd numeric := 0;
BEGIN
  -- 1. SELECT FOR UPDATE + validar status
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'pendiente' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status;
  END IF;

  -- 2. Auth (actor-explícito, sin cambios respecto a v2.18.2)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 2b. REVISIÓN FINAL v2.24.1: gate de rol de autoridad — el CIERRE es
  --     operación sensible y la UI ya lo restringe a admin/manager/encargado
  --     (CashClosureView). El servidor lo replica fail-closed (antes un clerk
  --     podía cerrar vía POST directo: has_store_access_as acepta cualquier
  --     membresía activa).
  IF NOT public.has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_CLOSURE_ROLE: el cierre de turno requiere rol admin, manager o encargado';
  END IF;

  -- 3. Advisory lock por store
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- 4. Fórmula v2.23.0 — Efectivo esperado =
  --      Fondo inicial + Entradas de efectivo − Salidas de efectivo
  --        − Reembolsos en efectivo de devoluciones
  --    Entradas: ventas cobradas en efectivo (parte cash de ventas mixtas
  --      incluida) + anticipos de órdenes de producción/trabajo en efectivo
  --      + ingresos de caja documentados (fondo de cambio y otros).
  --    Salidas: pagos a proveedores en efectivo (recepciones + servicios
  --      recibidos) + comisiones pagadas en efectivo + egresos de caja
  --      documentados (devolución del fondo y otros).
  --    Reembolsos (MISIÓN DE SEGUIMIENTO 2026-10-21, P1): el dinero devuelto
  --      AL CLIENTE en EFECTIVO por una devolución comercial sale físicamente
  --      del cajón (payment_transactions ref_type='devolution',
  --      direction='refund', payment_method='cash'). Reembolsos por
  --      transferencia/zelle NO tocan el efectivo — desde v2.23.0 (decisión
  --      del propietario 2026-10-21, base NETA) restan en el LADO VOUCHERS
  --      del arqueo (voucher_refunds): el dinero salió por ese medio y la
  --      conciliación contra el estado externo es movimiento neto. El crédito
  --      de tienda no genera fila. Ventana por payment_date efectiva — un
  --      refund de un turno cerrado queda congelado en ese cierre (historia
  --      intacta).
  --    NO son efectivo: transferencias y zelle (van a su propio lado del
  --      arqueo); pagos pendientes de documentos (no hay salida de dinero);
  --      cobros de ventas (ref_type='sale') — ya están contados como ventas.
  --    La anulación de un documento inserta fila contraria: el efecto neto
  --      de un documento anulado es CERO en esta fórmula (in + out mismo
  --      importe), sin excluir filas por estado — el ledger siempre manda.

  -- Ventas por canal (columnas de desglose: soportan pago 'mixed')
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= 'infinity'::timestamptz;

  -- Egresos reales de caja — pagos a proveedores en efectivo (recepciones y
  -- servicios recibidos). Excluye ref_type='sale' (cobros de ventas — doble
  -- conteo), 'production_order'/'work' (anticipos = ingresos) y 'commission'.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Anticipos de producción/trabajo EN EFECTIVO son ENTRADAS de caja.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Comisiones SOLO en efectivo.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_closure.created_at
      AND paid_at <= 'infinity'::timestamptz;

  -- Documentos Ingresos/Egresos de caja (fondo de cambio y otros
  -- autorizados). direction in = entrada de efectivo, out = salida.
  -- Los anulados aportan fila original + fila contra ⇒ neto cero.
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- el dinero salió del cajón — el esperado baja por el medio real de pago.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos por VOUCHERS de devoluciones (v2.23.0 — decisión del
  -- propietario 2026-10-21, base NETA): el dinero salió por transferencia/
  -- zelle ⇒ el lado vouchers del arqueo baja por el medio real de pago.
  -- Simétrico al término cash_refunds (regla P1); neto cero con los datos
  -- vivos actuales (censo: 0 refunds de vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Calcular totales
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;
  v_system_cash := COALESCE(v_closure.opening_balance, 0)
                 + v_cash_sales + v_cash_production + v_cash_flow_in
                 - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                 - v_cash_refunds + v_cash_recoveries;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales
                             - v_voucher_refunds + v_voucher_recoveries;
  v_difference := (COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0)) - v_system_expected_total;

  -- MISIÓN CAJA 2026-10-23 (D8): lado USD FÍSICO del turno. Esperado USD =
  -- apertura USD + términos USD de la MISMA ventana (clasificación por moneda
  -- del ledger — única fuente: get_cash_currency_summary). El arqueo canónico
  -- CUP de arriba NO se toca. La diferencia USD se REGISTRA tal cual:
  -- jamás se autoajusta el saldo para cuadrar.
  SELECT COALESCE((public.get_cash_currency_summary(
             v_closure.store_id, v_closure.created_at, 'infinity'::timestamptz)->'net'->>'USD')::numeric, 0)
    INTO v_window_usd_net;
  v_system_cash_usd := COALESCE(v_closure.opening_balance_usd, 0) + v_window_usd_net;
  v_difference_usd := round(COALESCE(p_declared_cash_usd, 0) - v_system_cash_usd, 2);

  -- 5. UPDATE closure con valores recalculados
  UPDATE public.cash_closures SET
    status = 'cerrado',
    closed_at = NOW(),
    declared_cash = p_declared_cash,
    declared_vouchers = p_declared_vouchers,
    declared_cash_usd = COALESCE(p_declared_cash_usd, 0),
    declared_total = COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0),
    system_expected_total = v_system_expected_total,
    system_expected_cash_usd = v_system_cash_usd,
    difference = v_difference,
    difference_usd = v_difference_usd,
    notes = p_notes
  WHERE id = p_closure_id;

  -- 6. Audit log atómico
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_closure.store_id, 'CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id,
    jsonb_build_object(
      'system_cash', v_system_cash,
      'expected_total', v_system_expected_total,
      'difference', v_difference,
      'system_cash_usd', v_system_cash_usd,
      'difference_usd', v_difference_usd,
      'formula', 'v2.24.0',
      'cash_sales', v_cash_sales,
      'cash_production_income', v_cash_production,
      'cash_outflows_suppliers', v_cash_outflows,
      'cash_commissions', v_cash_commissions,
      'cash_flow_in', v_cash_flow_in,
      'cash_flow_out', v_cash_flow_out,
      'cash_refunds_devolution', v_cash_refunds,
      'voucher_refunds_devolution', v_voucher_refunds,
      'cash_recoveries_devolution', v_cash_recoveries,
      'voucher_recoveries_devolution', v_voucher_recoveries,
      'transfer_sales', v_transfer_sales,
      'zelle_sales', v_zelle_sales
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'system_cash', v_system_cash,
    'system_expected_total', v_system_expected_total,
    'difference', v_difference,
    'system_cash_usd', v_system_cash_usd,
    'difference_usd', v_difference_usd,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'cash_refunds', v_cash_refunds,
    'voucher_refunds', v_voucher_refunds,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales
  );
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) get_cash_shift_expected/1 — vista esperada == arqueo congelado (misma
--    ventana de lectura que close_cash_shift tras R1)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_cash_shift_expected(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_window_start timestamptz;
  v_pending RECORD;
  -- R4: FOUND tras SELECT INTO (la nulidad compuesta de RECORD no sirve:
  -- cash_closures.session_reference es NULL en las filas reales y
  -- `<record> IS NOT NULL` exige TODOS los campos no-nulos ⇒ siempre falso).
  v_has_pending boolean := false;
  v_opening numeric := 0;
  v_total_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_voucher_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_voucher_recoveries numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
  v_opening_usd numeric := 0;
  v_expected_cash_usd numeric := 0;
  v_window_usd_net numeric := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- Ventana del turno: si hay turno PENDIENTE (abierto), desde su created_at
  -- (idéntico a close_cash_shift); si no, desde el último cierre cerrado
  -- (fallback histórico: epoch).
  SELECT * INTO v_pending FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;
  v_has_pending := FOUND;

  IF v_has_pending THEN
    v_window_start := v_pending.created_at;
    v_opening := COALESCE(v_pending.opening_balance, 0);
    v_opening_usd := COALESCE(v_pending.opening_balance_usd, 0);
  ELSE
    SELECT closed_at INTO v_window_start FROM public.cash_closures
      WHERE store_id = p_store_id AND status = 'cerrado'
      ORDER BY closed_at DESC LIMIT 1;
    v_window_start := COALESCE(v_window_start, '1970-01-01 00:00:00+00'::timestamptz);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(zelle_amount), 0)
    INTO v_total_sales, v_cash_sales, v_transfer_sales, v_zelle_sales
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_window_start
      AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_window_start
      AND paid_at <= 'infinity'::timestamptz;

  -- Documentos Ingresos/Egresos de caja (fondo de cambio y otros).
  -- Anulados = neto cero (fila original + fila contra).
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- mismo término que close_cash_shift v2.23.0 (coherencia espejo↔autoridad).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos por VOUCHERS (v2.23.0 — base NETA, decisión del propietario
  -- 2026-10-21): mismo término que close_cash_shift (lado vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  -- (recuperaciones antes del esperado)
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start
      AND payment_date <= 'infinity'::timestamptz;
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                     - v_cash_refunds + v_cash_recoveries;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales
                      - v_voucher_refunds + v_voucher_recoveries;

  -- MISIÓN CAJA 2026-10-23 (D8): lado USD FÍSICO de la MISMA ventana (única
  -- fuente de clasificación por moneda — coherente con close_cash_shift v2.24.0).
  SELECT COALESCE((public.get_cash_currency_summary(
             p_store_id, v_window_start, NULL)->'net'->>'USD')::numeric, 0)
    INTO v_window_usd_net;
  v_expected_cash_usd := round(v_opening_usd + v_window_usd_net, 2);

  v_result := jsonb_build_object(
    'opening_balance_usd', v_opening_usd,
    'expected_cash_usd', v_expected_cash_usd,
    'window_start', v_window_start,
    'has_pending_shift', v_has_pending,
    'opening_balance', v_opening,
    'total_sales', v_total_sales,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'cash_refunds', v_cash_refunds,
    'voucher_refunds', v_voucher_refunds,
    'cash_recoveries', v_cash_recoveries,
    'voucher_recoveries', v_voucher_recoveries,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total
  );
  RETURN v_result;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) register_supplier_payment/12 — pagos a proveedores/comisiones en EFECTIVO:
--    adopta el protocolo de serialización + validación física por moneda
--    (misma doctrina fail-closed que egresos desde 2222). Base: cuerpo VIVO
--    de producción (20261021120000) verbatim + inserciones quirúrgicas.
-- ───────────────────────────────────────────────────────────────────────────

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
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_phys_available numeric := 0;
BEGIN
  -- MISIÓN INTEGRAL (Fase A): protocolo común del cajón — advisory por tienda
  -- ANTES de cualquier lectura que autorice una salida de efectivo.
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost INTO v_doc_store_id, v_total
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount INTO v_doc_store_id, v_total
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total INTO v_doc_store_id, v_total
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

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico para la fecha
  -- financiera del pago. Se conservan las fechas históricas (V2.12.32)
  -- dentro del piso de 6 meses; NUNCA fechas futuras (tope HOY Habana).
  -- v_eff_payment_date = COALESCE(p_payment_date, now()) → NOW() siempre pasa.
  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- Calcular monto en CUP
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- R3: Validar overpay
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
  FROM public.payment_transactions
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  v_balance := v_total - v_paid;
  IF v_amount_cup > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_cup, v_balance;
  END IF;

  -- MISIÓN INTEGRAL (Fase A): un pago en EFECTIVO entrega BILLETES de la moneda
  -- del pago. Misma regla que los egresos (2222): sin conversión implícita,
  -- saldo físico por moneda, fail-closed. Lectura post-lock con upper bound
  -- 'infinity' (todo lo confirmado ES un hecho físico ya — coherente con el
  -- orden de adquisición del advisory).
  IF lower(trim(p_payment_method)) = 'cash' THEN
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      p_store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> upper(trim(p_currency)))::numeric, 0);
    IF p_amount > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, pago=%',
        upper(trim(p_currency)), round(v_phys_available, 2), round(p_amount, 2);
    END IF;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) NUEVO register_cash_adjustment/7 — reemplaza el INSERT directo de
--    /api/cash-report/adjustments (ref_type='adjustment', CUP): misma
--    semántica de fila + protocolo del cajón (lock + validación física para
--    direction='out'). La validación DEFINITIVA queda en PostgreSQL.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_cash_adjustment(p_store_id uuid, p_direction text, p_amount numeric, p_note text, p_payment_date timestamptz DEFAULT NULL::timestamptz, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_existing record;
  v_phys_available numeric := 0;
BEGIN
  -- Actor y aislamiento multitienda (doctrina del módulo)
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  IF NOT public.has_store_role_as(v_uid, p_store_id, 'admin')
     AND NOT public.has_store_role_as(v_uid, p_store_id, 'manager')
     AND NOT public.has_store_role_as(v_uid, p_store_id, 'encargado') THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: ajustes requieren admin, manager o encargado';
  END IF;

  -- Validaciones (espejo del zod de la ruta)
  IF lower(trim(p_direction)) NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'ERR_INVALID_DIRECTION: %', p_direction;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: %', p_amount;
  END IF;
  IF p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;

  -- Gate canónico de fecha financiera (tope HOY Habana — nunca futuro)
  PERFORM public.validate_operation_date(COALESCE(p_payment_date, now()), p_store_id);

  -- Protocolo del cajón: advisory ANTES de la lectura que autoriza la salida
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- Idempotencia: la misma clave devuelve la fila original (nunca un segundo
  -- registro — un doble clic no duplica el ajuste)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT id, direction, amount, notes, payment_date, paid_by, created_at
      INTO v_existing
      FROM public.payment_transactions
      WHERE store_id = p_store_id AND ref_type = 'adjustment'
        AND idempotency_key = btrim(p_idempotency_key)
      LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('adjustment', to_jsonb(v_existing), 'idempotent_replay', true);
    END IF;
  END IF;

  -- Fase A: un ajuste direction='out' entrega BILLETES CUP del cajón —
  -- valida el saldo físico por moneda (misma fuente autoritativa y fail-closed
  -- que egresos; lectura post-lock con upper bound 'infinity').
  IF lower(trim(p_direction)) = 'out' THEN
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      p_store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> 'CUP')::numeric, 0);
    IF p_amount > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, ajuste=%',
        round(v_phys_available, 2), round(p_amount, 2);
    END IF;
  END IF;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, transaction_id, direction, amount,
    payment_method, currency, exchange_rate, payment_date, notes,
    paid_by, idempotency_key
  ) VALUES (
    p_store_id, 'adjustment', NULL, NULL, lower(trim(p_direction)), p_amount,
    'cash', 'CUP', 1, COALESCE(p_payment_date, now()), btrim(COALESCE(p_note, '')),
    v_uid, btrim(COALESCE(p_idempotency_key, ''))
  )
  RETURNING id, direction, amount, notes, payment_date, paid_by, created_at
    INTO v_existing;

  RETURN jsonb_build_object('adjustment', to_jsonb(v_existing), 'idempotent_replay', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.register_cash_adjustment(uuid, text, numeric, text, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_cash_adjustment(uuid, text, numeric, text, timestamptz, text, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) NUEVO pay_commission/7 — reemplaza el UPDATE directo de
--    /api/commissions/payments/[id] (action=pay) y la rama commission de
--    /api/accounts-payable/bulk-pay: marca 'paid' bajo el protocolo del cajón
--    (lock + validación física por moneda para efectivo). Las reglas de
--    negocio de fecha (tope HOY, no anterior al último pago del trabajador)
--    se conservan en la app como pre-checks UX; el servidor valida fecha no
--    futura y el cajón. p_currency/p_exchange_rate preservan la semántica de
--    la ruta (los actualiza al pagar; el trigger recalcula amount_cup).
--    Efecto físico de una comisión pagada = final_amount en SU moneda
--    (trigger calculate_commission_amount_cup: amount_cup = final_amount o
--    final_amount×rate; el término v_comm del libro lo revierte a final_amount).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_commission(p_payment_id uuid, p_payment_method text, p_reference text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_paid_at timestamptz DEFAULT NULL::timestamptz, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_comm record;
  v_currency text;
  v_phys_out numeric := 0;
  v_phys_available numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  SELECT id, store_id, status, currency, exchange_rate, amount_cup, final_amount
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;
  IF v_comm.id IS NULL THEN
    RAISE EXCEPTION 'ERR_COMMISSION_NOT_FOUND: %', p_payment_id;
  END IF;

  IF NOT public.has_store_role_as(v_uid, v_comm.store_id, 'admin')
     AND NOT public.has_store_role_as(v_uid, v_comm.store_id, 'manager') THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: pagar comisiones requiere admin o manager';
  END IF;

  -- Idempotencia natural (misma semántica que la ruta: ya pagada → replay)
  IF v_comm.status = 'paid' THEN
    RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', true,
      'message', 'La comisión ya estaba pagada');
  END IF;
  IF v_comm.status NOT IN ('approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_INVALID_COMMISSION_STATUS: no se puede pagar una comisión con estado "%"', v_comm.status;
  END IF;
  IF lower(trim(p_payment_method)) NOT IN ('cash', 'transfer', 'zelle', 'mixed') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD: %', p_payment_method;
  END IF;
  IF p_currency IS NOT NULL AND upper(trim(p_currency)) NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', p_currency;
  END IF;

  -- Fecha del pago: nunca futura (regla 1 del negocio, validada en servidor)
  IF p_paid_at IS NOT NULL AND p_paid_at > now() THEN
    RAISE EXCEPTION 'ERR_PAYMENT_DATE_FUTURE: la fecha del pago (%) no puede ser posterior a ahora (%)', p_paid_at, now();
  END IF;

  v_currency := COALESCE(upper(btrim(p_currency)), v_comm.currency);

  -- Protocolo del cajón: advisory ANTES de la lectura que autoriza la salida
  PERFORM pg_advisory_xact_lock(hashtext(v_comm.store_id::text));

  -- Fase A: una comisión pagada en EFECTIVO entrega BILLETES de su moneda.
  -- Efecto físico por moneda = final_amount en la moneda efectiva del pago
  -- (término v_comm del libro — misma fuente autoritativa). Fail-closed;
  -- lectura post-lock con upper bound 'infinity' (coherente con el lock).
  -- NOTA 'mixed': el libro (v_comm) solo cuenta payment_method='cash' — los
  -- pagos mixtos de comisión no participan del físico en la fórmula vigente
  -- (gap contable PREEXISTENTE, documentado como residual): se valida
  -- estrictamente 'cash' para no alterar la aceptación de 'mixed'.
  IF lower(trim(p_payment_method)) = 'cash' THEN
    v_phys_out := v_comm.final_amount;
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      v_comm.store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> v_currency)::numeric, 0);
    IF COALESCE(v_phys_out, 0) > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, comisión=%',
        v_currency, round(v_phys_available, 2), round(COALESCE(v_phys_out, 0), 2);
    END IF;
  END IF;

  UPDATE public.commission_payments SET
    status = 'paid',
    paid_at = COALESCE(p_paid_at, now()),
    paid_by = v_uid,
    payment_method = lower(trim(p_payment_method)),
    payment_reference = p_reference,
    currency = COALESCE(upper(btrim(p_currency)), currency),
    exchange_rate = CASE WHEN p_exchange_rate IS NOT NULL THEN p_exchange_rate
                         WHEN upper(btrim(COALESCE(p_currency, currency))) <> 'CUP' THEN COALESCE(exchange_rate, 1.0)
                         ELSE 1.0 END,
    updated_at = now()
  WHERE id = p_payment_id
    AND status IN ('approved', 'draft')
    AND store_id = v_comm.store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_COMMISSION_STATE_CHANGED: la comisión cambió de estado concurrentemente — reintentar';
  END IF;

  SELECT id, store_id, status, currency, amount_cup, final_amount, paid_at, paid_by, payment_method
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;

  RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_commission(uuid, text, text, text, numeric, timestamptz, uuid) TO authenticated, service_role;

COMMIT;
