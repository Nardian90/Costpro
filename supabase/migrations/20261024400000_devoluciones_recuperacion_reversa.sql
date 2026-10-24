-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN DE CIERRE 2026-10-24 · PR #1470 · reversión financiera de
-- devoluciones, pagos mixtos y certificación final de Caja
-- ═══════════════════════════════════════════════════════════════════════════
-- Cadena (orden ESTRICTO de aplicación): ... → 20261024180000 (APLICADA en
-- producción, no re-ejecutar) → 20261024220000 (pendiente) →
-- 20261024230000 (pendiente) → ESTE ARCHIVO. Aplicar a producción SOLO con
-- autorización expresa del propietario (protocolo §15 del expediente:
-- pre-vuelo fail-closed + transacción única + post-verificación).
--
-- REGLAS CONTABLES QUE CIERRA (defectos reproducidos en BD aislada, matriz
-- fase-reversa current 41/41 con 7 defectos):
--   RC1 (§4)  La reversión de una devolución con reembolso liquidado exige la
--             RECUPERACIÓN explícita del dinero, ATÓMICA con la reversión
--             (p_recovery jsonb). Una reversión documental ya no libera el
--             tope: tras revertir sin recuperar se podían reemitir los mismos
--             importes (R1: 160 CUP reembolsados de 100 pagados; R4 espejo USD).
--   RC2 (§5)  importe reembolsable[moneda] = neto pagado[moneda] − reembolsos
--             NO recuperados[moneda] — el tope cuenta DINERO (filas refund −
--             filas recovery), no estado documental.
--   RC3 (§4)  La recuperación usa la moneda REAL recibida (misma moneda del
--             reembolso; importe y tasa fijados por el servidor desde la fila
--             refund — cero aritmética manual) y el riel real de cobro.
--   RC4 (§6)  Devolución mixta: AS_PAID reembolsa CADA componente con su
--             importe y moneda (filas separadas CUP/USD) bajo una transacción
--             atómica; validación canónica de asignación completa (sin regla
--             por artículo, el caso ambiguo se BLOQUEA). Antes no existía
--             NINGÚN camino de devolución total de una venta mixta (R8).
--   RC5 (§7)  El importe USD del reembolso se ancla a la TASA IMPLÍCITA
--             HISTÓRICA de los pagos USD de la venta (filas v2.25 →
--             liquidación pura → carve legacy), no a la tasa vigente (R11:
--             4.94 USD devueltos de 10 pagados por deriva de tasa 400→810).
--   RC6 (§8)  store_credit: la reversión compensa el pasivo (fila negativa
--             trazable) y el crédito emitido no compensado respeta el tope
--             canónico de la venta (R7: 120 de crédito por una venta de 100).
--   RC7 (§4)  Rieles: la recuperación por transferencia/zelle no toca el
--             efectivo (mismo tratamiento que los refunds bancarios).
--
-- DEPENDIENTES SIMÉTRICAS (§10 — funciones que leen direction de
-- payment_transactions, censo vivo 2026-10-24): además de reverse_devolution,
-- create_devolution_v2 y get_cash_currency_summary (§7b), las 6 funciones de
-- arqueo/reporte que restan refunds suman recoveries: close_cash_shift,
-- get_cash_shift_expected, get_cash_flow_summary, get_cash_report,
-- get_cash_ledger (nueva rama 6b) y reverse_cash_flow_document. El TRIGGER
-- validate_payment_transactions_invariants excluye 'recovery' de la suma de
-- pagos PT001 y de la consistencia de tasa PT006 (DF-03 simétrico) — sin ese
-- cambio toda fila recovery violaría PT001 (payments+recovery > total).
--
-- COMPATIBILIDAD: firmas compatibles hacia atrás — reverse_devolution añade
-- p_recovery DEFAULT NULL (el overload /3 se RETIRA: firma única /4, patrón
-- create_sale_v2/31→32); create_devolution_v2 mantiene /12 (p_refund_currency
-- acepta el valor nuevo 'AS_PAID'); las llamadas existentes de 3 y 12 claves
-- siguen resolviendo. Sin DDL de tablas: solo CREATE OR REPLACE + DROP del
-- overload retirado + ACL idénticas a las vivas (service_role-only).
--
-- Reversibilidad: revertir este archivo = re-aplicar los cuerpos previos
-- (20260905120000 reverse_devolution/3 + 23000 create_devolution_v2 + cuerpos
-- vivos de las dependientes) y re-crear el overload /3. Las filas recovery
-- quedan como historia (el ledger las explicaría como entradas).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1) reverse_devolution — reversión con RECUPERACIÓN FINANCIERA ATÓMICA ═══
-- MISIÓN DE CIERRE 2026-10-24 (§4): cambiar el estado de una devolución NO
-- devuelve automáticamente el dinero a la caja. La reversión de una devolución
-- con efecto financiero liquidado (fila(s) refund) exige la RECUPERACIÓN
-- explícita del dinero (p_recovery), en la MISMA transacción:
--   p_recovery = jsonb array de componentes [{"currency":"CUP","method":"cash",
--                 "operation_date":ISO?,"notes":texto?}]
--   · moneda e importe: FIJADOS POR EL SERVIDOR a partir de las filas refund
--     de ESTA devolución (el payload NO puede fijar importes — cero aritmética
--     manual del operador);
--   · la recuperación usa la moneda REAL recibida (CUP no compensa USD);
--   · método de cobro: cash | transfer | zelle (riel por el que vuelve);
--   · idempotencia: 'dev-<id>-recovery-<MONEDA>' (índice único — una sola
--     recuperación por componente; ERR_DEVOLUTION_ALREADY_RECOVERED como
--     guard limpio por delante);
--   · store_credit: la reversión compensa el pasivo (fila negativa trazable
--     'dev-<id>-credit-comp') — no registra efectivo inexistente.
-- Devoluciones SIN efecto financiero (históricas/documentales): reversión
-- pura como antes (p_recovery ausente; si llega → ERR explícito).
-- Locks (orden consistente con create_devolution_v2 — advisory tienda
-- PRIMERO, luego venta, luego devolución): serializa contra reembolsos,
-- entregas y cierres concurrentes sobre el mismo cajón físico.
-- Las escrituras (recuperación + compensación de crédito + stock + estado +
-- auditoría) son ATÓMICAS: un fallo a mitad revierte TODO (Caso 4 §5).
CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_recovery jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_uc_dev NUMERIC;
  v_store_id UUID;
  v_rec JSONB;              -- componente de recuperación solicitado (elemento jsonb)
  v_refund RECORD;         -- fila refund de esta devolución
  v_credit RECORD;         -- fila de crédito de tienda de esta devolución
  v_credit_outstanding NUMERIC := 0;
  v_requested_cup INTEGER := 0;
  v_requested_usd INTEGER := 0;
  v_expected_cup INTEGER := 0;
  v_expected_usd INTEGER := 0;
  v_rec_date TIMESTAMPTZ;
  v_rec_method TEXT;
  v_recovered JSONB := '[]'::jsonb;
