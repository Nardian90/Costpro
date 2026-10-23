-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN CORRECTIVA v2.24.1 — REVISIÓN FINAL PR #1465 (2026-10-24)
-- ═══════════════════════════════════════════════════════════════════════
-- Origen: auditoría independiente de la revisión final. Las 3 funciones se
-- reemiten desde sus definiciones VIVAS certificadas (pg_get_functiondef
-- 2026-10-24, paridad exacta con la migración 20261023230000) con 3
-- correcciones quirúrgicas de seguridad/idempotencia. NO cambia reglas
-- contables: los términos del ledger, fórmulas y efectos financieros quedan
-- byte-idénticos (verificado por diff normalizado).
--
-- Correcciones:
--   F1 (medio) create_cash_flow_document: el param_hash del payload nuevo se
--      SOBREESCRIBÍA con el almacenado → misma clave + payload distinto
--      devolvía el documento original en silencio. Ahora compara y lanza
--      ERR_IDEMPOTENCY_KEY_REUSE (paridad create_sale_v2; la ruta ya mapeaba
--      el error a 409 — intención que quedó sin implementar).
--   F2 (medio-alto) create_devolution_v2:
--      a) precio del reembolso anclado al SERVIDOR (price_at_sale_cup
--         ponderado; fallback price_at_sale×tasa del ítem, fail-safe 1). El
--         unit_price del payload se ignora — DF-07 topa cantidad, este gate
--         topa precio (anti-sobre-reembolso).
--      b) pg_advisory_xact_lock por tienda (misma llave que el resto de la
--         maquinaria de caja) — cierra la ventana de carrera
--         entrega-vs-reembolso.
--      c) idempotencia con hash de payload + registro en idempotency_registry
--         (antes: early-return sin comparación).
--   F3 (medio) close_cash_shift: gate de rol admin/manager/encargado — la UI
--      ya bloquea al clerk; el servidor lo replica (antes has_store_access_as
--      aceptaba cualquier membresía activa vía POST directo).
--
-- Despliegue:
--   · Entorno nuevo: 20261023230000 + esta migración (orden secuencial).
--   · Producción (v2.24 aplicada fuera de banda): aplicar ESTA migración
--     cuando el propietario lo autorice — es CREATE OR REPLACE, no destructiva,
--     y deja las funciones byte-idénticas a las vivas salvo los 3 gates.
-- ═══════════════════════════════════════════════════════════════════════

-- ── create_cash_flow_document (v2.24.1) ────────────────────────────────────────────────────────

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
    || v_amount::text || '|' || v_currency || '|' || COALESCE(p_operation_date, 'now')::text || '|'
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
$function$

-- ── create_devolution_v2 (v2.24.1) ────────────────────────────────────────────────────────

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
  IF v_refund_currency NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_CURRENCY: %', v_refund_currency;
  END IF;
  IF p_payment_method IN ('cash','transfer','zelle') AND v_refund_currency = 'USD' THEN
    SELECT ser.rate INTO v_refund_rate
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_refund_rate IS NULL THEN
      SELECT er.rate INTO v_refund_rate
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_refund_rate IS NULL THEN
      SELECT er.rate INTO v_refund_rate
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_refund_rate IS NULL OR v_refund_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: reembolso en USD exige tasa USD de la tienda (jerarquía tienda→BCC→elToque)';
    END IF;
  END IF;

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
    v_refund_amount := CASE WHEN v_refund_currency = 'USD'
                            THEN round(v_total / v_refund_rate, 2)
                            ELSE v_total END;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, direction, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
      v_refund_amount, p_payment_method, v_refund_currency, v_refund_rate,
      v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
    ) RETURNING id INTO v_pt_id;

  ELSIF p_payment_method = 'store_credit' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
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
    'financial_effect', CASE WHEN p_payment_method = 'store_credit' THEN 'store_credit_ledger' ELSE 'cash_out_and_refund' END
  );
END $function$

-- ── close_cash_shift (v2.24.1) ────────────────────────────────────────────────────────

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
      AND created_at <= NOW();

  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Egresos reales de caja — pagos a proveedores en efectivo (recepciones y
  -- servicios recibidos). Excluye ref_type='sale' (cobros de ventas — doble
  -- conteo), 'production_order'/'work' (anticipos = ingresos) y 'commission'.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Anticipos de producción/trabajo EN EFECTIVO son ENTRADAS de caja.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Comisiones SOLO en efectivo.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_closure.created_at
      AND paid_at <= NOW();

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
      AND payment_date <= NOW();

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- el dinero salió del cajón — el esperado baja por el medio real de pago.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

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
      AND payment_date <= NOW();

  -- Calcular totales
  v_system_cash := COALESCE(v_closure.opening_balance, 0)
                 + v_cash_sales + v_cash_production + v_cash_flow_in
                 - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                 - v_cash_refunds;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales
                             - v_voucher_refunds;
  v_difference := (COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0)) - v_system_expected_total;

  -- MISIÓN CAJA 2026-10-23 (D8): lado USD FÍSICO del turno. Esperado USD =
  -- apertura USD + términos USD de la MISMA ventana (clasificación por moneda
  -- del ledger — única fuente: get_cash_currency_summary). El arqueo canónico
  -- CUP de arriba NO se toca. La diferencia USD se REGISTRA tal cual:
  -- jamás se autoajusta el saldo para cuadrar.
  SELECT COALESCE((public.get_cash_currency_summary(
             v_closure.store_id, v_closure.created_at, NULL)->'net'->>'USD')::numeric, 0)
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
$function$

