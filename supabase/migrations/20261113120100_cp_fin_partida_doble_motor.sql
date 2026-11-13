-- ============================================================================
-- CP-FIN — MOTOR DE PARTIDA DOBLE · PARTE 2: MOTOR, TRIGGERS E INFORMES
-- Expediente: docs/audits/2026-11-13-cp-fin-partida-doble/
--
-- Contenido (idempotente):
--   1. Columnas de moneda original en fin_movements
--   2. fin_resolve_rule / fin_eval_condition / fin_compute_metrics
--   3. fin_apply_templates / fin_post_document / fin_post_document_safe
--   4. fin_post_document_annulment (asiento compensatorio)
--   5. Triggers de contabilización (NUNCA bloquean el negocio; errores aislados)
--   6. fin_simulate / fin_validate_rule_movements / fin_activate|deactivate
--   7. fin_apply_opening_balance / fin_backfill / fin_reprocess_posting_errors
--   8. Informes: balance sheet / income statement / dashboard / detail / status
--   9. Grants endurecidos
--
-- Reglas de oro: cada asiento equilibrado (Débitos=Créditos en CUP, tol 0.01);
-- idempotente (índice único + advisory lock); sin tasas inventadas (la tasa del
-- propio documento); escrituras SOLO por SECURITY DEFINER.
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Moneda original del documento (denormalizada; la aritmética es en CUP)
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.fin_movements ADD COLUMN IF NOT EXISTS currency_origin text;
ALTER TABLE public.fin_movements ADD COLUMN IF NOT EXISTS amount_origin numeric(14,2);

COMMENT ON COLUMN public.fin_movements.currency_origin IS 'Moneda original del documento de origen (CUP/USD/...); aritmética y amount_cup siempre en CUP.';
COMMENT ON COLUMN public.fin_movements.amount_origin IS 'Importe en la moneda original del documento (informativo para análisis por moneda).';

-- ══════════════════════════════════════════════════════════════════════════
-- 2. RESOLUCIÓN DE REGLAS Y EVALUACIÓN DE CONDICIONES
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_resolve_rule(p_doctype text, p_store_id uuid)
RETURNS public.fin_rule_versions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
  SELECT rv.* FROM public.fin_rule_versions rv
  WHERE rv.document_type = p_doctype AND rv.status = 'active'
    AND rv.effective_from <= CURRENT_DATE
    AND (rv.store_id = p_store_id OR rv.store_id IS NULL)
  ORDER BY rv.store_id DESC NULLS LAST
  LIMIT 1
$$;

-- Evalúa una condición {campo, op, valor} contra el dict de métricas.
-- Ops: = != > >= < <= existe en. Comparación numérica tolerante (texto→false).
CREATE OR REPLACE FUNCTION public.fin_eval_condition(p_cond jsonb, p_metrics jsonb)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_campo text := p_cond ->> 'campo';
  v_op text := p_cond ->> 'op';
  v_valor text := p_cond ->> 'valor';
  v_left text;
  v_ln numeric; v_rn numeric;
BEGIN
  IF v_campo IS NULL OR v_op IS NULL THEN RETURN false; END IF;
  v_left := p_metrics ->> v_campo;
  v_op := lower(v_op);
  IF v_op = 'existe' THEN
    RETURN v_left IS NOT NULL AND v_left <> '';
  END IF;
  IF v_op = 'en' THEN
    RETURN p_cond ? 'valor'
      AND jsonb_typeof(p_cond -> 'valor') = 'array'
      AND v_left IS NOT NULL
      AND (p_cond -> 'valor') ? v_left;
  END IF;
  IF v_left IS NULL THEN v_left := ''; END IF;
  IF v_op IN ('=', '!=') THEN
    RETURN CASE WHEN v_op = '=' THEN v_left = v_valor ELSE v_left <> v_valor END;
  END IF;
  -- comparaciones numéricas
  BEGIN
    v_ln := NULLIF(v_left, '')::numeric;
    v_rn := NULLIF(v_valor, '')::numeric;
  EXCEPTION WHEN others THEN RETURN false;
  END;
  IF v_ln IS NULL OR v_rn IS NULL THEN RETURN false; END IF;
  RETURN CASE v_op
    WHEN '>' THEN v_ln > v_rn WHEN '>=' THEN v_ln >= v_rn
    WHEN '<' THEN v_ln < v_rn WHEN '<=' THEN v_ln <= v_rn
    ELSE false END;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. MÉTRICAS ECONÓMICAS POR TIPO DOCUMENTAL (lee las tablas REALES)