BEGIN
  -- 0) tienda ANTES del lock (store_id es inmutable en devolutions)
  SELECT store_id INTO v_store_id FROM public.devolutions WHERE id = p_devolution_id;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;

  -- 1) advisory lock por tienda (misma llave que create_devolution_v2 /
  --    create_cash_flow_document / close_cash_shift): serializa la reversión
  --    contra reembolsos/entregas/cierres concurrentes del cajón físico.
  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));

  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  -- 2) lock de la venta original (serializa contra el tope de reembolso de
  --    create_devolution_v2, que lockea la venta ANTES de leer el tope)
  IF v_dev.original_transaction_id IS NOT NULL THEN
    PERFORM 1 FROM public.transactions WHERE id = v_dev.original_transaction_id FOR UPDATE;
  END IF;

  -- 3) efecto financiero de ESTA devolución (validado TODO antes de escribir)
  SELECT
    COUNT(*) FILTER (WHERE pt.currency = 'CUP'),
    COUNT(*) FILTER (WHERE pt.currency = 'USD')
    INTO v_expected_cup, v_expected_usd
  FROM public.payment_transactions pt
  WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_devolution_id AND pt.direction = 'refund';

  IF v_expected_cup + v_expected_usd > 0 THEN
    IF p_recovery IS NULL THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_NOT_RECOVERED: la devolución tiene reembolso(s) liquidado(s) (% componente CUP, % componente USD) y el dinero no ha vuelto a la caja. La reversión es ATÓMICA con la recuperación: envíe p_recovery = [{currency, method, operation_date?, notes?}] con la moneda y el riel reales de cobro (el importe lo fija el servidor). Una reversión documental no puede liberar el tope de reembolso como si el dinero hubiera regresado.',
        v_expected_cup, v_expected_usd;
    END IF;
    IF jsonb_typeof(p_recovery) <> 'array' THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: p_recovery debe ser un array jsonb de componentes {currency, method, operation_date?, notes?}';
    END IF;
    SELECT
      COUNT(*) FILTER (WHERE upper(btrim(comp->>'currency')) = 'CUP'),
      COUNT(*) FILTER (WHERE upper(btrim(comp->>'currency')) = 'USD')
      INTO v_requested_cup, v_requested_usd
    FROM jsonb_array_elements(p_recovery) comp;
    IF v_requested_cup <> v_expected_cup OR v_requested_usd <> v_expected_usd THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_COMPONENTS: los componentes de recuperación deben cubrir EXACTAMENTE las monedas reembolsadas (esperado: % CUP + % USD; recibido: % CUP + % USD). La recuperación de una moneda no compensa la otra.',
        v_expected_cup, v_expected_usd, v_requested_cup, v_requested_usd;
    END IF;
    -- validación de cada componente (antes de cualquier escritura)
    FOR v_rec IN SELECT comp FROM jsonb_array_elements(p_recovery) comp LOOP
      v_rec_method := lower(btrim(COALESCE(v_rec->>'method', '')));
      IF upper(btrim(COALESCE(v_rec->>'currency', ''))) NOT IN ('CUP', 'USD') THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: moneda de recuperación % no reconocida (CUP|USD)',
          COALESCE(v_rec->>'currency', '');
      END IF;
      IF v_rec_method NOT IN ('cash', 'transfer', 'zelle') THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: método de cobro % no reconocido (cash|transfer|zelle)',
          COALESCE(v_rec->>'method', '');
      END IF;
      -- espejo del invariante PT005 de payment_transactions (fail-closed limpio)
      IF v_rec_method = 'zelle' AND upper(btrim(v_rec->>'currency')) = 'CUP' THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: zelle no opera en CUP (riel USD)';
      END IF;
      IF length(COALESCE(v_rec->>'notes', '')) > 500 THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: notes > 500 caracteres';
      END IF;
      v_rec_date := NULL;
      IF COALESCE(v_rec->>'operation_date', '') <> '' THEN
        v_rec_date := (v_rec->>'operation_date')::timestamptz;
      END IF;
      IF v_rec_date IS NOT NULL THEN
        PERFORM public.validate_operation_date(v_rec_date, v_dev.store_id);
      END IF;
      IF EXISTS (SELECT 1 FROM public.payment_transactions
                 WHERE ref_type = 'devolution' AND ref_id = p_devolution_id
                   AND direction = 'recovery'
                   AND currency = upper(btrim(v_rec->>'currency'))) THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_ALREADY_RECOVERED: ya existe una recuperación en % para esta devolución (idempotencia dev-%%-recovery-%%)',
          upper(btrim(v_rec->>'currency'));
      END IF;
    END LOOP;
  ELSIF p_recovery IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_UNNECESSARY: la devolución no tiene reembolsos monetarios que recuperar (reversión documental pura)';
  END IF;

  -- 4) RECUPERACIÓN: una fila por componente, importe y tasa FIJADOS por el
  --    servidor desde la fila refund de esa moneda (misma moneda, mismo
  --    importe, misma tasa → el canónico generado espeja y cancela EXACTO).
  --    direction='recovery' = entrada real de dinero por el riel declarado.
  FOR v_refund IN
    SELECT pt.currency, pt.payment_method, pt.amount, pt.exchange_rate
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_devolution_id AND pt.direction = 'refund'
    ORDER BY pt.currency
  LOOP
    SELECT lower(btrim(COALESCE(comp->>'method', ''))),
           CASE WHEN COALESCE(comp->>'operation_date', '') <> ''
                THEN (comp->>'operation_date')::timestamptz ELSE NULL END
      INTO v_rec_method, v_rec_date
      FROM jsonb_array_elements(p_recovery) comp
      WHERE upper(btrim(comp->>'currency')) = v_refund.currency LIMIT 1;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, direction, paid_by, idempotency_key
    ) VALUES (
      v_dev.store_id, 'devolution', p_devolution_id, v_dev.original_transaction_id,
      v_refund.amount, v_rec_method::text, v_refund.currency, v_refund.exchange_rate,
      COALESCE(v_rec_date, NOW()), 'recovery', v_uid,
      'dev-' || p_devolution_id::text || '-recovery-' || v_refund.currency
    );
    v_recovered := v_recovered || jsonb_build_object(
      'currency', v_refund.currency, 'amount', v_refund.amount,
      'method', v_rec_method, 'rate', v_refund.exchange_rate);
  END LOOP;

  -- 5) STORE CREDIT: compensación trazable del pasivo (fila negativa con
  --    vínculo a la devolución). El efectivo NO se toca: el crédito nunca fue
  --    billetes. (El modelo no tiene redención/consumo de créditos hoy; cuando
  --    exista deberá respetar estas compensaciones.)
  FOR v_credit IN
    SELECT scl.customer_id, scl.amount
    FROM public.store_credit_ledger scl
    WHERE scl.devolution_id = p_devolution_id AND scl.amount > 0
    ORDER BY scl.created_at
  LOOP
    SELECT COALESCE(SUM(s2.amount), 0) INTO v_credit_outstanding
    FROM public.store_credit_ledger s2 WHERE s2.devolution_id = p_devolution_id;
    IF v_credit_outstanding > 0 THEN
      INSERT INTO public.store_credit_ledger
        (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
      VALUES
        (v_dev.store_id, v_credit.customer_id, -v_credit_outstanding, p_devolution_id,
         v_dev.original_transaction_id, 'dev-' || p_devolution_id::text || '-credit-comp', v_uid);
    END IF;
  END LOOP;

  -- 6) Inventario: pipeline canónico (W9.5 B-10b byte-conservado)
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    SELECT (SUM(sm.unit_cost * sm.quantity_change) / NULLIF(SUM(sm.quantity_change), 0))
      INTO v_uc_dev
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_devolution_id::text
        AND sm.product_id = v_item.product_id
        AND sm.movement_type = 'return';
    IF v_uc_dev IS NULL THEN
      IF v_dev.original_transaction_id IS NOT NULL THEN
        SELECT ti.cost_at_sale INTO v_uc_dev
          FROM public.transaction_items ti
          WHERE ti.transaction_id = v_dev.original_transaction_id
            AND ti.product_id = v_item.product_id
          LIMIT 1;
      END IF;
      IF v_uc_dev IS NULL THEN
        SELECT cost_average INTO v_uc_dev FROM public.products WHERE id = v_item.product_id;
      END IF;
      v_uc_dev := COALESCE(v_uc_dev, 0);
    END IF;

    PERFORM public.fn_recalc_wac(
      v_dev.store_id, v_item.product_id, 'devolution_reverse',
      0, 0,
      jsonb_build_object('rpc', 'reverse_devolution', 'devolution_id', p_devolution_id,
        'qty_reversed', v_item.quantity));

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_dev.store_id,
      p_quantity := -v_item.quantity,
      p_movement_type := 'devolution_reverse',
      p_reason := ('Reversión devolución ' || COALESCE(v_dev.devolution_number, p_devolution_id::text))::text,
      p_user_id := v_uid,
      p_variant_id := NULL,
      p_sale_id := p_devolution_id,
      p_unit_cost := v_uc_dev,
      p_notes := COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION',
      'pipeline', 'register_stock_movement',
      'movement_type', 'devolution_reverse',
      'financial_recovery', v_recovered,
      'store_credit_compensated', (SELECT COALESCE(SUM(scl.amount) < 0, false) FROM public.store_credit_ledger scl WHERE scl.devolution_id = p_devolution_id)));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count,
    'devolution_id', p_devolution_id, 'recovered', v_recovered);
