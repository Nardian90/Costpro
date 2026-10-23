-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN CORRECTIVA v2.24.1 — REVISIÓN FINAL PR #1465 (2026-10-24)
-- ═══════════════════════════════════════════════════════════════════════
-- Origen: auditoría independiente de la revisión final. Las 5 funciones se
-- reemiten desde sus definiciones VIVAS certificadas (pg_get_functiondef
-- 2026-10-24, paridad exacta con la migración 20261023230000) con 4
-- correcciones quirúrgicas de seguridad/idempotencia y 1 re-emisión de
-- completitud (open_cash_shift estaba VIVA en producción sin definición
-- versionada — se aplicó fuera de banda con v2.24.0; el replay del gate
-- source-of-truth no podía reproducirla: LIVE_FUNCTION_NOT_REPRESENTED). NO cambia reglas
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
--   F4 (medio) create_sale_v2: bloqueo preventivo del vuelto NO registrable —
--      un cobro mixto/simple cuyo importe recibido excede el total debido
--      entrega vuelto físico que sin liquidación no queda registrado en
--      ninguna moneda (el libro contaba cash_amount bruto). Se rechaza con
--      ERR_OVERPAYMENT_UNREGISTERED_CHANGE salvo que se envíe la liquidación
--      (identidad recibido − vuelto = cash de la venta) o el pago sea
--      insuficiente (no exige salida física). Cero doble contabilización:
--      buckets settled/legacy mutuamente excluyentes intactos.
--   F5 (completitud) open_cash_shift: re-emisión VERBATIM del volcado vivo
--      (pg_get_functiondef 2026-10-24) — la función existe en producción
--      desde la aplicación fuera de banda de v2.24.0 pero NO estaba en el
--      stream versionado. Sin cuerpo nuevo: se congela el comportamiento
--      vivo certificado (idempotencia con param_hash, saldo contado vs
--      esperado, tasa USD de la tienda). ACL espejo del vivo: service_role.
--
-- Despliegue:
--   · Entorno nuevo: 20261023230000 + esta migración (orden secuencial).
--   · Producción: APLICADA Y VERIFICADA el 2026-10-24 (Management API, una
--     sola transacción; commit 7ee0edba8; paridad pg_get_functiondef ≡
--     versionado 5/5; ACLs correctas; smoke read-only OK; evidencia en
--     audit/deploy-v241-evidence.json). CREATE OR REPLACE, no destructiva.
--     Baselines source_of_truth RETIRADAS tras verificar el despliegue
--     (surface regenerado: 150/150 sin divergencias).
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
$function$;

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
END $function$;

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
$function$;

-- ── create_sale_v2 (v2.24.1) ───────────────────────────────────────────────────────────────────
-- Re-emisión VERBATIM desde 20261023230000 (paridad viva certificada) + gate F4 (§14.9).

CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_supervisor_token_jti text DEFAULT NULL::text, p_supervisor_scope jsonb DEFAULT NULL::jsonb, p_discount_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_payment_incidents jsonb DEFAULT NULL::jsonb, p_cash_received_cup numeric DEFAULT NULL::numeric, p_cash_received_usd numeric DEFAULT NULL::numeric, p_change_given_cup numeric DEFAULT NULL::numeric, p_change_given_usd numeric DEFAULT NULL::numeric, p_change_currency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx_id uuid := gen_random_uuid();
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units numeric;
  -- FIX-USD-CUP-RATE (2026-10-14): conversión por item a la moneda común CUP
  v_item_rate numeric := 1.0;
  v_item_currency text;
  v_stock numeric;
  v_existing uuid;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
  v_calculated_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_taxable_base numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_total numeric := 0;
  v_tax jsonb;
  v_tax_value numeric;
  v_effective_discount_pct numeric := 0;
  v_cash_amt numeric := p_cash_amount;
  -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro (vuelto multimoneda)
  v_settlement_present boolean := false;
  v_chg_rate numeric := NULL;
  v_chg_rate_src text := NULL;
  v_settle_net_cup numeric := 0;
  v_settle_net_usd numeric := 0;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  v_pt_id uuid;
  v_zelle_original_amount numeric;
  v_sum_payments numeric;
  v_wac_prev numeric;
  -- E-SEC (R-SEC-1): precio de referencia server-side y desvío comercial por ítem
  v_catalog_price numeric;
  v_reference_price numeric;
  v_catalog_subtotal numeric := 0;
  v_item_discount_total numeric := 0;
  v_item_discount_pct numeric := 0;
  -- E-SEC-FINAL (D1-D5): umbral por línea, single-use, motivo, snapshot, redondeo
  v_ord bigint;
  v_line_pct numeric := 0;
  v_max_line_pct numeric := 0;
  v_gate_triggered boolean := false;
  v_supervisor_path text := 'none';
  v_reason text;
  v_line_snapshot jsonb := '[]'::jsonb;
  v_snap jsonb;
  v_scope_entry jsonb;
  v_scope_ok boolean := false;
  -- H0-R §6: resolución server-side de la tasa efectiva (D-EXR-01 / D-EXR-02)
  v_server_rate numeric;
  v_rate_source text;
  v_rate_effective_date timestamptz;
  v_client_rate numeric := p_sale_exchange_rate;  -- propuesta cliente: SOLO auditoría/UX (§6.2)
  -- H0-R §5.4: impuestos validados y reconstruidos desde tax_configurations
  v_applied_taxes_canonical jsonb := '[]'::jsonb;
  v_tax_entry jsonb;
  v_tc record;
  v_tax_ids text[] := '{}';
  -- H0-R §7: identidad de idempotencia (param_hash exhaustivo, patrón V2.26)
  v_param_hash text;
  v_idem_result jsonb;
  v_idem_hash text;
  -- MISIÓN-FLEX (2026-10-17): incidencias de pago (flexibilización temporal)
  v_incidents jsonb;
  v_payment_diff numeric := 0;
  v_has_payment_incident boolean := false;
  v_incidence_note text;
  v_notes_final text;
  v_it jsonb;
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes) — sin cambio
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. AUTH (§3.1 paso 2 — ANTES de idempotencia; cierra el oráculo de claves)
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. SELLER BINDING (§4 — Opción B): p_seller_id == actor autenticado, sin
  --    excepciones. El rechazo es temprano y determinista (transactions.seller_id
  --    es NOT NULL: el NULL explícito hoy fallaba tarde, en el INSERT).
  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SELLER_REQUIRED: p_seller_id es obligatorio y debe coincidir con el actor autenticado';
  END IF;
  IF p_seller_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'ERR_SELLER_MISMATCH: p_seller_id=% no coincide con el actor autenticado=%', p_seller_id, v_uid;
  END IF;

  -- 4. Operation date validation — sin cambio
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. IDEMPOTENCIA (§7 — DESPUÉS de auth/seller; identidad = clave + actor +
  --    tienda + param_hash exhaustivo). El registro idempotency_registry
  --    (patrón V2.26, UNIQUE (key, operation)) da la semántica de precedencia:
  --    la misma identidad → MISMA transacción; identidad distinta con la misma
  --    clave → conflicto limpio SIN fuga de transaction_id (fail-closed).
  IF p_idempotency_key IS NOT NULL THEN
    -- §7.2: campos del hash (orden determinista; lo que el cliente ENVÍA)
    v_param_hash := md5(
      'store=' || COALESCE(p_store_id::text, '') ||
      '|actor=' || COALESCE(v_uid::text, '') ||
      '|items=' || COALESCE((
        SELECT string_agg(
          COALESCE(t.value->>'product_id', '') || ':' ||
          COALESCE(t.value->>'variant_id', '') || ':' ||
          COALESCE(t.value->>'quantity', '') || ':' ||
          COALESCE(NULLIF(t.value->>'price_at_sale', ''), t.value->>'price', ''),
          ',' ORDER BY t.value->>'product_id', t.ord)
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      ), '') ||
      '|payment_method=' || COALESCE(p_payment_method, '') ||
      '|cash=' || COALESCE(p_cash_amount::text, '') ||
      '|transfer=' || COALESCE(p_transfer_amount::text, '') ||
      '|zelle=' || COALESCE(p_zelle_amount::text, '') ||
      '|discount_type=' || COALESCE(p_discount_type, '') ||
      '|discount_value=' || COALESCE(p_discount_value::text, '') ||
      '|applied_taxes=' || COALESCE(p_applied_taxes::text, '') ||
      '|sale_currency=' || COALESCE(p_sale_currency, '') ||
      '|sale_exchange_rate=' || COALESCE(p_sale_exchange_rate::text, '') ||
      '|customer_id=' || COALESCE(p_customer_id::text, '') ||
      '|customer_name=' || COALESCE(p_customer_name, '') ||
      '|operation_date=' || COALESCE(NULLIF(FLOOR(EXTRACT(EPOCH FROM p_operation_date))::text, ''), '') ||
      '|total_amount=' || COALESCE(p_total_amount::text, '') ||
      '|subtotal=' || COALESCE(p_subtotal::text, '') ||
      '|tax_amount=' || COALESCE(p_tax_amount::text, '') ||
      -- MISIÓN-FLEX: notas e incidencias forman parte de la identidad
      '|notes=' || COALESCE(p_notes, '') ||
      '|payment_incidents=' || COALESCE(p_payment_incidents::text, '') ||
      -- MISIÓN CAJA 2026-10-23: la liquidación del cobro es parte de la
      -- identidad de la venta (misma clave + liquidación distinta = conflicto)
      '|cash_settlement=' || COALESCE(p_cash_received_cup::text, '') || '/' ||
      COALESCE(p_cash_received_usd::text, '') || '/' ||
      COALESCE(p_change_given_cup::text, '') || '/' ||
      COALESCE(p_change_given_usd::text, '') || '/' ||
      COALESCE(p_change_currency, '')
    );

    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (p_idempotency_key, 'create_sale_v2', v_tx_id, v_param_hash,
            jsonb_build_object('status', 'pending'))
    ON CONFLICT (idempotency_key, operation) DO NOTHING;

    IF NOT FOUND THEN
      -- Registro preexistente: verificar identidad completa
      SELECT result, param_hash INTO v_idem_result, v_idem_hash
        FROM public.idempotency_registry
        WHERE idempotency_key = p_idempotency_key AND operation = 'create_sale_v2'
        LIMIT 1;

      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        -- §7.1: misma clave + payload/actor/tienda distinto → conflicto SIN
        -- transaction_id (jamás retorno silencioso de la venta previa)
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la clave % ya está ligada a otra identidad de venta (payload/actor/tienda)', p_idempotency_key;
      END IF;

      -- Misma identidad → MISMA transacción (0 duplicados)
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
      END IF;

      -- Hash coincide pero la transacción no aparece (creación concurrente en
      -- curso en otra sesión): esperar brevemente y reintentar la lectura.
      PERFORM pg_sleep(0.1);
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
      END IF;
      RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — operación previa con la clave % aún en curso', p_idempotency_key;
    ELSE
      -- Registro recién insertado por esta llamada. Compatibilidad con
      -- transacciones pre-hardening creadas sin registro de identidad: si la
      -- clave ya existe en transactions (índice único global), rechazo limpio
      -- fail-closed en lugar de chocar el índice con un 500 con fuga (§7.3).
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la clave % pertenece a una venta previa sin registro de identidad; utilice una clave nueva', p_idempotency_key;
      END IF;
    END IF;
  END IF;

  -- 6. Auto-promote to mixed — sin cambio
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND p_payment_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  -- MISIÓN-FLEX: con incidencias de pago NO se infla el importe Zelle al total
  -- (un Transf. Exterior parcial debe registrarse como lo reportado).
  IF p_payment_incidents IS NULL AND p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
    v_zelle_amt := p_total_amount;
  END IF;

  -- E-SEC-FINAL (D2): normalización del motivo (obligatoriedad solo si el gate dispara)
  v_reason := btrim(COALESCE(p_discount_reason, ''));
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_DISCOUNT_REASON_INVALID: max 500 caracteres';
  END IF;

  -- 7. Primera pasada — orden determinista por product_id (doctrina W62-05 §2.3):
  --    FOR UPDATE de la fila del producto (serializa stock+WAC) + validaciones.
  FOR v_item, v_ord IN SELECT t.value, t.ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
      ORDER BY (t.value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    -- FIX-USD-CUP-RATE (2026-10-14): conversión del item a la moneda común CUP.
    -- La tasa del item (client-sent, persistida en transaction_items.exchange_rate)
    -- aplica SOLO a items no-CUP; CUP = 1 por definición. Fail-safe: tasa nula o
    -- <= 0 -> 1.0 (la venta CUP pura NO cambia; regresión cero).
    v_item_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'CUP');
    IF v_item_currency = 'CUP' THEN
      v_item_rate := 1.0;
    ELSE
      v_item_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::numeric, 1.0);
      IF v_item_rate <= 0 THEN
        v_item_rate := 1.0;
      END IF;
    END IF;

    SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    IF v_stock IS NULL THEN
      -- fallback legacy: producto sin tienda (servicios globales)
      SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
        FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);

    -- DF-02: costo SIEMPRE del servidor (WAC_prev bajo lock)
    IF v_wac_prev IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;
    IF v_wac_prev = 0 THEN
      IF NOT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                     WHERE store_id = p_store_id AND product_id = v_pid AND scope = 'sale') THEN
        RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_pid;
      END IF;
    END IF;

    -- Saltar validación de stock para servicios
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      IF v_stock < v_units THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units;
      END IF;
    END IF;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    -- DF-02: claves cost_at_sale/cost del request IGNORADAS (no error)
    v_cost := v_wac_prev;

    -- E-SEC (R-SEC-1): precio inválido rechazado EN EL SERVIDOR
    IF v_price IS NULL OR v_price <> v_price
       OR v_price >= 'Infinity'::numeric OR v_price <= '-Infinity'::numeric
       OR v_price < 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale=% product=%', v_price, v_pid;
    END IF;

    -- E-SEC-FINAL (D5): precio monetario de línea → 2 decimales
    v_price := ROUND(v_price, 2);

    -- E-SEC (R-SEC-1): precio de referencia del SERVIDOR para evaluar el desvío
    IF v_variant_id IS NOT NULL THEN
      SELECT price INTO v_reference_price
        FROM public.product_variants WHERE id = v_variant_id;
      v_reference_price := COALESCE(v_reference_price, v_catalog_price);
    ELSE
      v_reference_price := v_catalog_price;
    END IF;

    IF v_reference_price IS NOT NULL THEN
      v_reference_price := ROUND(v_reference_price, 2);
    END IF;

    IF v_reference_price IS NOT NULL AND v_reference_price > 0 THEN
      v_catalog_subtotal := v_catalog_subtotal + (v_reference_price * v_qty);
      v_line_pct := 0;
      IF v_price < v_reference_price THEN
        v_item_discount_total := v_item_discount_total
          + ((v_reference_price - v_price) * v_qty);
        v_line_pct := ((v_reference_price - v_price) / v_reference_price) * 100;
      END IF;
      IF v_line_pct > v_max_line_pct THEN
        v_max_line_pct := v_line_pct;
      END IF;
      v_line_snapshot := v_line_snapshot || jsonb_build_object(
        'ord', v_ord,
        'product_id', v_pid,
        'variant_id', v_variant_id,
        'catalog_price', v_reference_price,
        'price_at_sale', v_price,
        'discount_value', ROUND(GREATEST(0, v_reference_price - v_price) * v_qty, 2),
        'discount_pct', ROUND(v_line_pct, 2)
      );
    END IF;

    -- FIX-USD-CUP-RATE: el total de la venta es CUP = Σ precio nativo × tasa del item × qty
    v_calculated_subtotal := v_calculated_subtotal + ROUND((v_price * v_item_rate * v_qty), 2);
  END LOOP;

  -- 8. Recalcular descuento (§8: el descuento NEGATIVO queda estructuralmente
  --    imposibilitado — hoy LEAST(-100, subtotal) inflaba el total, T-FIN-007)
  IF p_discount_value IS NULL OR p_discount_value < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_DISCOUNT: %', p_discount_value;
  END IF;
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 9. Impuestos (§5.4): el cliente PROPONE (ids); el servidor VALIDA contra el
  --    catálogo autorizado (tax_configurations: global + tienda) y REEMPLAZA con
  --    la entrada canónica reconstruida desde la fila. El JSONB cliente JAMÁS se
  --    persiste tal cual. Entradas sin id / id desconocido / inactivo / de otra
  --    tienda / duplicado → ERR_APPLIED_TAX_INVALID (mensaje uniforme, sin
  --    revelar si el id existe).
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  v_applied_taxes_canonical := '[]'::jsonb;
  v_tax_ids := '{}';
  IF p_applied_taxes IS NULL OR jsonb_typeof(p_applied_taxes) <> 'array' THEN
    RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: p_applied_taxes debe ser un array de {id}';
  END IF;
  FOR v_tax_entry IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax_entry->>'id' IS NULL OR btrim(v_tax_entry->>'id') = ''
       OR v_tax_entry->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: entrada sin id de configuración';
    END IF;
    SELECT id, name, type, value, min_exempt INTO v_tc
      FROM public.tax_configurations
      WHERE id = (v_tax_entry->>'id')::uuid
        AND is_active = true
        AND (store_id IS NULL OR store_id = p_store_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID';
    END IF;
    IF v_tc.id::text = ANY(v_tax_ids) THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: impuesto duplicado';
    END IF;
    v_tax_ids := array_append(v_tax_ids, v_tc.id::text);
    v_applied_taxes_canonical := v_applied_taxes_canonical || jsonb_build_object(
      'id', v_tc.id, 'name', v_tc.name, 'type', v_tc.type,
      'value', v_tc.value, 'min_exempt', v_tc.min_exempt);
    IF v_tc.type = 'percentage' THEN
      v_tax_value := GREATEST(0, v_taxable_base - COALESCE(v_tc.min_exempt, 0)) * v_tc.value / 100;
    ELSE
      v_tax_value := v_tc.value;
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 10. Tasa de cambio (§6.1): resolución SERVER-SIDE exclusiva. Jerarquía:
  --     store_exchange_rates (updated_at) → exchange_rates BCC seg 3 (rate_date)
  --     → exchange_rates elToque (rate_date) → fail-closed. D-EXR-01: la tasa
  --     que gana por precedencia y tiene fecha efectiva > 45 días → ERR_RATE_STALE
  --     (FAIL CLOSED, sin salto silencioso a fuente inferior, sin sustitución por
  --     la tasa del cliente). D-EXR-02: p_sale_exchange_rate queda como dato
  --     recibido SIN autoridad financiera (0/−5/680/1000000 → mismo destino:
  --     ignorados; la desviación NUNCA bloquea).
  v_server_rate := NULL;
  v_rate_source := NULL;
  v_rate_effective_date := NULL;
  IF p_sale_currency = 'CUP' THEN
    v_server_rate := 1;  -- CUP = 1 por definición (sin fuente, sin staleness)
  ELSE
    SELECT ser.rate, 'store', ser.updated_at
      INTO v_server_rate, v_rate_source, v_rate_effective_date
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = p_sale_currency;
    IF v_server_rate IS NULL THEN
      SELECT er.rate, 'global_bcc_seg3', er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_server_rate IS NULL THEN
      SELECT er.rate, 'global_eltoque', er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_server_rate IS NULL OR v_server_rate <= 0 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: currency=%, store=%', p_sale_currency, p_store_id;
    END IF;
    IF v_rate_effective_date < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: currency=%, store=%, source=%, effective=%',
        p_sale_currency, p_store_id, v_rate_source, v_rate_effective_date;
    END IF;
  END IF;

  -- 11. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 11.5 REGLA INNEGOCIABLE (MISIÓN 2026-10-17): una venta ordinaria con
  --     total NEGATIVO jamás se aprueba. Estructuralmente el recálculo ya lo
  --     impide (precio >= 0, descuento LEAST(subtotal), impuestos >= 0); este
  --     guard explícito es defensa en profundidad y produce un error
  --     tipado que la API registra en Auditoría (sale_negative_rejected).
  IF v_calculated_total < 0 THEN
    RAISE EXCEPTION 'ERR_NEGATIVE_SALE: total=% — una venta con total negativo no puede aprobarse', v_calculated_total;
  END IF;

  -- 11.6 MISIÓN-FLEX: normalización de incidencias de pago (flexibilización
  --     TEMPORAL de diferencias de pago). Solo el flujo del cliente que
  --     documentó la incidencia puede registrar una venta descuadrada; un
  --     cliente sin soporte sigue recibiendo el rechazo canónico.
  v_incidents := NULL;
  IF p_payment_incidents IS NOT NULL
     AND jsonb_typeof(p_payment_incidents) = 'array'
     AND jsonb_array_length(p_payment_incidents) > 0 THEN
    -- Guardrail de integridad financiera: sin tasa REAL para USD/EUR las
    -- diferencias NO son validables (fail-closed, ERR_RATE_REQUIRED_FOR_INCIDENT).
    FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_item_currency := COALESCE(NULLIF(v_it->>'currency', ''), 'CUP');
      IF v_item_currency IN ('USD', 'EUR') THEN
        v_item_rate := COALESCE(NULLIF(v_it->>'exchange_rate', '')::numeric, 1.0);
        IF v_item_rate <= 1.0 THEN
          RAISE EXCEPTION 'ERR_RATE_REQUIRED_FOR_INCIDENT: currency=%, rate=% — configure la tasa de la tienda antes de registrar incidencias de pago', v_item_currency, v_item_rate;
        END IF;
      END IF;
    END LOOP;
    v_incidents := p_payment_incidents;
  END IF;

  -- 12. Validar total vs cliente (tolerancia 0.01)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 13. Validar supervisor auth (gate D1–D5 E-SEC-FINAL — SIN CAMBIO)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;
  IF v_catalog_subtotal > 0 THEN
    v_item_discount_pct := (v_item_discount_total / v_catalog_subtotal) * 100;
  END IF;

  IF v_effective_discount_pct >= 15 OR v_max_line_pct >= 15 THEN
    v_gate_triggered := true;
  END IF;

  IF v_gate_triggered THEN
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: global_pct=%, max_line_pct=%', v_effective_discount_pct, v_max_line_pct;
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'ERR_DISCOUNT_REASON_REQUIRED: motivo obligatorio para descuento autorizado';
    END IF;
    IF auth.role() <> 'service_role'
       AND p_supervisor_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;

    IF auth.role() = 'service_role' THEN
      v_supervisor_path := 'token';
      IF p_supervisor_token_jti IS NULL OR btrim(p_supervisor_token_jti) = '' THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REQUIRED: token de supervisor requerido';
      END IF;
      INSERT INTO public.supervisor_token_usages
        (jti, supervisor_user_id, operator_user_id, store_id, transaction_id)
      VALUES
        (btrim(p_supervisor_token_jti), p_supervisor_user_id, v_uid, p_store_id, v_tx_id)
      ON CONFLICT (jti) DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REUSED: jti ya consumido';
      END IF;

      IF v_max_line_pct >= 15 THEN
        IF p_supervisor_scope IS NULL OR jsonb_typeof(p_supervisor_scope) <> 'array' THEN
          RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: scope ausente para lineas >=15%%';
        END IF;
        IF jsonb_array_length(p_supervisor_scope) = 0 THEN
          RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: scope vacio para lineas >=15%%';
        END IF;
        FOR v_snap IN SELECT * FROM jsonb_array_elements(v_line_snapshot) LOOP
          IF COALESCE((v_snap->>'discount_pct')::numeric, 0) >= 15 THEN
            v_scope_ok := false;
            FOR v_scope_entry IN SELECT * FROM jsonb_array_elements(p_supervisor_scope) LOOP
              IF v_scope_entry->>'pid' IS NOT NULL
                 AND v_scope_entry->>'pid' = v_snap->>'product_id'
                 AND COALESCE(v_scope_entry->>'vid', '') = COALESCE(v_snap->>'variant_id', '')
                 AND ROUND(COALESCE((v_scope_entry->>'px')::numeric, -1), 2)
                     <= ROUND((v_snap->>'price_at_sale')::numeric, 2) THEN
                v_scope_ok := true;
                EXIT;
              END IF;
            END LOOP;
            IF NOT v_scope_ok THEN
              RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: product=%, price=% no cubierto por el scope autorizado', v_snap->>'product_id', v_snap->>'price_at_sale';
            END IF;
          END IF;
        END LOOP;
      END IF;
    ELSE
      v_supervisor_path := 'self_session';
    END IF;
  END IF;

  -- 14. Validar/setear payment split
  --     MISIÓN-FLEX (2026-10-17): con incidencias documentadas por el cliente
  --     (v_incidents) se permiten faltante/sobrepago/desglose descuadrado y
  --     se registran los importes REALMENTE recibidos. Sin incidencias el
  --     comportamiento canónico anterior queda intacto (fail-closed).
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 1.00 THEN
      IF v_incidents IS NULL THEN
        RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
          v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
      END IF;
      -- flexibilizado: la diferencia se documenta en nota + auditoría
    END IF;
  ELSIF v_effective_method = 'cash' THEN
    IF v_incidents IS NOT NULL AND p_cash_amount IS NOT NULL AND p_cash_amount >= 0 THEN
      v_cash_amt := p_cash_amount;  -- lo realmente recibido (puede faltar/sobrar)
    ELSE
      v_cash_amt := v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'transfer' THEN
    IF v_incidents IS NOT NULL AND p_transfer_amount IS NOT NULL AND p_transfer_amount >= 0 THEN
      v_transfer_amt := p_transfer_amount;
    ELSE
      v_transfer_amt := v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'zelle' THEN
    IF v_incidents IS NOT NULL AND p_zelle_amount IS NOT NULL AND p_zelle_amount >= 0 THEN
      v_zelle_amt := p_zelle_amount;
    ELSE
      v_zelle_amt := v_calculated_total;
    END IF;
  END IF;

  -- 14.5 MISIÓN-FLEX: diferencia de pago + nota automática de incidencia.
  --     La nota respeta la nota manual (p_notes) SIN sobrescribirla: se
  --     antepone y la incidencia se añade en línea nueva.
  v_payment_diff := ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total, 2);
  v_has_payment_incident := (v_incidents IS NOT NULL)
    AND (abs(v_payment_diff) > 0.01 OR jsonb_array_length(v_incidents) > 0);
  v_incidence_note := NULL;
  IF v_has_payment_incident THEN
    IF v_payment_diff < 0 THEN
      v_incidence_note := 'INCIDENCIA DE PAGO: venta registrada con pago insuficiente. Total: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. Importe recibido: '
        || to_char(v_cash_amt + v_transfer_amt + v_zelle_amt, 'FM999999990.00')
        || ' CUP. Pendiente: ' || to_char(abs(v_payment_diff), 'FM999999990.00') || ' CUP.';
    ELSIF v_payment_diff > 0 THEN
      v_incidence_note := 'INCIDENCIA DE PAGO: sobrepago detectado. Total de venta: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. Importe recibido: '
        || to_char(v_cash_amt + v_transfer_amt + v_zelle_amt, 'FM999999990.00')
        || ' CUP. Diferencia: ' || to_char(v_payment_diff, 'FM999999990.00')
        || ' CUP. Revisar el tratamiento del vuelto según los medios de pago utilizados.';
    ELSE
      v_incidence_note := 'INCIDENCIA DE PAGO: descuadre en el desglose de medios de pago. Total de venta: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. El desglose por línea se conserva documentado en la venta.';
    END IF;
    v_incidence_note := v_incidence_note
      || ' Validación temporal autorizada por la configuración del sistema. ['
      || to_char(v_eff AT TIME ZONE 'America/Havana', 'YYYY-MM-DD HH24:MI')
      || ' HV] usuario=' || COALESCE(v_uid::text, 'desconocido');
  END IF;
  v_notes_final := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF v_notes_final IS NOT NULL AND v_incidence_note IS NOT NULL THEN
    v_notes_final := v_notes_final || E'\n' || v_incidence_note;
  ELSIF v_incidence_note IS NOT NULL THEN
    v_notes_final := v_incidence_note;
  END IF;

  -- 14.7 MISIÓN CAJA 2026-10-23 (D6): LIQUIDACIÓN DEL COBRO — vuelto por
  --      moneda, ENLAZADO a la venta. El efecto en caja sigue siendo UNO
  --      (cash_amount neto canónico): NO se crea fila de caja aparte para el
  --      vuelto (prohibido duplicar — misión §8). Validación server-side:
  --        · importes no negativos; vuelto ≤ recibido POR MONEDA;
  --        · moneda de vuelto ∈ (CUP, USD);
  --        · cobro/vuelto en USD ⇒ tasa SERVIDOR obligatoria (jerarquía de
  --          ventas, fail-closed) con fuente registrada — sin tasas ocultas;
  --        · (recibido CUP − vuelto CUP) + (recibido USD − vuelto USD)×tasa =
  --          componente cash de la venta (±0.01) ⇒ sin diferencias contables.
  --      Sin liquidación (ventas legacy/transfer/zelle) el flujo queda
  --      IDÉNTICO a v2.23.0 (columnas NULL).
  v_settlement_present := (p_cash_received_cup IS NOT NULL OR p_cash_received_usd IS NOT NULL
    OR p_change_given_cup IS NOT NULL OR p_change_given_usd IS NOT NULL);
  IF v_settlement_present THEN
    IF COALESCE(p_cash_received_cup, 0) < 0 OR COALESCE(p_cash_received_usd, 0) < 0
       OR COALESCE(p_change_given_cup, 0) < 0 OR COALESCE(p_change_given_usd, 0) < 0 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_INVALID: los importes de la liquidación no pueden ser negativos';
    END IF;
    IF p_change_currency IS NOT NULL AND upper(btrim(p_change_currency)) NOT IN ('CUP', 'USD') THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_INVALID: moneda de vuelto no admitida (%)', p_change_currency;
    END IF;
    IF COALESCE(p_cash_received_cup, 0) + COALESCE(p_cash_received_usd, 0)
       + COALESCE(p_change_given_cup, 0) + COALESCE(p_change_given_usd, 0) > 0
       AND v_cash_amt <= 0 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_NOT_APPLICABLE: la venta no tiene componente en efectivo';
    END IF;
    -- NOTA: NO se exige «vuelto ≤ recibido POR MONEDA»: el vuelto puede darse
    -- en una moneda NO recibida (misión §8: paga 60.000 CUP → recibe 80 USD de
    -- vuelto — el cajón USD puede quedar momentáneamente negativo si no había
    -- billetes; el LIBRO por moneda lo refleja y la ENTREGA valida contra el
    -- saldo acumulado). La restricción real es CANÓNICA y se valida abajo:
    -- recibido − vuelto (a tasa servidor) = cash de la venta ≥ 0.
    IF COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0 THEN
      SELECT ser.rate, 'store_exchange_rates' INTO v_chg_rate, v_chg_rate_src
        FROM public.store_exchange_rates ser
        WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
      IF v_chg_rate IS NULL THEN
        SELECT er.rate, 'global_bcc_seg3' INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL THEN
        SELECT er.rate, 'global_eltoque' INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'elToque'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL OR v_chg_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: el cobro/vuelto en USD exige tasa USD de la tienda (jerarquía tienda→BCC→elToque) — sin tasa no se completa la operación (tienda %)', p_store_id;
      END IF;
    END IF;
    v_settle_net_cup := COALESCE(p_cash_received_cup, 0) - COALESCE(p_change_given_cup, 0);
    v_settle_net_usd := COALESCE(p_cash_received_usd, 0) - COALESCE(p_change_given_usd, 0);
    IF abs((v_settle_net_cup + v_settle_net_usd * COALESCE(v_chg_rate, v_server_rate)) - v_cash_amt) > 0.01 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_MISMATCH: la liquidación (%) no cuadra con el efectivo de la venta (%)',
        round(v_settle_net_cup + v_settle_net_usd * COALESCE(v_chg_rate, v_server_rate), 2), round(v_cash_amt, 2);
    END IF;
  END IF;

  -- 14.9 REVISIÓN FINAL v2.24.1 (F4) — bloqueo preventivo del vuelto NO
  --     registrable (cobros mixtos / sobrepagos sin liquidación). Un cobro
  --     cuyo importe recibido excede el total debido exige entregar vuelto
  --     físico. Sin liquidación (cash_received_*/change_given_*), ese vuelto
  --     no queda registrado en NINGUNA moneda y el libro sobreestima el
  --     efectivo disponible (defecto medio del escenario C de la auditoría).
  --     La venta se RECHAZA: el cajero debe (a) ajustar el desglose a
  --     importes exactos, (b) registrar el cobro con la liquidación de
  --     vuelto (identidad recibido − vuelto = cash de la venta, ya soportada
  --     para cualquier método), o (c) cobrar el faltante como incidencia —
  --     el pago insuficiente NO se toca: no exige salida física de caja.
  --     Ventas históricas: intactas (el gate solo aplica a INSERT nuevos).
  IF NOT v_settlement_present AND v_payment_diff > 0.01 THEN
    RAISE EXCEPTION 'ERR_OVERPAYMENT_UNREGISTERED_CHANGE: recibido (%) > total (%) sin liquidación de vuelto — el vuelto físico no sería registrable por el backend; ajuste el desglose o registre la liquidación',
      ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt, 2), ROUND(v_calculated_total, 2);
  END IF;

  -- 15. INSERT transactions — §6.3/§4/§5.4: tasa servidor, seller = v_uid,
  --     impuestos = snapshot canónico del catálogo
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name,
    -- MISIÓN-FLEX: nota (manual + incidencia) e incidencias estructuradas
    notes, payment_incidents,
    -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro (vuelto multimoneda)
    cash_received_cup, cash_received_usd, change_given_cup, change_given_usd,
    change_currency, change_exchange_rate, change_rate_source
  ) VALUES (
    v_tx_id, p_store_id, v_uid, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, v_applied_taxes_canonical,
    p_sale_currency, v_server_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name,
    v_notes_final, v_incidents,
    p_cash_received_cup, p_cash_received_usd, p_change_given_cup, p_change_given_usd,
    CASE WHEN v_settlement_present THEN COALESCE(upper(btrim(p_change_currency)),
      CASE WHEN COALESCE(p_change_given_usd, 0) > 0 THEN 'USD' ELSE 'CUP' END) END,
    CASE WHEN v_settlement_present AND (COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0)
      THEN v_chg_rate END,
    CASE WHEN v_settlement_present AND (COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0)
      THEN v_chg_rate_src END
  );

  -- 16. Segunda pasada: stock movement + transaction_items — MISMA autoridad de costo
  FOR v_item, v_ord IN SELECT t.value, t.ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
      ORDER BY (t.value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;
    v_price := ROUND(v_price, 2);

    -- FIX-USD-CUP-RATE (2026-10-14): conversión del item a la moneda común CUP.
    -- La tasa del item (client-sent, persistida en transaction_items.exchange_rate)
    -- aplica SOLO a items no-CUP; CUP = 1 por definición. Fail-safe: tasa nula o
    -- <= 0 -> 1.0 (la venta CUP pura NO cambia; regresión cero).
    v_item_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'CUP');
    IF v_item_currency = 'CUP' THEN
      v_item_rate := 1.0;
    ELSE
      v_item_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::numeric, 1.0);
      IF v_item_rate <= 0 THEN
        v_item_rate := 1.0;
      END IF;
    END IF;

    SELECT e INTO v_snap FROM jsonb_array_elements(v_line_snapshot) AS e
      WHERE (e->>'ord')::bigint = v_ord;

    SELECT cost_average INTO v_cost
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;
    IF v_cost IS NULL THEN
      SELECT cost_average INTO v_cost FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    IF v_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
        p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
        p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
      cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
      cash_currency, transfer_currency, zelle_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      zelle_discount_type, zelle_discount_value, zelle_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup,
      catalog_price_at_sale, item_discount_value, item_discount_pct
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum,
      v_discount_amount,
      p_sale_currency,
      -- FIX-USD-CUP-RATE: precio CUP del item con SU tasa (antes v_server_rate,
      -- que es la tasa de la VENTA y es 1 en ventas CUP: un item USD quedaba
      -- registrado con su precio nativo como si fuera CUP).
      v_price * v_item_rate,
      (v_snap->>'catalog_price')::numeric,
      COALESCE((v_snap->>'discount_value')::numeric, 0),
      COALESCE((v_snap->>'discount_pct')::numeric, 0)
    );
  END LOOP;

  -- 17. payment_transactions (fuente autoritativa de pagos) — §6.3: zelle
  --     siempre con la tasa servidor
  IF v_cash_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_cash_amt, 'cash', 'CUP', 1.0,
      v_eff, v_uid, 'pay-cash-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_transfer_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_transfer_amt, 'transfer', 'CUP', 1.0,
      v_eff, v_uid, 'pay-transfer-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_zelle_amt > 0 THEN
    IF p_sale_currency = 'CUP' OR v_server_rate IS NULL OR v_server_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and server_exchange_rate > 1. Got: currency=%, rate=%',
        p_sale_currency, v_server_rate USING ERRCODE = 'PT009';
    END IF;
    IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
        p_sale_currency USING ERRCODE = 'PT004';
    END IF;
    v_zelle_original_amount := v_zelle_amt / v_server_rate;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_zelle_original_amount, 'zelle', p_sale_currency, v_server_rate,
      v_eff, v_uid, 'pay-zelle-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 18. Validación post-INSERT: I1b (POS exige pago completo) — sin cambio
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_tx_id;

  IF ABS(v_sum_payments - v_calculated_total) > 0.01 THEN
    IF v_incidents IS NULL THEN
      RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
        v_sum_payments, v_calculated_total USING ERRCODE = 'PT011';
    END IF;
    -- MISIÓN-FLEX: venta con incidencia de pago documentada — la diferencia
    -- entre lo recibido y el total queda registrada en notes +
    -- payment_incidents + evento SALE_PAYMENT_INCIDENT (trazabilidad).
  END IF;

  -- 19. Cerrar el registro de idempotencia con el resultado definitivo
  --     (patrón V2.26: el retry posterior lee el resultado del registry)
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_registry
      SET result = jsonb_build_object('status', 'success', 'transaction_id', v_tx_id)
      WHERE idempotency_key = p_idempotency_key AND operation = 'create_sale_v2';
  END IF;

  -- 20. Audit log completo — §6.2/§7: auditoría ampliada con tasa cliente/servidor
  --     (observabilidad NO autoritativa de la divergencia, D-EXR-02) y param_hash
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object(
      'total_amount', v_calculated_total,
      'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount,
      'discount_pct', v_effective_discount_pct,
      'catalog_subtotal', v_catalog_subtotal,
      'item_discount_total', v_item_discount_total,
      'item_discount_pct', v_item_discount_pct,
      'max_line_discount_pct', v_max_line_pct,
      'tax_amount', v_calculated_tax,
      'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id,
      'supervisor_id', p_supervisor_user_id,
      'discount_reason', v_reason,
      'supervisor_path', v_supervisor_path,
      'supervisor_token_jti', CASE WHEN v_supervisor_path = 'token' THEN btrim(p_supervisor_token_jti) END,
      'lines', v_line_snapshot,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true,
      'payment_transactions_created', true,
      'cogs_authority', 'server_side_wac_df02',
      'policy_version', 'E-SEC-FINAL',
      -- H0-R §6.2 (D-EXR-02): trazabilidad no-autoritativa de la tasa
      'client_rate', v_client_rate,
      'server_rate', v_server_rate,
      'rate_source', v_rate_source,
      'rate_authority', 'server_side_h0r_d_exr',
      -- H0-R §7: identidad de idempotencia auditada
      'idempotency_param_hash', v_param_hash,
      -- H0-R §5.4: autoridad fiscal del snapshot
      'tax_authority', 'tax_configurations_server_side',
      -- MISIÓN-FLEX (2026-10-17): incidencias de pago y nota de la venta
      'has_payment_incident', v_has_payment_incident,
      'payment_diff_cup', v_payment_diff,
      'payment_incidents', COALESCE(v_incidents, '[]'::jsonb),
      'sale_notes', v_notes_final,
      -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro auditada
      'cash_settlement_present', v_settlement_present,
      'cash_received_cup', p_cash_received_cup,
      'cash_received_usd', p_cash_received_usd,
      'change_given_cup', p_change_given_cup,
      'change_given_usd', p_change_given_usd,
      'change_rate', v_chg_rate,
      'change_rate_source', v_chg_rate_src
    ));

  -- 20.5 MISIÓN-FLEX: evento de auditoría dedicado por venta con incidencia
  --     de pago (visible y filtrable en Inicio → OPERACIÓN → Auditoría).
  --     Vive en la MISMA transacción de la venta: sin duplicados en reintentos
  --     (idempotencia §5) y jamás se registra si la venta no se persiste.
  IF v_has_payment_incident THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('SALE_PAYMENT_INCIDENT', 'transactions', v_tx_id, p_store_id, v_uid,
      jsonb_build_object(
        'transaction_id', v_tx_id,
        'total_amount', v_calculated_total,
        'received_amount_cup', ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt, 2),
        'difference_cup', v_payment_diff,
        'incidents', v_incidents,
        'note', v_notes_final,
        'payment_method', v_effective_method,
        'flexibilization', 'temporal_payment_validation',
        'policy_version', 'MISION-FLEX-2026-10-17'
      ));
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END $function$;

