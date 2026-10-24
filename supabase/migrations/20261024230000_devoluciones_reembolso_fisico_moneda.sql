-- ═══════════════════════════════════════════════════════════════════════
-- 20261024230000_devoluciones_reembolso_fisico_moneda.sql
-- MISIÓN POST-MERGE FINAL (24/10/2026) — cierre del riesgo residual §16.7:
-- reembolsos en efectivo de devoluciones comerciales (create_devolution_v2).
-- MIGRACIÓN CONSECUTIVA de 20261024220000 (ambas PENDIENTES de aplicación
-- autorizada; plan de revisión coherente dentro del PR #1470).
--
-- CAUSA RAÍZ (11 repros en BD aislada con expectativas pre-calculadas, tasa
-- sintética 400, misión §4 matriz B):
--   · create_devolution_v2 reembolsaba en efectivo SIN validación de saldo
--     físico por moneda: el reembolso simplemente persiste la fila refund
--     (direction='refund', currency=p_refund_currency) y el libro la resta.
--     Con físico 100 CUP un reembolso de 3000 CUP era ACEPTADO → −2900.
--   · La moneda del reembolso es elección libre del operador (default CUP)
--     sin consultar los pagos reales de la venta: una venta cobrada 10 USD
--     podía reembolsarse en 4000 CUP (conversión implícita — el cajón
--     conserva los USD y entrega CUP), y viceversa.
--   · Pago mixto 2000 CUP + 5 USD: la devolución total (4000 canónico) se
--     pagaba entera en UNA moneda → CUP −2000 o USD −5.
--   · Deriva de tasa: pagado 10 USD a 400; reembolso a 320 → 12.5 USD.
--   · Doble consumo: egreso 3000 + reembolso 3000 con físico 5000, ambos
--     aprobados → −1000 (egresos ya validan físico; el reembolso no).
--
-- REGLA (misión §3, estándar SAS Premium): un reembolso que entrega efectivo
--   es una SALIDA FÍSICA en la moneda efectivamente entregada. (a) Nunca más
--   de lo NETO pagado por esa venta en esa moneda menos lo ya reembolsado
--   (no convertido) en ella — la conversión implícita USD↔CUP queda
--   estructuralmente imposible (sin operación de cambio explícita no existe
--   forma de convertir; el modelo no la tiene). (b) El efectivo disponible
--   de UNA moneda no sustituye al de la otra: misma fuente autoritativa que
--   el libro (get_cash_currency_summary → net → moneda).
--
-- CAMBIO (mínimo, sobre el cuerpo VIVO verbatim de producción):
--   · Dos inserciones quirúrgicas: bloque DECLARE + bloque de validación
--     tras computar v_refund_amount (misma transacción — atomicidad intacta).
--   · Se CONSERVAN: tope de cantidad DF-07 (lock de venta + relección),
--     precio anclado al servidor v2.24.1, advisory lock por tienda, hash de
--     idempotencia determinista, find-or-create de sesión de caja, asiento
--     cash_movements, contra-asiento DF-03, store_credit intacto, auditoría,
--     RLS y roles. Los reembolsos por transfer/zelle solo reciben el tope
--     (a) — no tocan el cajón físico. El store_credit no cambia (pasivo CUP
--     canónico acotado por DF-07 — la política de conversión vía crédito
--     queda documentada como decisión del propietario).
--
-- SIN cambios de esquema: CREATE OR REPLACE de 1 función. ACL espejo de la
--   convención v2.24.0: solo service_role, firma REAL de 12 argumentos
--   (lección 24-B: firmas espejo EXACTAS o el apply errora 42883).
--
-- IMPACTO OPERATIVO: los reembolsos que antes pasaban «financiados» por la
--   otra moneda o por efectivo ya gastado ahora se rechazan con
--   ERR_DEVOLUTION_REFUND_CAP / ERR_INSUFFICIENT_CURRENCY (422 en la API,
--   mensaje accionable por moneda). Las devoluciones legítimas dentro de lo
--   pagado por moneda y del físico disponible NO cambian (matriz B: B1, B2,
--   B2b, B3a, B3d, B6, T11a/b/d/e, T13-USD, T14 siguen aceptándose).
--   ALTERNATIVAS QUE QUEDAN PARA EL PROPIETARIO (documentadas en el
--   expediente): reembolso dividido por moneda, operación de cambio
--   explícita, reembolso a la tasa histórica de la venta, o aceptar el
--   arbitraje de tasa como costo FX.
--
-- APLICACIÓN: probada en BD aislada (cajamision, PG 18.4) con la suite
--   faseB-devoluciones.mjs (fase=fixed, expectativas pre-calculadas) +
--   regresión completa (certificación 51/51 + faseE 27/27). APLICACIÓN A
--   PRODUCCIÓN PENDIENTE DE AUTORIZACIÓN DEL PROPIETARIO — mismo protocolo
--   que 20261024180000/20261024220000, y SIEMPRE en ese orden (esta
--   migración asume los cuerpos de la cadena completa).
-- ═══════════════════════════════════════════════════════════════════════

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

    SELECT COALESCE(SUM(CASE WHEN pt.currency = 'CUP' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.currency = 'USD' THEN pt.amount END), 0)
      INTO v_refunded_cup, v_refunded_usd
      FROM public.payment_transactions pt
      JOIN public.devolutions d ON d.id = pt.ref_id
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'devolution'
        AND pt.direction = 'refund'
        AND d.status IN ('pending', 'completed');

    IF v_paid_cup = 0 AND v_paid_usd = 0
       AND v_refunded_cup = 0 AND v_refunded_usd = 0 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_PAYMENTS_UNDETERMINED: la venta original no tiene pagos determinables (sin filas de pago, liquidación ni efectivo registrado) — el reembolso monetario queda bloqueado (regla contable: sin conversión implícita entre monedas)';
    END IF;

    v_refundable := CASE v_refund_currency
                      WHEN 'USD' THEN v_paid_usd - v_refunded_usd
                      ELSE v_paid_cup - v_refunded_cup
                    END;
    IF v_refund_amount > v_refundable + 0.005 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_CAP: reembolso en % excede lo reembolsable de esa moneda para esta venta (pagado neto=%, ya reembolsado=%, solicitado=%) — no se convierte implícitamente el pago de otra moneda',
        v_refund_currency,
        round(CASE v_refund_currency WHEN 'USD' THEN v_paid_usd ELSE v_paid_cup END, 2),
        round(CASE v_refund_currency WHEN 'USD' THEN v_refunded_usd ELSE v_refunded_cup END, 2),
        round(v_refund_amount, 2);
    END IF;

    IF p_payment_method = 'cash' THEN
      SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, NULL)
                       -> 'net' ->> v_refund_currency)::numeric, 0)
        INTO v_balance_currency;
      IF v_refund_amount > v_balance_currency + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, reembolso=%',
          v_refund_currency, round(v_balance_currency, 2), round(v_refund_amount, 2);
      END IF;
    END IF;
    -- ═══ fin de la regla contable del reembolso ═══
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


-- ACL espejo EXACTO de la convención v2.24.0 (service_role-only; firma real 12-arg).
revoke all on function public.create_devolution_v2(uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamptz, text) from public;
grant execute on function public.create_devolution_v2(uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamptz, text) to service_role;