END;
$function$;

-- Retiro del overload de 3 args (huella del W9.5 B-10b): tras este archivo la
-- ÚNICA firma es reverse_devolution/4. Coexistir con /3 reproduciría el
-- incidente PGRST203 de firmas duplicadas (precedente create_sale_v2/31).
DROP FUNCTION IF EXISTS public.reverse_devolution(uuid, text, uuid);

-- ACL espejo EXACTO de la convención vigente (service_role-only; firma real 4-arg)
revoke all on function public.reverse_devolution(uuid, text, uuid, jsonb) from public;
grant execute on function public.reverse_devolution(uuid, text, uuid, jsonb) to service_role;

-- ═══ 2) create_devolution_v2 — tope por DINERO, AS_PAID y tasa histórica ═══
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
          SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, NULL)
                           -> 'net' ->> 'CUP')::numeric, 0) INTO v_balance_currency;
          IF v_comp_cup > v_balance_currency + 0.005 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, reembolso=%',
              round(v_balance_currency, 2), round(v_comp_cup, 2);
          END IF;
        END IF;
        IF v_comp_usd > 0 THEN
          SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, NULL)
                           -> 'net' ->> 'USD')::numeric, 0) INTO v_balance_currency;
          IF v_comp_usd > v_balance_currency + 0.005 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico USD disponible=%, reembolso=%',
              round(v_balance_currency, 2), round(v_comp_usd, 2);
          END IF;
        END IF;
      ELSE
        SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, NULL)
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

-- ACL espejo EXACTO de la convención v2.24.0 (service_role-only; firma real 12-arg).
revoke all on function public.create_devolution_v2(uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamptz, text) from public;
grant execute on function public.create_devolution_v2(uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text, timestamptz, text) to service_role;