-- ── open_cash_shift (v2.24.1 — re-emisión de completitud) ──────────────────────────────────────
-- Definición VIVA certificada (pg_get_functiondef 2026-10-24): la función fue
-- aplicada fuera de banda junto a v2.24.0 y faltaba en el stream versionado.
-- Sin cambios de comportamiento: se reproduce el cuerpo vivo byte-idéntico.

CREATE OR REPLACE FUNCTION public.open_cash_shift(p_store_id uuid, p_opening_balance_cup numeric, p_opening_balance_usd numeric DEFAULT 0, p_opening_note text DEFAULT NULL::text, p_difference_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_counted_cup numeric;
  v_counted_usd numeric;
  v_expected_cup numeric := 0;
  v_expected_usd numeric := 0;
  v_diff_cup numeric := 0;
  v_diff_usd numeric := 0;
  v_diff_note text;
  v_usd_rate numeric;
  v_usd_rate_source text;
  v_opening_canonical numeric := 0;
  v_existing public.cash_closures%ROWTYPE;
  v_closure_id uuid;
  v_param_hash text;
  v_idem jsonb;
  v_summary jsonb;
  v_result jsonb;
BEGIN
  -- 1. AUTH actor-explícito + rol de operación de caja (paridad con el INSERT
  --    directo que hoy hace la UI con las policies de cash_closures)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado', 'clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda';
  END IF;

  -- 2. Validación de los importes declarados: no negativos, 2 decimales
  v_counted_cup := COALESCE(p_opening_balance_cup, 0);
  v_counted_usd := COALESCE(p_opening_balance_usd, 0);
  IF v_counted_cup < 0 OR v_counted_usd < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: el efectivo declarado no puede ser negativo';
  END IF;
  IF v_counted_cup <> round(v_counted_cup, 2) OR v_counted_usd <> round(v_counted_usd, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;

  -- 3. Advisory lock por tienda (serializa aperturas/cierres/entregas)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 4. IDEMPOTENCIA (patrón v2.26)
  v_param_hash := md5(
    p_store_id::text || '|' || v_caller_uid::text || '|'
    || v_counted_cup::text || '|' || v_counted_usd::text
    || '|' || COALESCE(btrim(p_opening_note), '')
  );
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT ir.result INTO v_idem
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'open_cash_shift'
      LIMIT 1;
    IF v_idem IS NOT NULL THEN
      SELECT ir.param_hash INTO v_param_hash
        FROM public.idempotency_registry ir
        WHERE ir.idempotency_key = p_idempotency_key
          AND ir.operation = 'open_cash_shift'
        LIMIT 1;
      IF v_param_hash IS NULL OR v_idem IS NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_idem;
    END IF;
  END IF;

  -- 5. Un solo turno pendiente por tienda (índice único vivo one_pending_*)
  SELECT * INTO v_existing FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    LIMIT 1
    FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'ERR_SHIFT_ALREADY_OPEN: ya existe un turno pendiente (abierto %) — ciérralo antes de abrir uno nuevo', v_existing.created_at;
  END IF;

  -- 6. Tasa USD server-side para la apertura canónica (jerarquía de ventas)
  v_usd_rate := NULL;
  v_usd_rate_source := NULL;
  IF v_counted_usd > 0 THEN
    SELECT ser.rate, 'store_exchange_rates' INTO v_usd_rate, v_usd_rate_source
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_usd_rate IS NULL THEN
      SELECT er.rate, 'global_bcc_seg3' INTO v_usd_rate, v_usd_rate_source
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_usd_rate IS NULL THEN
      SELECT er.rate, 'global_eltoque' INTO v_usd_rate, v_usd_rate_source
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda antes de declarar apertura en USD';
    END IF;
  END IF;

  -- 7. SALDO ESPERADO del libro por moneda (sin semillas de apertura — D2)
  v_summary := public.get_cash_currency_summary(p_store_id, NULL, NULL);
  v_expected_cup := COALESCE((v_summary->'net'->>'CUP')::numeric, 0);
  v_expected_usd := COALESCE((v_summary->'net'->>'USD')::numeric, 0);
  v_diff_cup := round(v_counted_cup - v_expected_cup, 2);
  v_diff_usd := round(v_counted_usd - v_expected_usd, 2);

  -- 8. Gestión AUTORIZADA de la diferencia (misión §10.8): jamás silenciosa
  v_diff_note := NULLIF(btrim(COALESCE(p_difference_note, '')), '');
  IF (abs(v_diff_cup) > 0.01 OR abs(v_diff_usd) > 0.01) AND (v_diff_note IS NULL OR length(v_diff_note) < 10) THEN
    RAISE EXCEPTION 'ERR_OPENING_DIFFERENCE_NOTE_REQUIRED: lo contado difiere del saldo del libro (CUP %, USD %) — documente la causa autorizada de la diferencia',
      round(v_diff_cup, 2), round(v_diff_usd, 2);
  END IF;

  -- 9. INSERT del turno: apertura canónica (fórmulas v2.23.0 intactas) +
  --    desglose físico + diferencias registradas
  v_opening_canonical := v_counted_cup + (v_counted_usd * COALESCE(v_usd_rate, 0));
  INSERT INTO public.cash_closures (
    store_id, user_id, status,
    opening_balance, opening_balance_cup, opening_balance_usd,
    opening_difference_cup, opening_difference_usd, opening_difference_note,
    notes
  ) VALUES (
    p_store_id, v_caller_uid, 'pendiente',
    v_opening_canonical, v_counted_cup, v_counted_usd,
    v_diff_cup, v_diff_usd, v_diff_note,
    NULLIF(btrim(COALESCE(p_opening_note, '')), '')
  )
  RETURNING id INTO v_closure_id;

  -- 10. Auditoría atómica
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'CASH_SHIFT_OPENED', 'cash_closures', v_closure_id,
    jsonb_build_object(
      'opening_balance_cup', v_counted_cup,
      'opening_balance_usd', v_counted_usd,
      'opening_canonical_cup', round(v_opening_canonical, 2),
      'expected_cup', round(v_expected_cup, 2),
      'expected_usd', round(v_expected_usd, 2),
      'difference_cup', v_diff_cup,
      'difference_usd', v_diff_usd,
      'difference_note', v_diff_note,
      'usd_rate', v_usd_rate,
      'usd_rate_source', v_usd_rate_source,
      'formula', 'v1.0.0'
    )
  );

  v_result := jsonb_build_object(
    'status', 'success',
    'closure_id', v_closure_id,
    'counted_cup', v_counted_cup,
    'counted_usd', v_counted_usd,
    'expected_cup', round(v_expected_cup, 2),
    'expected_usd', round(v_expected_usd, 2),
    'difference_cup', v_diff_cup,
    'difference_usd', v_diff_usd,
    'opening_canonical_cup', round(v_opening_canonical, 2),
    'usd_rate', v_usd_rate,
    'usd_rate_source', v_usd_rate_source
  );

  -- 11. Registro de idempotencia (después del éxito — patrón v2.26)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (btrim(p_idempotency_key), 'open_cash_shift', v_closure_id, v_param_hash, v_result)
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;

-- ACL espejo del estado vivo (proacl 2026-10-24: postgres=X/postgres, service_role=X/postgres)
revoke all on function public.open_cash_shift(uuid, numeric, numeric, text, text, text, uuid) from public;
grant execute on function public.open_cash_shift(uuid, numeric, numeric, text, text, text, uuid) to service_role;
