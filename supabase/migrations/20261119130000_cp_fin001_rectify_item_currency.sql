-- ============================================================================
-- CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 (parte B.1)
-- Fix del rectificador: la moneda de la ASIGNACIÓN MOVIDA prevalece
--
-- La parte B (20261119120000, YA APLICADA y registrada en el libro) etiquetaba
-- la asignación de pago movida por ítem con coalesce(to_currency, from_currency)
-- — preservando una etiqueta pre-existente de la columna destino. En la venta
-- e2614f36 los ítems tienen cash_currency='CUP' previo (default del POS) y
-- zelle_currency='USD': al mover zelle→cash, cash_paid 67.50 quedaría
-- etiquetado CUP cuando el dinero movido son 67.50 USD nominales.
--
-- Este parche invierte el coalesce: to_currency = coalesce(from_currency,
-- to_currency) — la moneda DECLARADA por la asignación de origen (la moneda
-- real del cobro) es la que viaja con el dinero. La rectificación de
-- e2614f36 (autorizada §6) se ejecuta DESPUÉS de este parche.
--
-- Nota: la parte B no llegó a rectificar ninguna venta en producción (la
-- rectificación e2614f36 estaba pendiente), por lo que no hay datos que
-- corregir retroactivamente: el parche alcanza.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fin_rectify_sale_payment_method(
  p_sale_id uuid,
  p_from_method text,
  p_to_method text,
  p_actor uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale public.transactions%ROWTYPE;
  v_pay_currency text;
  v_pay_currency_min text; v_pay_currency_max text;
  v_cup numeric := 0;
  v_nom numeric := NULL;
  v_from_cat text; v_to_cat text;
  v_orig_entry_id uuid;
  v_orig_mov_id uuid;
  v_new_entry_id uuid;
  v_date date;
  v_docnum text;
  v_tx_method text;
  v_from_col text; v_to_col text;
  v_from_paid text; v_to_paid text;
  v_from_cur text; v_to_cur text;
  v_count int;
BEGIN
  IF p_from_method NOT IN ('cash', 'transfer', 'zelle')
     OR p_to_method NOT IN ('cash', 'transfer', 'zelle') THEN
    RAISE EXCEPTION 'ERR_METHOD_NOT_SUPPORTED: from=% to=% (cash/transfer/zelle)', p_from_method, p_to_method;
  END IF;
  IF p_from_method = p_to_method THEN
    RAISE EXCEPTION 'ERR_SAME_METHOD: from == to (%)', p_from_method;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fin:rectify:' || p_sale_id::text));

  -- Idempotencia: una rectificación de medio de cobro por venta.
  IF EXISTS (SELECT 1 FROM public.fin_entries
             WHERE document_type = 'RECTIFICACION_FIN'
               AND document_id = p_sale_id AND event = 'ajuste_manual') THEN
    RETURN jsonb_build_object('status', 'YA_APLICADO', 'sale_id', p_sale_id);
  END IF;

  SELECT * INTO v_sale FROM public.transactions WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'ERR_SALE_NOT_FOUND: %', p_sale_id;
  END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_SALE_NOT_COMPLETED: status=% (solo ventas completed son rectificables)', v_sale.status;
  END IF;

  -- Pagos con el método origen (fuente primaria del cobro real).
  SELECT count(*), min(currency), max(currency),
         coalesce(sum(amount_cup), 0),
         sum(amount) FILTER (WHERE currency <> 'CUP')
    INTO v_count, v_pay_currency_min, v_pay_currency_max, v_cup, v_nom
  FROM public.payment_transactions
  WHERE ref_type = 'sale' AND ref_id = p_sale_id
    AND payment_method = p_from_method
    AND coalesce(direction, 'in') = 'in';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ERR_NO_PAYMENT_WITH_METHOD: la venta % no tiene cobros % (direction in)', p_sale_id, p_from_method;
  END IF;
  IF v_pay_currency_min IS DISTINCT FROM v_pay_currency_max THEN
    RAISE EXCEPTION 'ERR_MULTIPLE_PAYMENT_CURRENCIES: % / % (no desambiguable)', v_pay_currency_min, v_pay_currency_max;
  END IF;
  v_pay_currency := v_pay_currency_min;
  IF coalesce(v_cup, 0) <= 0 THEN
    RAISE EXCEPTION 'ERR_ZERO_AMOUNT: Σ amount_cup = %', v_cup;
  END IF;

  -- Categorías contables (mapa de la regla VENTA: v-cash-cup/v-cash-usd/
  -- v-transf-*/v-zelle). EUR/MLC en efectivo sin categoría: fail-closed.
  v_from_cat := CASE
    WHEN p_from_method = 'cash' AND v_pay_currency = 'CUP' THEN 'ACT_EFECTIVO_CUP'
    WHEN p_from_method = 'cash' AND v_pay_currency = 'USD' THEN 'ACT_EFECTIVO_USD'
    WHEN p_from_method IN ('transfer', 'zelle')           THEN 'ACT_BANCOS'
  END;
  v_to_cat := CASE
    WHEN p_to_method = 'cash' AND v_pay_currency = 'CUP' THEN 'ACT_EFECTIVO_CUP'
    WHEN p_to_method = 'cash' AND v_pay_currency = 'USD' THEN 'ACT_EFECTIVO_USD'
    WHEN p_to_method IN ('transfer', 'zelle')           THEN 'ACT_BANCOS'
  END;
  IF v_from_cat IS NULL OR v_to_cat IS NULL THEN
    RAISE EXCEPTION 'ERR_CATEGORY_UNMAPPED: % % → % % (moneda sin categoría de caja)', p_from_method, v_pay_currency, p_to_method, v_pay_currency;
  END IF;
  IF v_from_cat = v_to_cat THEN
    RAISE EXCEPTION 'ERR_SAME_FINANCIAL_CATEGORY: % → % ambas imputan % (sin efecto contable que rectificar)', p_from_method, p_to_method, v_to_cat;
  END IF;
  -- Catálogo GLOBAL (is_system, UNIQUE(code)); la columna store_id queda
  -- para extensiones futuras por tienda — la verificación es por código.
  IF NOT EXISTS (SELECT 1 FROM public.fin_categories
                 WHERE code = v_to_cat AND is_active) THEN
    RAISE EXCEPTION 'ERR_TARGET_CATEGORY_MISSING: % no existe/activa en el catálogo', v_to_cat;
  END IF;

  -- Movimiento de cobro original: localización EXACTA (sin ambigüedad).
  SELECT count(*) INTO v_count
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
    AND e.event = 'reconocimiento' AND e.status = 'posted'
    AND m.category_code = v_from_cat AND m.sense = 'debito'
    AND abs(m.amount_cup - v_cup) < 0.01;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ERR_COB_MOVEMENT_NOT_FOUND: categoría % con débito % CUP en el reconocimiento de %', v_from_cat, v_cup, p_sale_id;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ERR_AMBIGUOUS_COB_MOVEMENT: % candidatos (categoría % · % CUP)', v_count, v_from_cat, v_cup;
  END IF;
  SELECT m.entry_id, m.id INTO v_orig_entry_id, v_orig_mov_id
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
    AND e.event = 'reconocimiento' AND e.status = 'posted'
    AND m.category_code = v_from_cat AND m.sense = 'debito'
    AND abs(m.amount_cup - v_cup) < 0.01;

  v_date   := v_sale.created_at::date;
  v_docnum := 'RECT-FIN-' || upper(substr(p_sale_id::text, 1, 8));

  -- b) Asiento de rectificación (equilibrado; patrón RECT-015).
  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, posted_at, rule_version_id, movements_snapshot, description, created_by, status)
  VALUES (
    v_sale.store_id, 'RECTIFICACION_FIN', p_sale_id, v_docnum, 'ajuste_manual', NULL,
    v_date, now(), NULL, NULL,
    v_docnum || ': reclasificación del cobro de la venta ' || substr(p_sale_id::text, 1, 8)
      || ' — método registrado ' || p_from_method || ', método real ' || p_to_method
      || coalesce(' · cobro ' || trim(coalesce(v_nom::text, '')) || ' ' || v_pay_currency, '')
      || ' (hecho económico confirmado por el propietario). Ref asiento original ' || v_orig_entry_id::text
      || ' · movimiento ' || v_orig_mov_id::text
      || coalesce(' · causa: ' || p_reason, '')
      || ' · expediente CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 §6.',
    coalesce(p_actor, v_sale.seller_id), 'posted')
  RETURNING id INTO v_new_entry_id;

  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, traza,
    currency_origin, amount_origin)
  VALUES (
    v_new_entry_id, v_sale.store_id, v_from_cat, 'credito', round(v_cup, 2), 'CUP', 1,
    v_date, v_docnum,
    'Contra-partida: retiro del cobro clasificado como ' || p_from_method
      || ' (asiento ' || substr(v_orig_entry_id::text, 1, 8) || ')',
    jsonb_build_object(
      'rect', v_docnum, 'mision', 'CP-FIN-001',
      'origen', 'rectificacion_medio_cobro',
      'ref_entry', v_orig_entry_id, 'ref_mov', v_orig_mov_id,
      'from_method', p_from_method, 'to_method', p_to_method,
      'reason', p_reason),
    v_sale.sale_currency, v_nom);

  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, traza,
    currency_origin, amount_origin)
  VALUES (
    v_new_entry_id, v_sale.store_id, v_to_cat, 'debito', round(v_cup, 2), 'CUP', 1,
    v_date, v_docnum,
    'Cobro real ' || p_to_method
      || coalesce(' ' || trim(coalesce(v_nom::text, '')) || ' ' || v_pay_currency, '')
      || ' (venta ' || substr(p_sale_id::text, 1, 8) || ') reclasificado a ' || v_to_cat,
    jsonb_build_object(
      'rect', v_docnum, 'mision', 'CP-FIN-001',
      'origen', 'rectificacion_medio_cobro',
      'ref_entry', v_orig_entry_id, 'ref_mov', v_orig_mov_id,
      'from_method', p_from_method, 'to_method', p_to_method,
      'reason', p_reason),
    v_sale.sale_currency, v_nom);

  -- c) Corrección del MEDIO en los datos de la operación (Historial de Ventas).
  UPDATE public.payment_transactions
  SET payment_method = p_to_method,
      notes = CASE WHEN coalesce(notes, '') = '' THEN 'Rectificado ' || p_from_method || ' → ' || p_to_method
                   ELSE notes || ' · Rectificado ' || p_from_method || ' → ' || p_to_method END,
      updated_at = now()
  WHERE ref_type = 'sale' AND ref_id = p_sale_id
    AND payment_method = p_from_method
    AND coalesce(direction, 'in') = 'in';

  -- Método agregado de la venta (único → ese método; varios → mixed).
  SELECT CASE WHEN count(DISTINCT payment_method) = 1 THEN min(payment_method) ELSE 'mixed' END
    INTO v_tx_method
  FROM public.payment_transactions
  WHERE ref_type = 'sale' AND ref_id = p_sale_id
    AND coalesce(direction, 'in') = 'in';

  v_from_col := CASE p_from_method WHEN 'cash' THEN 'cash_amount' WHEN 'transfer' THEN 'transfer_amount' WHEN 'zelle' THEN 'zelle_amount' END;
  v_to_col   := CASE p_to_method   WHEN 'cash' THEN 'cash_amount' WHEN 'transfer' THEN 'transfer_amount' WHEN 'zelle' THEN 'zelle_amount' END;
  -- transactions.payment_method es payment_method_enum: cast explícito
  -- (v_tx_method proviene de payment_transactions.payment_method validado
  -- por los invariantes PT; un valor no enumerable aborta la transacción).
  EXECUTE format(
    'UPDATE public.transactions SET payment_method = $2::payment_method_enum, %I = greatest(coalesce(%I, 0) - $1, 0), %I = coalesce(%I, 0) + $1, updated_at = now() WHERE id = $3',
    v_from_col, v_from_col, v_to_col, v_to_col)
  USING v_cup, v_tx_method, p_sale_id;

  -- Asignación de pago por ítem (nominales en la moneda del cobro).
  v_from_paid := p_from_method || '_paid';
  v_to_paid   := p_to_method || '_paid';
  v_from_cur  := p_from_method || '_currency';
  v_to_cur    := p_to_method || '_currency';
  -- La MONEDA del dinero movido prevalece: to_currency = coalesce(from_currency,
  -- to_currency). Si la asignación de origen declara su moneda (p.ej. los
  -- ítems de e2614f36 con zelle_currency='USD' y cash_currency='CUP' previo),
  -- la asignación movida a cash debe quedar etiquetada en la moneda REAL del
  -- cobro (USD), no en la etiqueta pre-existente de la columna destino.
  EXECUTE format(
    'UPDATE public.transaction_items SET %I = coalesce(%I, 0) + coalesce(%I, 0), %I = 0, %I = coalesce(%I, %I) WHERE transaction_id = $1 AND coalesce(%I, 0) > 0',
    v_to_paid, v_to_paid, v_from_paid,
    v_from_paid,
    v_to_cur, v_from_cur, v_to_cur,
    v_from_paid)
  USING p_sale_id;

  RETURN jsonb_build_object(
    'status', 'OK', 'sale_id', p_sale_id, 'entry_id', v_new_entry_id,
    'docnum', v_docnum, 'importe_cup', round(v_cup, 2),
    'importe_origin', v_nom, 'moneda_cobro', v_pay_currency,
    'from_category', v_from_cat, 'to_category', v_to_cat);
END $function$;

-- Guard fail-closed: el parche debe estar presente.
DO $guard$
DECLARE v_n int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_rectify_sale_payment_method'
    AND pg_get_functiondef(p.oid) LIKE '%to_currency = coalesce(from_currency%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-B1-GUARD: parche de moneda de asignación ausente'; END IF;
END $guard$;