-- ═══ 3) get_cash_currency_summary — §7b recuperaciones por moneda ═══
CREATE OR REPLACE FUNCTION public.get_cash_currency_summary(p_store_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, '1970-01-01 00:00:00+00'::timestamptz);
  v_to   timestamptz := COALESCE(p_to, now());
  -- Ventas con liquidación explícita (post-migración)
  v_settle_cup numeric := 0;
  v_settle_usd numeric := 0;
  -- Ventas legacy: canónico + carve USD por ítems
  v_legacy_cup numeric := 0;
  v_legacy_usd numeric := 0;
  v_legacy_usd_carve_cup numeric := 0;
  -- Términos del ledger por moneda
  v_prod_cup numeric := 0;   v_prod_usd numeric := 0;
  v_supp_cup numeric := 0;   v_supp_usd numeric := 0;
  v_comm_cup numeric := 0;   v_comm_usd numeric := 0;
  v_cfi_cup  numeric := 0;   v_cfi_usd  numeric := 0;
  v_cfo_cup  numeric := 0;   v_cfo_usd  numeric := 0;
  v_ref_cup  numeric := 0;   v_ref_usd  numeric := 0;
  v_rec_cup  numeric := 0;   v_rec_usd  numeric := 0;
  v_adj_cup  numeric := 0;   v_adj_usd  numeric := 0;
  v_adjout_cup numeric := 0; v_adjout_usd numeric := 0;
  -- Finales
  v_sales_cup numeric := 0;
  v_sales_usd numeric := 0;
  v_net_cup numeric := 0;
  v_net_usd numeric := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- 1) VENTAS con liquidación explícita del cobro (vuelto persistido)
  SELECT
    COALESCE(SUM(COALESCE(cash_received_cup, 0) - COALESCE(change_given_cup, 0)), 0),
    COALESCE(SUM(COALESCE(cash_received_usd, 0) - COALESCE(change_given_usd, 0)), 0)
    INTO v_settle_cup, v_settle_usd
  FROM public.transactions
  WHERE store_id = p_store_id
    AND status = 'completed'
    AND created_at > v_from AND created_at <= v_to
    AND (cash_received_cup IS NOT NULL OR cash_received_usd IS NOT NULL
         OR change_given_cup IS NOT NULL OR change_given_usd IS NOT NULL);

  -- 2) VENTAS legacy: efectivo canónico CUP …
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_legacy_cup
  FROM public.transactions
  WHERE store_id = p_store_id
    AND status = 'completed'
    AND COALESCE(cash_amount, 0) > 0
    AND created_at > v_from AND created_at <= v_to
    AND cash_received_cup IS NULL AND cash_received_usd IS NULL
    AND change_given_cup IS NULL AND change_given_usd IS NULL;

  -- … menos el carve USD explícito por ítems (se reclasifica al balde USD)
  SELECT
    COALESCE(SUM(ti.cash_paid), 0),
    COALESCE(SUM(ti.cash_paid * ti.exchange_rate), 0)
    INTO v_legacy_usd, v_legacy_usd_carve_cup
  FROM public.transaction_items ti
  JOIN public.transactions t ON t.id = ti.transaction_id
  WHERE t.store_id = p_store_id
    AND t.status = 'completed'
    AND COALESCE(t.cash_amount, 0) > 0
    AND t.created_at > v_from AND t.created_at <= v_to
    AND t.cash_received_cup IS NULL AND t.cash_received_usd IS NULL
    AND t.change_given_cup IS NULL AND t.change_given_usd IS NULL
    AND ti.cash_currency = 'USD'
    AND ti.currency = 'USD'
    AND COALESCE(ti.cash_paid, 0) > 0;
  v_legacy_cup := v_legacy_cup - v_legacy_usd_carve_cup;

  v_sales_cup := v_settle_cup + v_legacy_cup;
  v_sales_usd := v_settle_usd + v_legacy_usd;

  -- 3) Anticipos de producción/trabajo en EFECTIVO (entradas)
  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_prod_cup, v_prod_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type IN ('production_order', 'work')
    AND payment_date > v_from AND payment_date <= v_to;

  -- 4) Pagos a proveedores en EFECTIVO (salidas). ref_type receipt|service:
  --    semántica de EGRESO aunque la columna direction viva como 'in'
  --    (default histórico) — el ref_type manda (fórmulas v2.23.0 certified).
  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_supp_cup, v_supp_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type IN ('receipt', 'service')
    AND payment_date > v_from AND payment_date <= v_to;

  -- 5) Comisiones pagadas en EFECTIVO (salidas). amount_cup es el canónico
  --    generado por trg_calc_commission_cup; el físico USD se deriva con la
  --    MISMA tasa con la que se generó (amount_cup / exchange_rate).
  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount_cup / NULLIF(exchange_rate, 0) ELSE 0 END), 0)
    INTO v_comm_cup, v_comm_usd
  FROM public.commission_payments
  WHERE store_id = p_store_id
    AND status = 'paid'
    AND payment_method = 'cash'
    AND paid_at > v_from AND paid_at <= v_to;

  -- 6) Documentos Ingresos/Egresos de caja (fondo, otros y ENTREGAS) por
  --    dirección y moneda real de la fila. Anulados: fila original + fila
  --    contra ⇒ neto cero (el ledger manda).
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in'  AND currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'in'  AND currency = 'USD' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' AND currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' AND currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_cfi_cup, v_cfi_usd, v_cfo_cup, v_cfo_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type = 'cash_flow'
    AND payment_date > v_from AND payment_date <= v_to;

  -- 7) Reembolsos EN EFECTIVO de devoluciones comerciales (salidas, P1)
  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_ref_cup, v_ref_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type = 'devolution'
    AND direction = 'refund'
    AND payment_date > v_from AND payment_date <= v_to;

  -- 7b) RECUPERACIONES EN EFECTIVO de reembolsos revertidos (entradas,
  --      MISIÓN DE CIERRE 2026-10-24 §4): dinero que volvió físicamente al
  --      cajón al revertir una devolución con reembolso liquidado. Simétrico
  --      a §7 — sin este término el libro jamás podría reflejar la entrada.
  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_rec_cup, v_rec_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type = 'devolution'
    AND direction = 'recovery'
    AND payment_date > v_from AND payment_date <= v_to;

  -- 8) Ajustes extraordinarios en EFECTIVO (por dirección). Nota de
  --    coherencia: el arqueo canónico del turno (v2.23.0) los excluye por
  --    diseño (D3 de 20261021000001); el LIBRO de caja los incluye porque son
  --    movimientos físicos reales que explican el saldo. La divergencia
  --    queda documentada y es intencional.
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in'  AND currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'in'  AND currency = 'USD' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' AND currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' AND currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_adj_cup, v_adj_usd, v_adjout_cup, v_adjout_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type = 'adjustment'
    AND payment_date > v_from AND payment_date <= v_to;

  v_net_cup := v_sales_cup + v_prod_cup - v_supp_cup - v_comm_cup
             + v_cfi_cup - v_cfo_cup - v_ref_cup + v_rec_cup + v_adj_cup - v_adjout_cup;
  v_net_usd := v_sales_usd + v_prod_usd - v_supp_usd - v_comm_usd
             + v_cfi_usd - v_cfo_usd - v_ref_usd + v_rec_usd + v_adj_usd - v_adjout_usd;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to),
    'terms', jsonb_build_object(
      'sales_cash',        jsonb_build_object('CUP', round(v_sales_cup, 2), 'USD', round(v_sales_usd, 2)),
      'production_cash',   jsonb_build_object('CUP', round(v_prod_cup, 2),  'USD', round(v_prod_usd, 2)),
      'supplier_cash',     jsonb_build_object('CUP', round(v_supp_cup, 2),  'USD', round(v_supp_usd, 2)),
      'commissions_cash',  jsonb_build_object('CUP', round(v_comm_cup, 2),  'USD', round(v_comm_usd, 2)),
      'cash_flow_in',      jsonb_build_object('CUP', round(v_cfi_cup, 2),   'USD', round(v_cfi_usd, 2)),
      'cash_flow_out',     jsonb_build_object('CUP', round(v_cfo_cup, 2),   'USD', round(v_cfo_usd, 2)),
      'devolution_refunds',jsonb_build_object('CUP', round(v_ref_cup, 2),   'USD', round(v_ref_usd, 2)),
      'devolution_recoveries',jsonb_build_object('CUP', round(v_rec_cup, 2), 'USD', round(v_rec_usd, 2)),
      'adjustments_in',    jsonb_build_object('CUP', round(v_adj_cup, 2),   'USD', round(v_adj_usd, 2)),
      'adjustments_out',   jsonb_build_object('CUP', round(v_adjout_cup, 2), 'USD', round(v_adjout_usd, 2))
    ),
    'net', jsonb_build_object('CUP', round(v_net_cup, 2), 'USD', round(v_net_usd, 2))
  );
END;
$function$;

-- ACL idéntica a la viva (service_role-only; firma real 3-arg)
revoke all on function public.get_cash_currency_summary(uuid, timestamp with time zone, timestamp with time zone) from public;
grant execute on function public.get_cash_currency_summary(uuid, timestamp with time zone, timestamp with time zone) to service_role;