--    Devuelve: store_id, doc_number, economic_date, estado_documento,
--    moneda_documento, descripcion_documento + métricas nombradas (todas CUP).
--    No inventa tasas: usa la del propio documento; CUP ⇒ tasa 1.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_compute_metrics(
  p_doctype text, p_document_id uuid,
  p_event text DEFAULT 'reconocimiento',
  p_payment_ref uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  v_store uuid; v_docnum text; v_date date; v_status text;
  v_cur text; v_rate numeric; v_amt numeric;
  v_total_cup numeric; v_cogs numeric; v_missing int;
  v_missing_txt text;
  v_ts timestamptz;
  v_pt public.payment_transactions%ROWTYPE;
  r record;
BEGIN
  CASE p_doctype

  WHEN 'VENTA' THEN
    SELECT t.store_id, t.invoice_number, t.created_at::date, t.status,
           t.sale_currency, t.sale_exchange_rate, t.total_amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt
    FROM public.transactions t WHERE t.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: transacción %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN v_cur = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    SELECT coalesce(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 0),
           count(*) FILTER (WHERE coalesce(ti.cost_at_sale, 0) = 0)
      INTO v_cogs, v_missing
    FROM public.transaction_items ti
    LEFT JOIN public.products p ON p.id = ti.product_id
    WHERE ti.transaction_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Venta ' || coalesce(v_docnum, ''),
      'total_cup', v_total_cup, 'costo_productos_cup', round(v_cogs, 2),
      'lineas_sin_costo', v_missing,
      'cob_cash_cup', 0, 'cob_cash_usd_cup', 0,
      'cob_transfer_cup', 0, 'cob_transfer_usd_cup', 0, 'cob_zelle_usd_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'sale' AND pt.ref_id = p_document_id
        AND coalesce(pt.direction, 'in') = 'in'
      GROUP BY 1, 2
    LOOP
      v := jsonb_set(v, ARRAY['cob_' || r.metodo || '_' || lower(r.moneda) || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
    END LOOP;

  WHEN 'DEVOLUCION_VENTA' THEN
    SELECT d.store_id, d.devolution_number, d.processed_at::date, d.status,
           d.currency, d.exchange_rate, d.total_amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt
    FROM public.devolutions d WHERE d.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: devolución %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN v_cur = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    SELECT coalesce(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0)), 0)
      INTO v_cogs
    FROM public.devolution_items di
    JOIN public.devolutions dd ON dd.id = di.devolution_id
    LEFT JOIN public.transaction_items oti
      ON oti.transaction_id = dd.original_transaction_id AND oti.product_id = di.product_id
    LEFT JOIN public.products p ON p.id = di.product_id
    WHERE di.devolution_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Devolución ' || coalesce(v_docnum, ''),
      'total_cup', v_total_cup, 'costo_devuelto_cup', round(v_cogs, 2),
      'reembolso_cash_cup', 0, 'reembolso_cash_usd_cup', 0,
      'reembolso_transfer_cup', 0, 'reembolso_transfer_usd_cup', 0,
      'reembolso_zelle_usd_cup', 0, 'store_credit_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_document_id
        AND pt.direction = 'refund'
      GROUP BY 1, 2
    LOOP
      v := jsonb_set(v, ARRAY['reembolso_' || r.metodo || '_' || lower(r.moneda) || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
    END LOOP;
    SELECT coalesce(sum(scl.amount * CASE WHEN coalesce(v_cur, 'CUP') = 'CUP' THEN 1
                                          ELSE coalesce(v_rate, 1) END), 0)
      INTO v_amt
    FROM public.store_credit_ledger scl WHERE scl.devolution_id = p_document_id;
    v := jsonb_set(v, ARRAY['store_credit_cup'], to_jsonb(round(v_amt, 2)));

  WHEN 'RECEPCION' THEN
    SELECT r.store_id, r.document_number, r.reception_date::date, r.status
      INTO v_store, v_docnum, v_date, v_status
    FROM public.receipts r WHERE r.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: recepción %', p_document_id; END IF;
    SELECT coalesce(sum(ri.quantity * ri.unit_cost_cup), 0) INTO v_total_cup
    FROM public.receipt_items ri WHERE ri.receipt_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', 'CUP',
      'descripcion_documento', 'Entrada de almacén ' || coalesce(v_docnum, ''),
      'total_cup', round(v_total_cup, 2), 'importe_pago_cup', 0, 'metodo_pago', '',
      'pendiente_cup', 0);
    SELECT coalesce(sum(pt.amount_cup), 0) INTO v_amt
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'receipt' AND pt.ref_id = p_document_id
      AND coalesce(pt.direction, 'in') = 'in';
    v := jsonb_set(v, ARRAY['pendiente_cup'], to_jsonb(round(v_total_cup - v_amt, 2)));
    IF p_event = 'pago' AND p_payment_ref IS NOT NULL THEN
      SELECT * INTO v_pt FROM public.payment_transactions pt WHERE pt.id = p_payment_ref;
      v := jsonb_set(v, ARRAY['importe_pago_cup'], to_jsonb(round(coalesce(v_pt.amount_cup, 0), 2)))
          || jsonb_build_object('metodo_pago', v_pt.payment_method);
    END IF;

  WHEN 'SERVICIO_RECIBIDO' THEN
    SELECT s.store_id, s.service_number, s.service_date, s.status,
           s.currency, s.exchange_rate, s.total_amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt
    FROM public.received_services s WHERE s.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: servicio %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN v_cur = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Servicio recibido ' || coalesce(v_docnum, ''),
      'total_cup', v_total_cup, 'importe_pago_cup', 0, 'metodo_pago', '',
      'pendiente_cup', 0);
    SELECT coalesce(sum(pt.amount_cup), 0) INTO v_amt
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'service' AND pt.ref_id = p_document_id
      AND coalesce(pt.direction, 'in') = 'in';
    v := jsonb_set(v, ARRAY['pendiente_cup'], to_jsonb(round(v_total_cup - v_amt, 2)));
    IF p_event = 'pago' AND p_payment_ref IS NOT NULL THEN
      SELECT * INTO v_pt FROM public.payment_transactions pt WHERE pt.id = p_payment_ref;
      v := jsonb_set(v, ARRAY['importe_pago_cup'], to_jsonb(round(coalesce(v_pt.amount_cup, 0), 2)))
          || jsonb_build_object('metodo_pago', v_pt.payment_method);
    END IF;

  WHEN 'VALE_SALIDA' THEN
    SELECT i.store_id, i.slip_number, i.created_at::date, i.status, i.total_cost
      INTO v_store, v_docnum, v_date, v_status, v_total_cup
    FROM public.issue_slips i WHERE i.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: vale %', p_document_id; END IF;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', 'CUP',
      'descripcion_documento', 'Vale de salida ' || coalesce(v_docnum, ''),
      'costo_cup', round(coalesce(v_total_cup, 0), 2));

  WHEN 'AJUSTE_INVENTARIO' THEN
    SELECT a.store_id, a.id::text, a.confirmed_at::date, a.status, a.reason, a.confirmed_at
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_ts
    FROM public.inventory_adjustments a WHERE a.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: ajuste %', p_document_id; END IF;
    SELECT
      coalesce(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 0),
      coalesce(sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0), 0)
      INTO v_cogs, v_total_cup
    FROM public.inventory_adjustment_items i
    JOIN public.products p ON p.id = i.product_id
    LEFT JOIN LATERAL (
      SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
      WHERE wcl.product_id = i.product_id AND wcl.store_id = v_store
        AND wcl.created_at <= v_ts
      ORDER BY wcl.created_at DESC LIMIT 1
    ) w ON true
    WHERE i.adjustment_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', 'CUP',
      'descripcion_documento', 'Ajuste de inventario (' || coalesce(v_cur, '') || ')',
      'valor_faltante_cup', round(v_cogs, 2), 'valor_sobrante_cup', round(v_total_cup, 2),
      'motivo', v_cur);

  WHEN 'COMISION' THEN
    SELECT c.store_id, c.id::text, c.paid_at::date, c.status,
           c.currency, c.exchange_rate, c.final_amount, c.payment_method
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt, v_missing_txt
    FROM public.commission_payments c WHERE c.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: comisión %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN v_cur IS NULL OR v_cur = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', coalesce(v_cur, 'CUP'),
      'descripcion_documento', 'Pago de comisión',
      'total_cup', v_total_cup, 'metodo_pago', v_missing_txt,
      'moneda_comision', coalesce(v_cur, 'CUP'));

  WHEN 'NOMINA' THEN
    SELECT n.store_id, n.payroll_number, n.period_end, n.status, n.currency,
           n.total_gross, n.total_net, n.total_deductions, n.total_social_security,
           n.payment_method
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_amt, v_total_cup, v_cogs, v_missing, v_rate
    FROM public.payrolls n WHERE n.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: nómina %', p_document_id; END IF;
    IF v_cur IS NULL OR v_cur = 'CUP' THEN
      v := jsonb_build_object(
        'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
        'estado_documento', v_status, 'moneda_documento', 'CUP',
        'descripcion_documento', 'Nómina ' || coalesce(v_docnum, ''),
        'total_gross_cup', round(coalesce(v_amt, 0), 2),
        'total_net_cup', round(coalesce(v_total_cup, 0), 2),
        'total_deducciones_cup', round(coalesce(v_cogs, 0), 2),
        'total_social_cup', round(coalesce(v_missing, 0), 2),
        'metodo_pago', v_rate);
    ELSE
      RAISE EXCEPTION 'ERR_PAYROLL_CURRENCY_NOT_SUPPORTED: nómina % en % (solo CUP soportado; documentado en el expediente)', p_document_id, v_cur;
    END IF;

  WHEN 'FLUJO_CAJA' THEN
    SELECT f.store_id, f.id::text, f.operation_date::date, f.status,
           f.doc_type, f.concept, f.currency, f.amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt, v_total_cup
    FROM public.cash_flow_documents f WHERE f.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: flujo de caja %', p_document_id; END IF;
    SELECT f.amount_cup INTO v_total_cup FROM public.cash_flow_documents f WHERE f.id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_amt,
      'descripcion_documento', 'Movimiento de caja (' || coalesce(v_rate, '') || ')',
      'importe_cup', round(coalesce(v_total_cup, 0), 2),
      'tipo_documento', v_cur, 'concepto', v_rate);

  ELSE
    RAISE EXCEPTION 'ERR_DOCTYPE_NOT_SUPPORTED: %', p_doctype;
  END CASE;

  IF (v ->> 'store_id') IS NULL OR (v ->> 'economic_date') IS NULL THEN
    RAISE EXCEPTION 'ERR_METRICS_INCOMPLETE: % %', p_doctype, p_document_id;
  END IF;
  RETURN v;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. APLICACIÓN DE PLANTILLAS → MOVIMIENTOS
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_apply_templates(
  p_templates jsonb, p_event text, p_metrics jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  t jsonb; c jsonb;
  v_out jsonb := '[]'::jsonb;
  v_pass boolean;
  v_origen jsonb; v_amount numeric;
BEGIN
  FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_templates, '[]'::jsonb)) LOOP
    IF coalesce(t ->> 'evento', 'reconocimiento') <> p_event THEN CONTINUE; END IF;
    -- condición: null | objeto | array (AND)
    v_pass := true;
    IF t -> 'condicion' IS NOT NULL AND jsonb_typeof(t -> 'condicion') <> 'null' THEN
      IF jsonb_typeof(t -> 'condicion') = 'array' THEN
        FOR c IN SELECT * FROM jsonb_array_elements(t -> 'condicion') LOOP
          IF NOT public.fin_eval_condition(c, p_metrics) THEN v_pass := false; EXIT; END IF;
        END LOOP;
      ELSE
        v_pass := public.fin_eval_condition(t -> 'condicion', p_metrics);
      END IF;
    END IF;
    IF NOT v_pass THEN CONTINUE; END IF;
    -- importe
    v_origen := t -> 'origen';
    IF v_origen IS NULL THEN CONTINUE; END IF;
    IF v_origen ->> 'tipo' = 'constante' THEN
      v_amount := coalesce((v_origen ->> 'valor')::numeric, 0);
    ELSE
      v_amount := coalesce((p_metrics ->> (v_origen ->> 'metrica'))::numeric, 0);
    END IF;
    v_amount := round(v_amount, 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_out := v_out || jsonb_build_object(
      'categoria', t ->> 'categoria',
      'sentido', t ->> 'sentido',
      'amount', v_amount,
      'currency', 'CUP', 'exchange_rate', 1,
      'currency_origin', p_metrics ->> 'moneda_documento',
      'traza', jsonb_build_object(
        'template', t ->> 'id',
        'metrica', v_origen ->> 'metrica',
        'regla', 'motor-cp-fin'));
  END LOOP;
  RETURN v_out;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. MOTOR CENTRAL — CONTABILIZAR UN DOCUMENTO (idempotente y equilibrado)
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_post_document(
  p_doctype text, p_document_id uuid, p_event text,
  p_payment_ref uuid DEFAULT NULL, p_actor uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_rule public.fin_rule_versions%ROWTYPE;
  v_metrics jsonb; v_movs jsonb; t jsonb;
  v_entry_id uuid; v_debit numeric := 0; v_credit numeric := 0;
  v_store uuid; v_docnum text; v_date date;
BEGIN
  IF p_document_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_DOCUMENT'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));

  -- Idempotencia (doble clic, reintento, concurrencia)
  IF EXISTS (
    SELECT 1 FROM public.fin_entries e
    WHERE e.document_type = p_doctype AND e.document_id = p_document_id
      AND e.event = p_event AND e.payment_ref IS NOT DISTINCT FROM p_payment_ref
  ) THEN
    RETURN NULL;
  END IF;

  v_metrics := public.fin_compute_metrics(p_doctype, p_document_id, p_event, p_payment_ref);
  v_store := (v_metrics ->> 'store_id')::uuid;
  v_docnum := v_metrics ->> 'doc_number';
  v_date := (v_metrics ->> 'economic_date')::date;

  v_rule := public.fin_resolve_rule(p_doctype, v_store);
  IF v_rule.id IS NULL THEN RETURN NULL; END IF;               -- sin regla activa: no contabiliza

  v_movs := public.fin_apply_templates(v_rule.movements, p_event, v_metrics);
  IF v_movs = '[]'::jsonb THEN RETURN NULL; END IF;            -- regla sin efectos para este doc

  SELECT coalesce(sum(CASE WHEN m ->> 'sentido' = 'debito' THEN (m ->> 'amount')::numeric ELSE 0 END), 0),
         coalesce(sum(CASE WHEN m ->> 'sentido' = 'credito' THEN (m ->> 'amount')::numeric ELSE 0 END), 0)
    INTO v_debit, v_credit
  FROM jsonb_array_elements(v_movs) m;

  IF p_event NOT IN ('apertura', 'ajuste_manual') AND abs(v_debit - v_credit) > 0.01 THEN
    RAISE EXCEPTION 'ERR_UNBALANCED: débitos=% créditos=% (tipo=% doc=%)',
      v_debit, v_credit, p_doctype, p_document_id;
  END IF;

  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, rule_version_id, movements_snapshot, description, created_by)
  VALUES (
    v_store, p_doctype, p_document_id, v_docnum, p_event, p_payment_ref,
    v_date, v_rule.id, v_movs,
    v_metrics ->> 'descripcion_documento', p_actor)
  RETURNING id INTO v_entry_id;

  FOR t IN SELECT * FROM jsonb_array_elements(v_movs) LOOP
    INSERT INTO public.fin_movements (
      entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
      economic_date, document_number, description, currency_origin, traza)
    VALUES (
      v_entry_id, v_store, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
      'CUP', 1, v_date, v_docnum, v_metrics ->> 'descripcion_documento',
      t ->> 'currency_origin', t -> 'traza');
  END LOOP;

  RETURN v_entry_id;
END $function$;

-- Contabilización a prueba de fallos: un error de reglas NUNCA bloquea el
-- negocio; queda registrado en fin_posting_errors (visible y reprocesable).
CREATE OR REPLACE FUNCTION public.fin_post_document_safe(
  p_doctype text, p_document_id uuid, p_event text, p_payment_ref uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_entry uuid;
BEGIN
  BEGIN
    v_entry := public.fin_post_document(p_doctype, p_document_id, p_event, p_payment_ref);
    RETURN v_entry;
  EXCEPTION WHEN others THEN
    INSERT INTO public.fin_posting_errors (store_id, document_type, document_id, event, error_code, error_detail)
    VALUES (
      (SELECT CASE p_doctype
         WHEN 'VENTA' THEN (SELECT store_id FROM public.transactions WHERE id = p_document_id)
         WHEN 'DEVOLUCION_VENTA' THEN (SELECT store_id FROM public.devolutions WHERE id = p_document_id)
         WHEN 'RECEPCION' THEN (SELECT store_id FROM public.receipts WHERE id = p_document_id)
         WHEN 'SERVICIO_RECIBIDO' THEN (SELECT store_id FROM public.received_services WHERE id = p_document_id)
         WHEN 'VALE_SALIDA' THEN (SELECT store_id FROM public.issue_slips WHERE id = p_document_id)
         WHEN 'AJUSTE_INVENTARIO' THEN (SELECT store_id FROM public.inventory_adjustments WHERE id = p_document_id)
         WHEN 'COMISION' THEN (SELECT store_id FROM public.commission_payments WHERE id = p_document_id)
         WHEN 'NOMINA' THEN (SELECT store_id FROM public.payrolls WHERE id = p_document_id)
         WHEN 'FLUJO_CAJA' THEN (SELECT store_id FROM public.cash_flow_documents WHERE id = p_document_id)
         ELSE NULL END),
      p_doctype, p_document_id, p_event,
      substr(SQLERRM, 1, 80), substr(SQLERRM || ' | ' || coalesce(SQLSTATE, ''), 1, 2000));
    RETURN NULL;
  END;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. ANULACIÓN — asiento compensatorio enlazado (nunca UPDATE del histórico)
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_post_document_annulment(
  p_doctype text, p_document_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  e record; m record; v_new uuid; v_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));
  FOR e IN
    SELECT * FROM public.fin_entries
    WHERE document_type = p_doctype AND document_id = p_document_id
      AND status = 'posted' AND event IN ('reconocimiento', 'pago')
    ORDER BY posted_at
  LOOP
    -- ¿ya tiene anulación? (idempotente)
    IF EXISTS (SELECT 1 FROM public.fin_entries x
               WHERE x.reversal_of = e.id) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, payment_ref,
      economic_date, rule_version_id, movements_snapshot, reversal_of, description, created_by)
    VALUES (
      e.store_id, e.document_type, e.document_id, e.document_number, 'anulacion',
      e.payment_ref, e.economic_date, e.rule_version_id, e.movements_snapshot, e.id,
      'Anulación: ' || coalesce(e.description, ''), e.created_by)
    RETURNING id INTO v_new;
    FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = e.id LOOP
      INSERT INTO public.fin_movements (
        entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
        economic_date, document_number, description, currency_origin, traza)
      VALUES (
        v_new, m.store_id, m.category_code,
        CASE WHEN m.sense = 'debito' THEN 'credito' ELSE 'debito' END,
        m.amount, m.currency, m.exchange_rate, m.economic_date, m.document_number,
        'Anulación: ' || coalesce(m.description, ''), m.currency_origin,
        m.traza || jsonb_build_object('anulacion_de', m.id));
    END LOOP;
    UPDATE public.fin_entries SET status = 'reversed' WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_post_annulment_safe(
  p_doctype text, p_document_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  BEGIN
    v_n := public.fin_post_document_annulment(p_doctype, p_document_id);
    RETURN v_n;
  EXCEPTION WHEN others THEN
    INSERT INTO public.fin_posting_errors (store_id, document_type, document_id, event, error_code, error_detail)
    VALUES (NULL, p_doctype, p_document_id, 'anulacion',
            substr(SQLERRM, 1, 80), substr(SQLERRM, 1, 2000));
    RETURN 0;
  END;
END $function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. TRIGGERS DE CONTABILIZACIÓN (delgados; errores aislados)
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_trg_transactions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status <> 'completed') THEN
    PERFORM public.fin_post_document_safe('VENTA', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('voided', 'reversed', 'refunded')
        AND OLD.status NOT IN ('voided', 'reversed', 'refunded') THEN
    PERFORM public.fin_post_annulment_safe('VENTA', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_transactions ON public.transactions;
CREATE TRIGGER fin_trg_transactions
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_transactions();

CREATE OR REPLACE FUNCTION public.fin_trg_devolutions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status <> 'completed') THEN
    PERFORM public.fin_post_document_safe('DEVOLUCION_VENTA', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('voided', 'reversed')
        AND OLD.status NOT IN ('voided', 'reversed') THEN
    PERFORM public.fin_post_annulment_safe('DEVOLUCION_VENTA', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_devolutions ON public.devolutions;
CREATE TRIGGER fin_trg_devolutions
  AFTER INSERT OR UPDATE OF status ON public.devolutions
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_devolutions();

CREATE OR REPLACE FUNCTION public.fin_trg_receipts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    PERFORM public.fin_post_document_safe('RECEPCION', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('voided', 'reversed')
        AND OLD.status NOT IN ('voided', 'reversed') THEN
    PERFORM public.fin_post_annulment_safe('RECEPCION', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_receipts ON public.receipts;
CREATE TRIGGER fin_trg_receipts
  AFTER INSERT OR UPDATE OF status ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_receipts();

CREATE OR REPLACE FUNCTION public.fin_trg_received_services() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    PERFORM public.fin_post_document_safe('SERVICIO_RECIBIDO', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status <> 'voided' THEN
    PERFORM public.fin_post_annulment_safe('SERVICIO_RECIBIDO', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_received_services ON public.received_services;
CREATE TRIGGER fin_trg_received_services
  AFTER INSERT OR UPDATE OF status ON public.received_services
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_received_services();

CREATE OR REPLACE FUNCTION public.fin_trg_issue_slips() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status <> 'completed') THEN
    PERFORM public.fin_post_document_safe('VALE_SALIDA', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('voided', 'reversed')
        AND OLD.status NOT IN ('voided', 'reversed') THEN
    PERFORM public.fin_post_annulment_safe('VALE_SALIDA', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_issue_slips ON public.issue_slips;
CREATE TRIGGER fin_trg_issue_slips
  AFTER INSERT OR UPDATE OF status ON public.issue_slips
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_issue_slips();

CREATE OR REPLACE FUNCTION public.fin_trg_inventory_adjustments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN
    PERFORM public.fin_post_document_safe('AJUSTE_INVENTARIO', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'reversed' AND OLD.status <> 'reversed' THEN
    PERFORM public.fin_post_annulment_safe('AJUSTE_INVENTARIO', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_inventory_adjustments ON public.inventory_adjustments;
CREATE TRIGGER fin_trg_inventory_adjustments
  AFTER INSERT OR UPDATE OF status ON public.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_inventory_adjustments();

CREATE OR REPLACE FUNCTION public.fin_trg_commission_payments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status <> 'paid') THEN
    PERFORM public.fin_post_document_safe('COMISION', NEW.id, 'pago');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status = 'paid' THEN
    PERFORM public.fin_post_annulment_safe('COMISION', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_commission_payments ON public.commission_payments;
CREATE TRIGGER fin_trg_commission_payments
  AFTER INSERT OR UPDATE OF status ON public.commission_payments
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_commission_payments();

CREATE OR REPLACE FUNCTION public.fin_trg_payrolls() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed') THEN
    PERFORM public.fin_post_document_safe('NOMINA', NEW.id, 'reconocimiento');
  ELSIF NEW.status = 'paid' AND TG_OP = 'UPDATE' AND OLD.status <> 'paid' THEN
    PERFORM public.fin_post_document_safe('NOMINA', NEW.id, 'pago');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status = 'confirmed' THEN
    PERFORM public.fin_post_annulment_safe('NOMINA', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_payrolls ON public.payrolls;
CREATE TRIGGER fin_trg_payrolls
  AFTER INSERT OR UPDATE OF status ON public.payrolls
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_payrolls();

CREATE OR REPLACE FUNCTION public.fin_trg_cash_flow_documents() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'confirmado' AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmado') THEN
    PERFORM public.fin_post_document_safe('FLUJO_CAJA', NEW.id, 'reconocimiento');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'anulado' AND OLD.status <> 'anulado' THEN
    PERFORM public.fin_post_annulment_safe('FLUJO_CAJA', NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_cash_flow_documents ON public.cash_flow_documents;
CREATE TRIGGER fin_trg_cash_flow_documents
  AFTER INSERT OR UPDATE OF status ON public.cash_flow_documents
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_cash_flow_documents();

-- Pagos posteriores (register_payment) → asiento de pago. Solo receipt/service
-- (sale se contabiliza en el reconocimiento; devolución lleva sus reembolsos;
-- commission se dispara desde commission_payments; cash_flow en su documento).
CREATE OR REPLACE FUNCTION public.fin_trg_payment_transactions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_doctype text;
BEGIN
  IF NEW.ref_type = 'receipt' THEN v_doctype := 'RECEPCION';
  ELSIF NEW.ref_type = 'service' THEN v_doctype := 'SERVICIO_RECIBIDO';
  ELSE RETURN COALESCE(NEW, OLD);
  END IF;
  IF coalesce(NEW.direction, 'in') <> 'in' THEN RETURN COALESCE(NEW, OLD); END IF;
  PERFORM public.fin_post_document_safe(v_doctype, NEW.ref_id, 'pago', NEW.id);
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS fin_trg_payment_transactions ON public.payment_transactions;
CREATE TRIGGER fin_trg_payment_transactions
  AFTER INSERT ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fin_trg_payment_transactions();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. SIMULADOR, VALIDACIÓN Y ACTIVACIÓN DE REGLAS
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.fin_simulate(
  p_doctype text,
  p_document_id uuid DEFAULT NULL,
  p_metrics_manual jsonb DEFAULT NULL,
  p_movements_override jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rule public.fin_rule_versions%ROWTYPE;
  v_metrics jsonb; v_movs jsonb;
  v_store uuid; v_debit numeric := 0; v_credit numeric := 0;
  v_bal jsonb;
BEGIN
  IF p_document_id IS NOT NULL THEN
    v_metrics := public.fin_compute_metrics(p_doctype, p_document_id, 'reconocimiento', NULL);
    v_store := (v_metrics ->> 'store_id')::uuid;
  ELSE
    v_metrics := coalesce(p_metrics_manual, '{}'::jsonb);
    v_store := coalesce((v_metrics ->> 'store_id')::uuid,
                        (SELECT s.active_store_id FROM public.profiles s WHERE s.id = v_caller));
  END IF;
  IF v_caller IS NOT NULL AND v_store IS NOT NULL
     AND NOT (public.is_admin_check(v_caller) OR public.has_store_access_as(v_caller, v_store)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_movements_override IS NOT NULL AND jsonb_typeof(p_movements_override) = 'array' THEN
    v_movs := public.fin_apply_templates(p_movements_override, 'reconocimiento', v_metrics);
    v_bal := jsonb_build_object('fuente', 'borrador');
  ELSE
    v_rule := public.fin_resolve_rule(p_doctype, v_store);
    v_movs := public.fin_apply_templates(v_rule.movements, 'reconocimiento', v_metrics);
    v_bal := jsonb_build_object('fuente', 'regla_activa', 'version', v_rule.version);
  END IF;
  SELECT coalesce(sum(CASE WHEN m ->> 'sentido' = 'debito' THEN (m ->> 'amount')::numeric ELSE 0 END), 0),
         coalesce(sum(CASE WHEN m ->> 'sentido' = 'credito' THEN (m ->> 'amount')::numeric ELSE 0 END), 0)
    INTO v_debit, v_credit
  FROM jsonb_array_elements(v_movs) m;
  RETURN jsonb_build_object(
    'doctype', p_doctype,
    'document_id', p_document_id,
    'metrics', v_metrics,
    'movimientos', v_movs,
    'total_debitos', round(v_debit, 2),
    'total_creditos', round(v_credit, 2),
    'equilibrado', abs(v_debit - v_credit) <= 0.01,
    'regla', v_bal,
    'escribe_datos', false);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_validate_rule_movements(p_movements jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  t jsonb;
  v_errores text[] := '{}'; v_warn text[] := '{}';
  v_ev text;
  v_ok boolean;
  i int := 0;
BEGIN
  IF p_movements IS NULL OR jsonb_typeof(p_movements) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'errores', ARRAY['movements debe ser un array'], 'advertencias', '{}');
  END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(p_movements) LOOP
    i := i + 1;
    IF coalesce(t ->> 'evento', '') NOT IN ('reconocimiento', 'pago') THEN
      v_errores := v_errores || format('mov[%s]: evento inválido', i);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fin_categories c
                   WHERE c.code = t ->> 'categoria' AND c.is_active) THEN
      v_errores := v_errores || format('mov[%s]: categoría inexistente o inactiva (%s)', i, t ->> 'categoria');
    END IF;
    IF coalesce(t ->> 'sentido', '') NOT IN ('debito', 'credito') THEN
      v_errores := v_errores || format('mov[%s]: sentido inválido', i);
    END IF;
    IF t -> 'origen' IS NULL OR coalesce(t -> 'origen' ->> 'tipo', '') NOT IN ('metrica', 'constante') THEN
      v_errores := v_errores || format('mov[%s]: origen de importe no definido', i);
    END IF;
    IF (t -> 'origen' ->> 'tipo') = 'metrica' AND NOT EXISTS (
      SELECT 1 FROM public.fin_metric_catalog mc
      WHERE mc.metric = (t -> 'origen' ->> 'metrica')) THEN
      v_warn := v_warn || format('mov[%s]: métrica "%s" fuera del catálogo (verifíquela manualmente)', i, t -> 'origen' ->> 'metrica');
    END IF;
  END LOOP;
  -- balance estructural por evento (solo plantillas incondicionales)
  FOR v_ev IN SELECT DISTINCT unnest(ARRAY['reconocimiento', 'pago']) LOOP
    v_ok := EXISTS (SELECT 1 FROM jsonb_array_elements(p_movements) m
                    WHERE m ->> 'evento' = v_ev AND m ->> 'sentido' = 'debito'
                      AND (m -> 'condicion' IS NULL OR jsonb_typeof(m -> 'condicion') = 'null'))
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_movements) m
                    WHERE m ->> 'evento' = v_ev AND m ->> 'sentido' = 'credito'
                      AND (m -> 'condicion' IS NULL OR jsonb_typeof(m -> 'condicion') = 'null'));
    IF NOT v_ok AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_movements) m
                            WHERE m ->> 'evento' = v_ev) THEN
      v_warn := v_warn || format('evento %s: sin par débito/crédito incondicional (el balance dependerá de las condiciones — use el simulador)', v_ev);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', array_length(v_errores, 1) IS NULL,
                            'errores', to_jsonb(v_errores),
                            'advertencias', to_jsonb(v_warn));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_activate_rule_version(
  p_rule_version_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rule public.fin_rule_versions%ROWTYPE;
  v_val jsonb;
BEGIN
  SELECT * INTO v_rule FROM public.fin_rule_versions WHERE id = p_rule_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RULE_NOT_FOUND'; END IF;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  IF v_rule.store_id IS NOT NULL THEN
    IF NOT public.has_store_role_as(v_caller, v_rule.store_id, ARRAY['admin']) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;
  ELSE
    IF NOT public.is_admin_check(v_caller) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  END IF;
  IF v_rule.status = 'active' THEN RAISE EXCEPTION 'ERR_ALREADY_ACTIVE'; END IF;
  v_val := public.fin_validate_rule_movements(v_rule.movements);
  IF NOT (v_val ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'ERR_RULE_INVALID: %', (v_val ->> 'errores');
  END IF;
  UPDATE public.fin_rule_versions SET status = 'inactive', deactivated_at = now()
  WHERE document_type = v_rule.document_type AND store_id IS NOT DISTINCT FROM v_rule.store_id
    AND status = 'active';
  UPDATE public.fin_rule_versions
  SET status = 'active', activated_at = now(), activated_by = v_caller,
      effective_from = GREATEST(effective_from, CURRENT_DATE)
  WHERE id = p_rule_version_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('FIN_RULE_ACTIVATED', 'fin_rule_versions', p_rule_version_id, v_rule.store_id, v_caller,
          jsonb_build_object('document_type', v_rule.document_type, 'version', v_rule.version));
  RETURN jsonb_build_object('status', 'success', 'rule_version_id', p_rule_version_id,
                            'advertencias', v_val -> 'advertencias');
END $function$;

CREATE OR REPLACE FUNCTION public.fin_deactivate_rule_version(
  p_rule_version_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rule public.fin_rule_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_rule FROM public.fin_rule_versions WHERE id = p_rule_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RULE_NOT_FOUND'; END IF;
  IF v_caller IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  IF v_rule.store_id IS NOT NULL THEN
    IF NOT public.has_store_role_as(v_caller, v_rule.store_id, ARRAY['admin']) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;
  ELSE
    IF NOT public.is_admin_check(v_caller) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  END IF;
  UPDATE public.fin_rule_versions SET status = 'inactive', deactivated_at = now()
  WHERE id = p_rule_version_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('FIN_RULE_DEACTIVATED', 'fin_rule_versions', p_rule_version_id, v_rule.store_id, v_caller,
          jsonb_build_object('document_type', v_rule.document_type, 'version', v_rule.version));
  RETURN jsonb_build_object('status', 'success');
END $function$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. APERTURA FINANCIERA, BACKFILL Y REPROCESO
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Tipo documental interno para asientos de apertura
INSERT INTO public.fin_document_types (code, name, module, source_table, trigger_status, is_postable, is_active, sort_order, description)
VALUES ('APERTURA_FIN', 'Apertura financiera', 'Sistema', 'fin_opening_balances', NULL, false, true, 90,
        'Saldos iniciales autorizados. Genera asientos de apertura; no es un documento operativo.')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fin_apply_opening_balance(
  p_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ob public.fin_opening_balances%ROWTYPE;
  v_entry uuid; v_sense text; v_cat public.fin_categories%ROWTYPE;
  v_amount_cup numeric;
BEGIN
  SELECT * INTO v_ob FROM public.fin_opening_balances WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_OPENING_NOT_FOUND'; END IF;
  IF v_caller IS NULL OR NOT public.has_store_role_as(v_caller, v_ob.store_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_ob.status <> 'draft' THEN RAISE EXCEPTION 'ERR_OPENING_NOT_DRAFT (estado: %)', v_ob.status; END IF;
  SELECT * INTO v_cat FROM public.fin_categories WHERE code = v_ob.category_code;
  IF v_cat.clase IN ('activo', 'gasto') THEN v_sense := 'debito'; ELSE v_sense := 'credito'; END IF;
  v_amount_cup := round(CASE WHEN v_ob.currency = 'CUP' THEN v_ob.amount
                             ELSE v_ob.amount * v_ob.exchange_rate END, 2);
  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, economic_date,
    rule_version_id, description, created_by)
  VALUES (v_ob.store_id, 'APERTURA_FIN', NULL, 'APERTURA-' || v_ob.as_of_date, 'apertura',
          v_ob.as_of_date, NULL, 'Saldo inicial: ' || v_cat.name, v_caller)
  RETURNING id INTO v_entry;
  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, currency_origin, traza)
  VALUES (v_entry, v_ob.store_id, v_ob.category_code, v_sense, v_ob.amount,
          CASE WHEN v_ob.currency = 'CUP' THEN 'CUP' ELSE v_ob.currency END,
          CASE WHEN v_ob.currency = 'CUP' THEN 1 ELSE v_ob.exchange_rate END,
          v_ob.as_of_date, 'APERTURA-' || v_ob.as_of_date,
          'Saldo inicial: ' || v_cat.name, v_ob.currency,
          jsonb_build_object('origen', 'saldo_inicial'));
  UPDATE public.fin_opening_balances
  SET status = 'applied', applied_at = now(), entry_id = v_entry, authorized_by = v_caller
  WHERE id = p_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('FIN_OPENING_APPLIED', 'fin_opening_balances', p_id, v_ob.store_id, v_caller,
          jsonb_build_object('category', v_ob.category_code, 'amount_cup', v_amount_cup,
                             'as_of', v_ob.as_of_date));
  RETURN jsonb_build_object('status', 'success', 'entry_id', v_entry);
END $function$;

-- Reconstrucción controlada de históricos (dry_run por defecto).
CREATE OR REPLACE FUNCTION public.fin_backfill(
  p_store_id uuid, p_from date, p_to date,
  p_dry_run boolean DEFAULT true, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_res jsonb := '{}'::jsonb; v_d record; v_ok int := 0; v_err int := 0; v_pending int := 0;
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.has_store_role_as(v_caller, p_store_id, ARRAY['admin'])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  -- VENTA
  FOR v_d IN
    SELECT t.id, 'VENTA' AS dt FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND t.created_at::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'VENTA' AND e.document_id = t.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('VENTA', v_pending); v_pending := 0;
  -- DEVOLUCION_VENTA
  FOR v_d IN
    SELECT d.id, 'DEVOLUCION_VENTA' AS dt FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed'
      AND d.processed_at::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'DEVOLUCION_VENTA' AND e.document_id = d.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('DEVOLUCION_VENTA', v_pending); v_pending := 0;
  -- RECEPCION
  FOR v_d IN
    SELECT r.id, 'RECEPCION' AS dt FROM public.receipts r
    WHERE r.store_id = p_store_id AND r.status = 'active'
      AND r.reception_date::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'RECEPCION' AND e.document_id = r.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('RECEPCION', v_pending); v_pending := 0;
  -- SERVICIO_RECIBIDO
  FOR v_d IN
    SELECT s.id, 'SERVICIO_RECIBIDO' AS dt FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active'
      AND s.service_date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'SERVICIO_RECIBIDO' AND e.document_id = s.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('SERVICIO_RECIBIDO', v_pending); v_pending := 0;
  -- VALE_SALIDA
  FOR v_d IN
    SELECT i.id, 'VALE_SALIDA' AS dt FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed'
      AND i.created_at::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'VALE_SALIDA' AND e.document_id = i.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('VALE_SALIDA', v_pending); v_pending := 0;
  -- AJUSTE_INVENTARIO
  FOR v_d IN
    SELECT a.id, 'AJUSTE_INVENTARIO' AS dt FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed'
      AND a.confirmed_at::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'AJUSTE_INVENTARIO' AND e.document_id = a.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('AJUSTE_INVENTARIO', v_pending); v_pending := 0;
  -- COMISION (pago)
  FOR v_d IN
    SELECT c.id, 'COMISION' AS dt FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid'
      AND c.paid_at::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'COMISION' AND e.document_id = c.id AND e.event = 'pago')
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'pago', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('COMISION', v_pending); v_pending := 0;
  -- NOMINA (reconocimiento + pago)
  FOR v_d IN
    SELECT n.id, 'NOMINA' AS dt, n.status AS st FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
      AND n.period_end BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'NOMINA' AND e.document_id = n.id AND e.event = 'reconocimiento')
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document('NOMINA', v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  IF NOT p_dry_run THEN
    FOR v_d IN
      SELECT n.id FROM public.payrolls n
      WHERE n.store_id = p_store_id AND n.status = 'paid'
        AND n.period_end BETWEEN p_from AND p_to
        AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                        WHERE e.document_type = 'NOMINA' AND e.document_id = n.id AND e.event = 'pago')
    LOOP
      BEGIN
        PERFORM public.fin_post_document('NOMINA', v_d.id, 'pago', NULL, v_caller);
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END LOOP;
  END IF;
  v_res := v_res || jsonb_build_object('NOMINA', v_pending); v_pending := 0;
  -- FLUJO_CAJA
  FOR v_d IN
    SELECT f.id, 'FLUJO_CAJA' AS dt FROM public.cash_flow_documents f
    WHERE f.store_id = p_store_id AND f.status = 'confirmado'
      AND f.operation_date::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'FLUJO_CAJA' AND e.document_id = f.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'reconocimiento', NULL, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('FLUJO_CAJA', v_pending); v_pending := 0;
  -- Pagos posteriores de recepciones y servicios
  FOR v_d IN
    SELECT pt.ref_id AS id,
           CASE pt.ref_type WHEN 'receipt' THEN 'RECEPCION' ELSE 'SERVICIO_RECIBIDO' END AS dt,
           pt.id AS pay_id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type IN ('receipt', 'service')
      AND coalesce(pt.direction, 'in') = 'in'
      AND pt.payment_date::date BETWEEN p_from AND p_to
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = CASE pt.ref_type WHEN 'receipt' THEN 'RECEPCION' ELSE 'SERVICIO_RECIBIDO' END
                        AND e.document_id = pt.ref_id AND e.event = 'pago' AND e.payment_ref = pt.id)
  LOOP
    v_pending := v_pending + 1;
    IF NOT p_dry_run THEN
      BEGIN
        IF public.fin_post_document(v_d.dt, v_d.id, 'pago', v_d.pay_id, v_caller) IS NOT NULL
        THEN v_ok := v_ok + 1; END IF;
      EXCEPTION WHEN others THEN v_err := v_err + 1; END;
    END IF;
  END LOOP;
  v_res := v_res || jsonb_build_object('PAGOS', v_pending);
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('FIN_BACKFILL', 'fin_entries', NULL, p_store_id, v_caller,
          jsonb_build_object('from', p_from, 'to', p_to, 'dry_run', p_dry_run,
                             'pendientes', v_res, 'contabilizados', v_ok, 'errores', v_err));
  RETURN jsonb_build_object('dry_run', p_dry_run, 'pendientes_por_tipo', v_res,
                            'contabilizados', v_ok, 'errores', v_err);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_reprocess_posting_errors(
  p_store_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_e record; v_ok int := 0; v_fail int := 0;
BEGIN
  IF v_caller IS NULL OR NOT (public.is_admin_check(v_caller)
     OR public.has_store_role_as(v_caller, p_store_id, ARRAY['admin'])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  FOR v_e IN
    SELECT * FROM public.fin_posting_errors
    WHERE store_id = p_store_id AND resolved_at IS NULL
    ORDER BY created_at
    LIMIT 200
  LOOP
    BEGIN
      IF v_e.event = 'anulacion' THEN
        PERFORM public.fin_post_document_annulment(v_e.document_type, v_e.document_id);
      ELSE
        PERFORM public.fin_post_document(v_e.document_type, v_e.document_id, v_e.event, v_e.payment_ref, v_caller);
      END IF;
      UPDATE public.fin_posting_errors SET resolved_at = now() WHERE id = v_e.id;
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.fin_posting_errors
      SET attempts = attempts + 1, last_attempt_at = now(), error_detail = substr(SQLERRM, 1, 2000)
      WHERE id = v_e.id;
      v_fail := v_fail + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('resueltos', v_ok, 'fallidos', v_fail);
END $function$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- 10. INFORMES (misma fuente: fin_movements; sin cálculo duplicado en frontend)
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.fin_get_balance_sheet(
  p_store_id uuid, p_as_of date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_activos numeric := 0; v_pasivos numeric := 0; v_patrim numeric := 0;
  v_ing numeric := 0; v_gas numeric := 0;
  v_primer_doc date; v_primera_apertura date; v_resultado numeric;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'activo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'pasivo'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'patrimonio'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.clase = 'gasto'), 0)
    INTO v_rows, v_activos, v_pasivos, v_patrim, v_ing, v_gas
  FROM (
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) AS saldo,
           count(DISTINCT m.entry_id) AS movimientos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date <= p_as_of
    GROUP BY c.code, c.name, c.clase, c.grupo, c.sort_order
    HAVING round(CASE WHEN c.clase IN ('activo', 'gasto')
                 THEN sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END)
                 ELSE sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END)
               END, 2) <> 0
  ) s;

  v_resultado := round(v_ing - v_gas, 2);
  SELECT min(economic_date) INTO v_primer_doc
  FROM public.fin_entries WHERE store_id = p_store_id AND event <> 'apertura';
  SELECT min(economic_date) INTO v_primera_apertura
  FROM public.fin_entries WHERE store_id = p_store_id AND event = 'apertura';

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'categorias', v_rows,
    'total_activos', round(v_activos, 2),
    'total_pasivos', round(v_pasivos, 2),
    'patrimonio_movimientos', round(v_patrim, 2),
    'resultado_acumulado', v_resultado,
    'patrimonio_total', round(v_patrim + v_resultado, 2),
    'ecuacion', jsonb_build_object(
      'activos', round(v_activos, 2),
      'pasivos_mas_patrimonio', round(v_pasivos + v_patrim + v_resultado, 2),
      'diferencia', round(v_activos - (v_pasivos + v_patrim + v_resultado), 2),
      'equilibrado', abs(v_activos - (v_pasivos + v_patrim + v_resultado)) <= 0.01),
    'completitud', jsonb_build_object(
      'sin_apertura', v_primer_doc IS NOT NULL AND v_primera_apertura IS NULL,
      'apertura_tardia', v_primer_doc IS NOT NULL AND v_primera_apertura IS NOT NULL
                         AND v_primer_doc < v_primera_apertura,
      'primer_documento', v_primer_doc,
      'primera_apertura', v_primera_apertura));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_get_income_statement(
  p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb;
  v_ing_op numeric := 0; v_ing_aj numeric := 0; v_costo numeric := 0;
  v_gastos numeric := 0; v_ing_noop numeric := 0; v_gas_noop numeric := 0;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.sort_order), '[]'::jsonb),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ajuste_ingreso'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'costo_venta'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'ingreso_no_operacional'), 0),
         coalesce(sum(s.saldo) FILTER (WHERE s.grupo = 'gasto_no_operacional'), 0)
    INTO v_rows, v_ing_op, v_ing_aj, v_costo, v_gastos, v_ing_noop, v_gas_noop
  FROM (
    SELECT c.code, c.name, c.grupo, c.sort_order,
           round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) AS saldo,
           count(DISTINCT m.entry_id) AS documentos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase IN ('ingreso', 'gasto')
    GROUP BY c.code, c.name, c.grupo, c.sort_order
    HAVING round(sum(CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END), 2) <> 0
  ) s;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'categorias', v_rows,
    'ingresos_operacionales', round(v_ing_op, 2),
    'ajustes_ingresos', round(v_ing_aj, 2),
    'ingresos_netos', round(v_ing_op + v_ing_aj, 2),
    'costo_ventas', round(v_costo, 2),
    -- Los saldos de costo/gasto llegan NEGATIVOS (crédito−débito): se SUMAN
    -- con su signo — restarlos volvería a sumarlos (bug de signos corregido).
    'utilidad_bruta', round(v_ing_op + v_ing_aj + v_costo, 2),
    'gastos_operacionales', round(v_gastos, 2),
    'resultado_operativo', round(v_ing_op + v_ing_aj + v_costo + v_gastos, 2),
    'ingresos_no_operacionales', round(v_ing_noop, 2),
    'gastos_no_operacionales', round(v_gas_noop, 2),
    'resultado_neto', round(v_ing_op + v_ing_aj + v_costo + v_gastos + v_ing_noop + v_gas_noop, 2));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_get_dashboard(
  p_store_id uuid, p_from date, p_to date, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_ings numeric := 0; v_costo numeric := 0; v_gastos numeric := 0;
  v_efectivo_cup numeric := 0; v_efectivo_usd numeric := 0; v_bancos numeric := 0;
  v_cxc numeric := 0; v_cxp numeric := 0; v_nomina numeric := 0; v_retenc numeric := 0;
  v_inv numeric := 0; v_series jsonb; v_top jsonb;
  v_sin_cfg int; v_errores int; v_desbalance numeric;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Resultado del período
  SELECT
    coalesce(sum(CASE WHEN c.clase = 'ingreso'
      THEN CASE WHEN m.sense = 'credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.grupo = 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN c.clase = 'gasto' AND c.grupo <> 'costo_venta'
      THEN CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_ings, v_costo, v_gastos
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to;

  -- Saldos de balance a la fecha final
  SELECT
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_CUP' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_EFECTIVO_USD' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_BANCOS' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'ACT_CXC' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code IN ('PAS_CXP_PROV', 'PAS_SERV_PEND') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_NOMINA_PEND' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0),
    coalesce(sum(CASE WHEN m.category_code = 'PAS_RETENCIONES' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0)
    INTO v_efectivo_cup, v_efectivo_usd, v_bancos, v_cxc, v_cxp, v_nomina, v_retenc
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to;

  -- Valor de inventario (en vivo, del motor de valoración real)
  SELECT coalesce(round(sum(p.stock_current * coalesce(p.cost_average, 0)), 2), 0) INTO v_inv
  FROM public.products p WHERE p.store_id = p_store_id;

  -- Series mensuales
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.mes), '[]'::jsonb) INTO v_series
  FROM (
    SELECT to_char(date_trunc('month', m.economic_date), 'YYYY-MM') AS mes,
           round(sum(CASE WHEN c.clase = 'ingreso' THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS ingresos,
           round(sum(CASE WHEN c.clase = 'gasto' THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 2) AS gastos
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
    GROUP BY 1
  ) s;

  -- Top gastos
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.total DESC), '[]'::jsonb) INTO v_top
  FROM (
    SELECT c.code, c.name, round(sum(m.amount_cup), 2) AS total
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    JOIN public.fin_categories c ON c.code = m.category_code
    WHERE m.store_id = p_store_id AND m.economic_date BETWEEN p_from AND p_to
      AND c.clase = 'gasto' AND m.sense = 'debito'
    GROUP BY c.code, c.name
    HAVING sum(m.amount_cup) > 0
    LIMIT 8
  ) s;

  SELECT count(*) INTO v_sin_cfg
  FROM public.fin_document_types dt
  WHERE dt.is_postable AND dt.is_active AND NOT EXISTS (
    SELECT 1 FROM public.fin_rule_versions rv
    WHERE rv.document_type = dt.code AND rv.status = 'active'
      AND (rv.store_id = p_store_id OR rv.store_id IS NULL));
  SELECT count(*) INTO v_errores
  FROM public.fin_posting_errors WHERE store_id = p_store_id AND resolved_at IS NULL;

  SELECT coalesce(round(sum(
    CASE WHEN c.clase IN ('activo') THEN CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0), 0)
    - coalesce(round(sum(
    CASE WHEN c.clase IN ('pasivo', 'patrimonio', 'ingreso') THEN CASE WHEN m.sense='credito' THEN m.amount_cup ELSE -m.amount_cup END ELSE 0 END), 0), 0)
    INTO v_desbalance
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  JOIN public.fin_categories c ON c.code = m.category_code
  WHERE m.store_id = p_store_id AND m.economic_date <= p_to;

  RETURN jsonb_build_object(
    'desde', p_from, 'hasta', p_to,
    'kpis', jsonb_build_object(
      'ingresos', round(v_ings, 2), 'costo_ventas', round(v_costo, 2),
      'gastos', round(v_gastos, 2),
      'utilidad_bruta', round(v_ings - v_costo, 2),
      'resultado_neto', round(v_ings - v_costo - v_gastos, 2),
      'efectivo_cup', round(v_efectivo_cup, 2), 'efectivo_usd', round(v_efectivo_usd, 2),
      'bancos', round(v_bancos, 2),
      'cuentas_por_cobrar', round(v_cxc, 2), 'cuentas_por_pagar', round(v_cxp, 2),
      'nomina_pendiente', round(v_nomina, 2), 'retenciones_pendientes', round(v_retenc, 2),
      'inventario_valor', v_inv),
    'series_mensuales', v_series,
    'top_gastos', v_top,
    'alertas', jsonb_build_object(
      'gastos_mayores_que_ingresos', v_gastos + v_costo > v_ings AND v_ings > 0,
      'desequilibrio_balance', abs(v_desbalance) > 0.01,
      'desequilibrio_monto', round(v_desbalance, 2),
      'tipos_sin_configurar', v_sin_cfg,
      'errores_contabilizacion', v_errores));
END $function$;

CREATE OR REPLACE FUNCTION public.fin_get_category_detail(
  p_store_id uuid, p_category text, p_from date, p_to date,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows jsonb; v_total int;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  SELECT count(*) INTO v_total
  FROM public.fin_movements m JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE m.store_id = p_store_id AND m.category_code = p_category
    AND m.economic_date BETWEEN p_from AND p_to;
  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.economic_date DESC, s.posted_at DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT m.id, m.entry_id, e.document_type, e.document_id, m.document_number,
           m.economic_date, e.event, m.sense, m.amount, m.amount_cup,
           m.currency_origin, m.description, e.posted_at
    FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    WHERE m.store_id = p_store_id AND m.category_code = p_category
      AND m.economic_date BETWEEN p_from AND p_to
    ORDER BY m.economic_date DESC, e.posted_at DESC
    LIMIT greatest(coalesce(p_limit, 50), 1) OFFSET greatest(coalesce(p_offset, 0), 0)
  ) s;
  RETURN jsonb_build_object('categoria', p_category, 'total', v_total,
                            'desde', p_from, 'hasta', p_to, 'movimientos', v_rows);
END $function$;

CREATE OR REPLACE FUNCTION public.fin_get_document_types_status(
  p_store_id uuid, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(s) ORDER BY s.sort_order)
    FROM (
      SELECT dt.code, dt.name, dt.module, dt.source_table, dt.description,
             dt.trigger_status, dt.is_postable, dt.sort_order,
             (rv.id IS NOT NULL) AS configurado,
             rv.id AS rule_version_id, rv.version, rv.movements, rv.effective_from,
             (SELECT count(*) FROM public.fin_entries e
              WHERE e.document_type = dt.code AND e.store_id = p_store_id) AS asientos,
             (SELECT count(*) FROM public.fin_posting_errors pe
              WHERE pe.document_type = dt.code AND pe.store_id = p_store_id
                AND pe.resolved_at IS NULL) AS errores
      FROM public.fin_document_types dt
      LEFT JOIN public.fin_rule_versions rv
        ON rv.document_type = dt.code AND rv.status = 'active'
       AND rv.effective_from <= CURRENT_DATE
       AND (rv.store_id = p_store_id
            OR (rv.store_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM public.fin_rule_versions x
                  WHERE x.document_type = dt.code AND x.status = 'active'
                    AND x.store_id = p_store_id)))
      WHERE dt.is_active
    ) s
  ), '[]'::jsonb);
END $function$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- 11. GRANTS ENDURECIDOS (motor interno NO ejecutable por clientes)
-- ══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION
  public.fin_resolve_rule(text, uuid),
  public.fin_eval_condition(jsonb, jsonb),
  public.fin_compute_metrics(text, uuid, text, uuid),
  public.fin_apply_templates(jsonb, text, jsonb),
  public.fin_post_document(text, uuid, text, uuid, uuid),
  public.fin_post_document_safe(text, uuid, text, uuid),
  public.fin_post_document_annulment(text, uuid),
  public.fin_post_annulment_safe(text, uuid),
  public.fin_validate_rule_movements(jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.fin_simulate(text, uuid, jsonb, jsonb, uuid),
  public.fin_activate_rule_version(uuid, uuid),
  public.fin_deactivate_rule_version(uuid, uuid),
  public.fin_apply_opening_balance(uuid, uuid),
  public.fin_backfill(uuid, date, date, boolean, uuid),
  public.fin_reprocess_posting_errors(uuid, uuid),
  public.fin_get_balance_sheet(uuid, date, uuid),
  public.fin_get_income_statement(uuid, date, date, uuid),
  public.fin_get_dashboard(uuid, date, date, uuid),
  public.fin_get_category_detail(uuid, text, date, date, integer, integer, uuid),
  public.fin_get_document_types_status(uuid, uuid)
TO authenticated;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.triggers
  WHERE trigger_name LIKE 'fin_trg_%';
  IF v_n < 10 THEN RAISE EXCEPTION 'CP-FIN motor: triggers de contabilización incompletos (%)', v_n; END IF;
  RAISE NOTICE 'CP-FIN motor OK: % triggers activos', v_n;
END $$;