-- ═══ 4) validate_payment_transactions_invariants — 'recovery' no es pago ═══
CREATE OR REPLACE FUNCTION public.validate_payment_transactions_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'PT007'; END IF; IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1' USING ERRCODE = 'PT003'; END IF; IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1' USING ERRCODE = 'PT004'; END IF; IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP' USING ERRCODE = 'PT005'; END IF; IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0)); PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0)); ELSIF NEW.transaction_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0)); END IF; /* DF-03: los refunds (direction='refund') son contra-asientos de trazabilidad — NO se suman como pago hacia el total del documento. MISIÓN DE CIERRE 2026-10-24: las RECUPERACIONES (direction='recovery') de reembolsos revertidos son contra-asientos simétricos — tampoco se suman como pago (PT001) ni participan de la consistencia de tasa del pago (PT006). */ IF NEW.transaction_id IS NOT NULL AND NEW.direction NOT IN ('refund', 'recovery') THEN DECLARE v_total_amount numeric; v_sum_payments numeric; v_existing_rate numeric; BEGIN SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id; SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id AND direction NOT IN ('refund', 'recovery'); IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL' USING ERRCODE = 'PT001'; END IF; SELECT exchange_rate INTO v_existing_rate FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id AND direction NOT IN ('refund', 'recovery') LIMIT 1; IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES' USING ERRCODE = 'PT006'; END IF; END; END IF; RETURN NEW; END $function$;

-- ═══ 5) close_cash_shift — recuperaciones en el arqueo canónico ═══
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
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();
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

-- ACL idéntica a la viva (service_role-only; firma real 6-arg)
revoke all on function public.close_cash_shift(uuid, numeric, numeric, numeric, text, uuid) from public;
grant execute on function public.close_cash_shift(uuid, numeric, numeric, numeric, text, uuid) to service_role;

-- ═══ 6) get_cash_shift_expected — espejo del arqueo ═══
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
      AND created_at <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_window_start
      AND paid_at <= NOW();

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
      AND payment_date <= NOW();

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- mismo término que close_cash_shift v2.23.0 (coherencia espejo↔autoridad).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  -- Reembolsos por VOUCHERS (v2.23.0 — base NETA, decisión del propietario
  -- 2026-10-21): mismo término que close_cash_shift (lado vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_window_start
      AND payment_date <= NOW();

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
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start
      AND payment_date <= NOW();
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

-- ACL idéntica a la viva (service_role-only; firma real 1-arg)
revoke all on function public.get_cash_shift_expected(uuid) from public;
grant execute on function public.get_cash_shift_expected(uuid) to service_role;

-- ═══ 7) get_cash_flow_summary — espejo del arqueo ═══
CREATE OR REPLACE FUNCTION public.get_cash_flow_summary(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_shift RECORD;
  -- R4: FOUND tras SELECT INTO (la nulidad compuesta de RECORD no sirve:
  -- cash_closures.session_reference es NULL en las filas reales y
  -- `<record> IS NOT NULL` exige TODOS los campos no-nulos ⇒ siempre falso).
  v_has_shift boolean := false;
  v_window_start timestamptz;
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
  v_fondo numeric := 0;
  v_fondo_in numeric := 0;
  v_fondo_out numeric := 0;
  v_from timestamptz;
  v_to timestamptz;
  v_period_in_cup numeric := 0;
  v_period_out_cup numeric := 0;
  v_period_in_cup_cup numeric := 0;
  v_period_in_usd numeric := 0;
  v_period_out_cup_usd numeric := 0;
  v_period_out_usd numeric := 0;
  v_period_in_count integer := 0;
  v_period_out_count integer := 0;
  v_annulled_count integer := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- REM-R2-READ: barrera de autorización (service_role mantiene su capacidad
  -- interna; los humanos necesitan acceso activo a la tienda).
  IF auth.role() <> 'service_role' THEN
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ventana del turno (idéntica a get_cash_shift_expected v2.23.0)
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;
  v_has_shift := FOUND;
  IF v_has_shift THEN
    v_window_start := v_shift.created_at;
    v_opening := COALESCE(v_shift.opening_balance, 0);
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
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_window_start AND created_at <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_window_start AND paid_at <= now();

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start AND payment_date <= now();

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- mismo término que close_cash_shift v2.23.0.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_window_start AND payment_date <= now();

  -- Reembolsos por VOUCHERS (v2.23.0 — base NETA, decisión del propietario
  -- 2026-10-21): mismo término que close_cash_shift (lado vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_window_start AND payment_date <= now();

  -- (recuperaciones antes del esperado)
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_window_start AND payment_date <= now();
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                     - v_cash_refunds + v_cash_recoveries;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales
                      - v_voucher_refunds + v_voucher_recoveries;

  -- Fondo de cambio vigente (misma definición que create_cash_flow_document)
  SELECT
    COALESCE(SUM(CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN doc_type = 'egreso' THEN amount_cup ELSE 0 END), 0)
    INTO v_fondo_in, v_fondo_out
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_window_start
      AND operation_date <= now();
  v_fondo := v_opening + v_fondo_in - v_fondo_out;

  -- Período solicitado (default: día de negocio Habana en curso)
  v_from := COALESCE(p_date_from, date_trunc('day', now() AT TIME ZONE 'America/Havana') AT TIME ZONE 'America/Havana');
  v_to := COALESCE(p_date_to, v_from + INTERVAL '1 day' - INTERVAL '1 microsecond');

  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' AND doc_type = 'ingreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'CUP' AND doc_type = 'egreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' AND doc_type = 'ingreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' AND doc_type = 'egreso' THEN amount ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE doc_type = 'ingreso'),
    COUNT(*) FILTER (WHERE doc_type = 'egreso')
    INTO v_period_in_cup, v_period_out_cup, v_period_in_usd, v_period_out_usd,
         v_period_in_count, v_period_out_count
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND operation_date >= v_from AND operation_date <= v_to;

  SELECT COUNT(*) INTO v_annulled_count
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'anulado'
      AND annulled_at >= v_from AND annulled_at <= v_to;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'has_pending_shift', v_has_shift,
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
    'expected_total', v_expected_total,
    'fondo_vigente', v_fondo,
    'fondo_ingresado', v_fondo_in,
    'fondo_devuelto', v_fondo_out,
    'period', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'in_cup', v_period_in_cup,
      'out_cup', v_period_out_cup,
      'in_usd', v_period_in_usd,
      'out_usd', v_period_out_usd,
      'ingresos_count', v_period_in_count,
      'egresos_count', v_period_out_count,
      'annulled_count', v_annulled_count
    )
  );
  RETURN v_result;
END;
$function$;

-- ACL idéntica a la viva (service_role-only; firma real 3-arg)
revoke all on function public.get_cash_flow_summary(uuid, timestamp with time zone, timestamp with time zone) from public;
grant execute on function public.get_cash_flow_summary(uuid, timestamp with time zone, timestamp with time zone) to service_role;

-- ═══ 8) get_cash_report — desglose y totales de recuperaciones ═══
CREATE OR REPLACE FUNCTION public.get_cash_report(p_store_id uuid, p_start_date timestamp with time zone DEFAULT (now() - '1 day'::interval), p_end_date timestamp with time zone DEFAULT now(), p_include_all_dates boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_commissions JSON;
  v_production JSON;
  v_cash_flow_groups JSON;
  v_refunds JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
  v_production_total_cup NUMERIC := 0;
  v_cash_flow_in_total_cup NUMERIC := 0;
  v_cash_flow_out_total_cup NUMERIC := 0;
  v_refunds_cash_total_cup NUMERIC := 0;
  v_refunds_voucher_total_cup NUMERIC := 0;
  v_recoveries JSON;
  v_recoveries_cash_total_cup NUMERIC := 0;
  v_recoveries_voucher_total_cup NUMERIC := 0;
BEGIN
  -- Ventas por método y moneda (siempre filtradas por fecha)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT payment_method, sale_currency AS currency, COUNT(*) AS transaction_count,
      SUM(total_amount) AS total,
      SUM(total_amount) AS total_cup
    FROM transactions
    WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided'
    GROUP BY payment_method, sale_currency ORDER BY payment_method, sale_currency
  ) t;

  -- Pagos a Proveedores
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('receipt', 'service')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Comisiones
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT payment_method, currency, COUNT(*) AS commission_count, SUM(final_amount) AS total, SUM(amount_cup) AS total_cup
    FROM commission_payments
    WHERE store_id = p_store_id AND status = 'paid'
      AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date))
      AND payment_method IS NOT NULL
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- Órdenes de Producción/Servicios
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_production
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('production_order', 'work')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Ingresos/Egresos de caja documentados (fondo de cambio y otros).
  -- GRUPOS agregados por moneda+dirección (las FILAS del ledger las enriquece
  -- /api/cash-report como `cash_flows`). Un documento anulado aporta
  -- original + contra (movimientos físicos reales por fecha), igual criterio
  -- que el arqueo v2.23.0.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_cash_flow_groups
  FROM (
    SELECT payment_method, currency, direction, COUNT(*) AS flow_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type = 'cash_flow'
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, direction ORDER BY currency, direction
  ) t;

  -- REEMBOLSOS de devoluciones comerciales (MISIÓN DE SEGUIMIENTO 2026-10-21):
  -- grupo informativo por método/moneda (todos los medios) — el desglose
  -- permite reconstruir POR QUÉ bajó el efectivo esperado.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_refunds
  FROM (
    SELECT payment_method, currency, COUNT(*) AS refund_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- grupo informativo por método/moneda — desglose simétrico a refunds.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_recoveries
  FROM (
    SELECT payment_method, currency, COUNT(*) AS recovery_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- Totales
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_sales_total_cup FROM transactions
  WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided';

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('receipt', 'service')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments WHERE store_id = p_store_id AND status = 'paid'
  AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_production_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('production_order', 'work')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in_total_cup, v_cash_flow_out_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'cash_flow'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  -- Término del balance: SOLO reembolsos en EFECTIVO (misma regla que el
  -- arqueo v2.23.0 — transfer/zelle no tocan el cajón; el lado vouchers
  -- NETO vive en las fórmulas de arqueo, no en el balance de este reporte
  -- que documenta el efectivo a entregar).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_refunds_cash_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'refund' AND payment_method = 'cash'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  -- Informativo v2.23.0: reembolsos por VOUCHERS (transferencia/zelle) del
  -- período — alimenta el desglose por método del reporte y la conciliación
  -- de vouchers netos (decisión del propietario 2026-10-21).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_refunds_voucher_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'refund'
  AND payment_method IN ('transfer', 'zelle')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_recoveries_cash_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'recovery' AND payment_method = 'cash'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_recoveries_voucher_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'recovery'
  AND payment_method IN ('transfer', 'zelle')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'production_total_cup', v_production_total_cup,
    'cash_flow_in_total_cup', v_cash_flow_in_total_cup,
    'cash_flow_out_total_cup', v_cash_flow_out_total_cup,
    'refunds_cash_total_cup', v_refunds_cash_total_cup,
    'refunds_voucher_total_cup', v_refunds_voucher_total_cup,
    'recoveries_cash_total_cup', v_recoveries_cash_total_cup,
    'recoveries_voucher_total_cup', v_recoveries_voucher_total_cup,
    'balance_cup', v_sales_total_cup + v_production_total_cup
                   + v_cash_flow_in_total_cup
                   - v_payments_total_cup - v_commissions_total_cup - v_cash_flow_out_total_cup
                   - v_refunds_cash_total_cup
                   + v_recoveries_cash_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'commissions', v_commissions,
    'production', v_production, 'cash_flow_groups', v_cash_flow_groups,
    'refunds', v_refunds, 'recoveries', v_recoveries, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date,
    'include_all_dates', p_include_all_dates
  );
  RETURN v_result;
END;
$function$;

-- ACL idéntica a la viva (service_role-only; firma real 3-arg)
revoke all on function public.get_cash_report(uuid, timestamp with time zone, timestamp with time zone, boolean) from public;
grant execute on function public.get_cash_report(uuid, timestamp with time zone, timestamp with time zone, boolean) to service_role;

-- ═══ 9) get_cash_ledger — rama 6b recuperaciones (entradas) ═══
CREATE OR REPLACE FUNCTION public.get_cash_ledger(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_currency text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_currency text := upper(btrim(COALESCE(p_currency, '')));
  v_kind text := lower(btrim(COALESCE(p_kind, '')));
  v_rows jsonb;
  v_count integer := 0;
  v_kinds text[] := ARRAY['venta_efectivo','anticipo_produccion','pago_proveedor',
    'comision_pagada','ingreso_caja','egreso_caja','entrega_efectivo',
    'anulacion_documento','reembolso_devolucion','recuperacion_devolucion','ajuste_caja',
    'apertura_turno','cierre_turno'];
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;
  IF v_currency <> '' AND v_currency NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;
  IF v_kind <> '' AND NOT (v_kind = ANY(v_kinds)) THEN
    RAISE EXCEPTION 'ERR_INVALID_KIND: %', v_kind;
  END IF;

  -- REM-R2-READ: barrera por tienda para humanos (service_role pasa)
  IF auth.role() <> 'service_role' THEN
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH raw_movements AS (
    -- 1) Ventas CON liquidación de cobro — fila CUP
    SELECT t.created_at AS effective_date, 'venta_efectivo'::text AS kind, 'transactions'::text AS ref_table,
      t.id::text AS ref_id, COALESCE(t.invoice_number, left(t.id::text, 8)) AS reference,
      'Venta en efectivo ' || COALESCE(t.invoice_number, t.id::text) AS description,
      'CUP'::text AS currency,
      GREATEST(COALESCE(t.cash_received_cup,0) - COALESCE(t.change_given_cup,0), 0) AS amount_in,
      GREATEST(-(COALESCE(t.cash_received_cup,0) - COALESCE(t.change_given_cup,0)), 0) AS amount_out,
      t.seller_id AS responsible_id, 'completed'::text AS status, false AS is_informative
    FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND COALESCE(t.cash_received_cup,0) - COALESCE(t.change_given_cup,0) <> 0
    UNION ALL
    -- 1b) Ventas CON liquidación — fila USD (vuelto en USD: salida física)
    SELECT t.created_at AS effective_date, 'venta_efectivo', 'transactions', t.id::text,
      COALESCE(t.invoice_number, left(t.id::text, 8)),
      CASE WHEN COALESCE(t.change_given_usd,0) > COALESCE(t.cash_received_usd,0)
        THEN 'Venta cobrada en CUP con vuelto en USD ' || COALESCE(t.invoice_number, t.id::text)
        ELSE 'Venta cobrada en USD ' || COALESCE(t.invoice_number, t.id::text) END,
      'USD',
      GREATEST(COALESCE(t.cash_received_usd,0) - COALESCE(t.change_given_usd,0), 0),
      GREATEST(-(COALESCE(t.cash_received_usd,0) - COALESCE(t.change_given_usd,0)), 0),
      t.seller_id, 'completed', false
    FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND COALESCE(t.cash_received_usd,0) - COALESCE(t.change_given_usd,0) <> 0
    UNION ALL
    -- 1c) Ventas LEGACY — fila CUP (canónico menos carve USD de sus ítems)
    SELECT t.created_at AS effective_date, 'venta_efectivo', 'transactions', t.id::text,
      COALESCE(t.invoice_number, left(t.id::text, 8)),
      'Venta en efectivo ' || COALESCE(t.invoice_number, t.id::text),
      'CUP',
      GREATEST(t.cash_amount - COALESCE(carve.cup_equiv, 0), 0),
      GREATEST(-(t.cash_amount - COALESCE(carve.cup_equiv, 0)), 0),
      t.seller_id, 'completed', false
    FROM public.transactions t
    LEFT JOIN (
      SELECT ti.transaction_id, SUM(ti.cash_paid * ti.exchange_rate) AS cup_equiv, SUM(ti.cash_paid) AS usd
      FROM public.transaction_items ti
      WHERE ti.cash_currency = 'USD' AND ti.currency = 'USD' AND COALESCE(ti.cash_paid, 0) > 0
      GROUP BY ti.transaction_id
    ) carve ON carve.transaction_id = t.id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND COALESCE(t.cash_amount, 0) > 0
      AND t.cash_received_cup IS NULL AND t.cash_received_usd IS NULL
      AND t.change_given_cup IS NULL AND t.change_given_usd IS NULL
    UNION ALL
    -- 1d) Ventas LEGACY — fila USD (carve explícito por ítems)
    SELECT t.created_at AS effective_date, 'venta_efectivo', 'transactions', t.id::text,
      COALESCE(t.invoice_number, left(t.id::text, 8)),
      'Venta cobrada (parcial) en USD ' || COALESCE(t.invoice_number, t.id::text),
      'USD',
      COALESCE(carve.usd, 0), 0,
      t.seller_id, 'completed', false
    FROM public.transactions t
    JOIN (
      SELECT ti.transaction_id, SUM(ti.cash_paid) AS usd
      FROM public.transaction_items ti
      WHERE ti.cash_currency = 'USD' AND ti.currency = 'USD' AND COALESCE(ti.cash_paid, 0) > 0
      GROUP BY ti.transaction_id
    ) carve ON carve.transaction_id = t.id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND COALESCE(t.cash_amount, 0) > 0
      AND t.cash_received_cup IS NULL AND t.cash_received_usd IS NULL
      AND t.change_given_cup IS NULL AND t.change_given_usd IS NULL
    UNION ALL
    -- 2) Anticipos de producción/trabajo en efectivo
    SELECT pt.payment_date AS effective_date, 'anticipo_produccion', 'payment_transactions', pt.id::text,
      left(pt.id::text, 8),
      'Anticipo de producción/trabajo en efectivo',
      pt.currency,
      pt.amount, 0,
      pt.paid_by, COALESCE(pt.direction, 'in'), false
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
      AND pt.ref_type IN ('production_order', 'work')
    UNION ALL
    -- 3) Pagos a proveedores en efectivo (salida)
    SELECT pt.payment_date AS effective_date, 'pago_proveedor', 'payment_transactions', pt.id::text,
      left(pt.id::text, 8),
      'Pago a proveedor/servicio en efectivo',
      pt.currency,
      0, pt.amount,
      pt.paid_by, COALESCE(pt.direction, 'in'), false
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
      AND pt.ref_type IN ('receipt', 'service')
    UNION ALL
    -- 4) Comisiones pagadas en efectivo (salida)
    SELECT cp.paid_at AS effective_date, 'comision_pagada', 'commission_payments', cp.id::text,
      left(cp.id::text, 8),
      'Comisión pagada en efectivo',
      COALESCE(cp.currency, 'CUP'),
      0, CASE WHEN COALESCE(cp.currency, 'CUP') = 'USD'
        THEN COALESCE(cp.amount_cup / NULLIF(cp.exchange_rate, 0), 0)
        ELSE COALESCE(cp.amount_cup, 0) END,
      cp.paid_by, 'paid', false
    FROM public.commission_payments cp
    WHERE cp.store_id = p_store_id AND cp.status = 'paid' AND cp.payment_method = 'cash'
    UNION ALL
    -- 5) Documentos IE (fondo, otros, ENTREGAS) + filas contra de anulación
    SELECT pt.payment_date,
      CASE
        WHEN pt.idempotency_key LIKE 'cf-anul-%' THEN 'anulacion_documento'
        WHEN d.concept = 'entrega_efectivo' THEN 'entrega_efectivo'
        WHEN d.doc_type = 'ingreso' THEN 'ingreso_caja'
        ELSE 'egreso_caja'
      END,
      'cash_flow_documents', d.id::text,
      d.document_number,
      CASE WHEN pt.idempotency_key LIKE 'cf-anul-%'
        THEN 'Anulación de ' || d.document_number || ' · ' || d.concept
        ELSE d.document_number || ' · ' || d.concept
        || CASE WHEN COALESCE(d.counterparty, '') <> '' THEN ' · ' || d.counterparty ELSE '' END END,
      pt.currency,
      CASE WHEN pt.direction = 'in' THEN pt.amount ELSE 0 END,
      CASE WHEN pt.direction = 'out' THEN pt.amount ELSE 0 END,
      d.responsible_user_id, d.status, false
    FROM public.payment_transactions pt
    JOIN public.cash_flow_documents d ON d.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
      AND pt.ref_type = 'cash_flow'
    UNION ALL
    -- 6) Reembolsos de devoluciones en efectivo (salida)
    SELECT pt.payment_date AS effective_date, 'reembolso_devolucion', 'devolutions', dev.id::text,
      COALESCE(dev.devolution_number, left(dev.id::text, 8)),
      'Reembolso al cliente por devolución ' || COALESCE(dev.devolution_number, dev.id::text)
        || ' (' || COALESCE(dev.reason, '') || ')',
      pt.currency,
      0, pt.amount,
      pt.paid_by, dev.status, false
    FROM public.payment_transactions pt
    LEFT JOIN public.devolutions dev ON dev.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
      AND pt.ref_type = 'devolution' AND pt.direction = 'refund'
    UNION ALL
    -- 6b) RECUPERACIONES de reembolsos revertidos en efectivo (entrada,
    --     MISIÓN DE CIERRE 2026-10-24 §4) — simétrico a 6)
    SELECT pt.payment_date AS effective_date, 'recuperacion_devolucion', 'devolutions', dev.id::text,
      COALESCE(dev.devolution_number, left(dev.id::text, 8)),
      'Recuperación del reembolso de la devolución ' || COALESCE(dev.devolution_number, dev.id::text)
        || ' (' || COALESCE(dev.reversal_reason, '') || ')',
      pt.currency,
      pt.amount, 0,
      pt.paid_by, dev.status, false
    FROM public.payment_transactions pt
    LEFT JOIN public.devolutions dev ON dev.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
      AND pt.ref_type = 'devolution' AND pt.direction = 'recovery'
    UNION ALL
    -- 7) Ajustes extraordinarios en efectivo
    SELECT pt.payment_date AS effective_date, 'ajuste_caja', 'payment_transactions', pt.id::text,
      left(pt.id::text, 8),
      COALESCE(pt.notes, 'Ajuste extraordinario de caja'),
      pt.currency,
      CASE WHEN pt.direction = 'in' THEN pt.amount ELSE 0 END,
      CASE WHEN pt.direction = 'out' THEN pt.amount ELSE 0 END,
      pt.paid_by, COALESCE(pt.direction, 'in'), false
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
      AND pt.ref_type = 'adjustment'
    UNION ALL
    -- 8) Turnos — INFORMATIVOS: no mueven saldo (apertura declarada por moneda)
    SELECT cc.created_at AS effective_date, 'apertura_turno', 'cash_closures', cc.id::text,
      left(cc.id::text, 8),
      'Apertura de turno · declarado: '
        || to_char(COALESCE(cc.opening_balance_cup, COALESCE(cc.opening_balance, 0)), 'FM999999990.00') || ' CUP'
        || CASE WHEN COALESCE(cc.opening_balance_usd, 0) > 0
          THEN ' · ' || to_char(cc.opening_balance_usd, 'FM999999990.00') || ' USD' ELSE '' END,
      'CUP',
      0, 0,
      cc.user_id, cc.status, true
    FROM public.cash_closures cc
    WHERE cc.store_id = p_store_id
    UNION ALL
    SELECT cc.closed_at AS effective_date, 'cierre_turno', 'cash_closures', cc.id::text,
      left(cc.id::text, 8),
      'Cierre de turno · contado: ' || to_char(cc.declared_cash, 'FM999999990.00') || ' CUP'
        || CASE WHEN COALESCE(cc.declared_cash_usd, 0) > 0
          THEN ' · ' || to_char(cc.declared_cash_usd, 'FM999999990.00') || ' USD' ELSE '' END,
      'CUP',
      0, 0,
      cc.user_id, cc.status, true
    FROM public.cash_closures cc
    WHERE cc.store_id = p_store_id AND cc.status = 'cerrado'
  ),
  classified AS (
    SELECT m.*,
      SUM(CASE WHEN m.is_informative THEN 0 ELSE m.amount_in - m.amount_out END)
        OVER (PARTITION BY m.currency
              ORDER BY m.effective_date, m.kind, m.ref_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after
    FROM raw_movements m
  ),
  filtered AS (
    SELECT c.*
    FROM classified c
    WHERE (v_currency = '' OR c.currency = v_currency)
      AND (v_kind = '' OR c.kind = v_kind)
      AND (p_date_from IS NULL OR c.effective_date >= p_date_from)
      AND (p_date_to IS NULL OR c.effective_date <= p_date_to)
  )
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'effective_date' DESC, row_data->>'kind' DESC, row_data->>'ref_id' DESC), '[]'::jsonb),
         (SELECT COUNT(*) FROM filtered)
  INTO v_rows, v_count
  FROM (
    SELECT to_jsonb(f) AS row_data
    FROM (
      SELECT fu.effective_date, fu.kind, fu.ref_table, fu.ref_id, fu.reference,
        fu.description, fu.currency, fu.amount_in, fu.amount_out,
        CASE WHEN fu.is_informative THEN NULL ELSE round(fu.balance_after, 2) END AS balance_after,
        p.full_name AS responsible_name, fu.status, fu.is_informative
      FROM filtered fu
      LEFT JOIN public.profiles p ON p.id = fu.responsible_id
      ORDER BY fu.effective_date DESC, fu.kind DESC, fu.ref_id DESC
      LIMIT v_limit OFFSET v_offset
    ) f
  ) page;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_count,
    'limit', v_limit,
    'offset', v_offset,
    'kinds', to_jsonb(v_kinds)
  );
END;
$function$;

-- ACL idéntica a la viva (service_role-only; firma real 7-arg)
revoke all on function public.get_cash_ledger(uuid, timestamp with time zone, timestamp with time zone, text, text, integer, integer) from public;
grant execute on function public.get_cash_ledger(uuid, timestamp with time zone, timestamp with time zone, text, text, integer, integer) to service_role;

-- ═══ 10) reverse_cash_flow_document — esperado incluye recuperaciones ═══
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
        AND created_at > v_shift.created_at AND created_at <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('receipt', 'service')
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('production_order', 'work')
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
      FROM public.commission_payments
      WHERE store_id = v_doc.store_id AND status = 'paid' AND payment_method = 'cash'
        AND paid_at > v_shift.created_at AND paid_at <= now();
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
      INTO v_cash_flow_in, v_cash_flow_out
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'cash_flow'
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'devolution' AND direction = 'refund'
        AND payment_date > v_shift.created_at AND payment_date <= now();
    -- MISIÓN DE CIERRE (2026-10-24 §4): recuperaciones simétricas — el dinero
    -- que VOLVIÓ al cajón por reversiones de devoluciones suma al esperado.
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'devolution' AND direction = 'recovery'
        AND payment_date > v_shift.created_at AND payment_date <= now();
    v_opening := COALESCE(v_shift.opening_balance, 0);
    v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                       - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                       - v_cash_refunds + v_cash_recoveries;
    -- MISIÓN POST-MERGE 2026-10-24: anular un ingreso retira BILLETES de su
    -- moneda del cajón; el saldo físico de ESA moneda no puede quedar en
    -- negativo (el canónico con la otra moneda no compensa billetes).
    SELECT COALESCE((public.get_cash_currency_summary(v_doc.store_id, NULL, NULL)
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

-- ACL espejo EXACTO de v2.24.0 (service_role-only; firma real 3-arg) — igual que 20261024220000.
revoke all on function public.reverse_cash_flow_document(uuid, text, uuid) from public;
grant execute on function public.reverse_cash_flow_document(uuid, text, uuid) to service_role;
