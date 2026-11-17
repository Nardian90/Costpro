-- ═══════════════════════════════════════════════════════════════════════════
-- 20261118120000_cp_fin_015_opening_cash_usd.sql
-- MISIÓN CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 (2026-11-18)
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (expediente docs/audits/cp-fin-opening-balances-cash-reconciliation-015/):
--   · El saldo negativo de «Efectivo en caja (USD)» (−184.120,00 CUP) NO se
--     corrige anulando el egreso IE-000002-2026 (367 USD entregados a Belkis
--     «para ingresar al banco»): es una operación real, confirmada y trazada.
--   · El cajón USD recibió 150 (venta 68e7464d, 10-17) + 207 (venta 28e94349,
--     10-19) + 10 (venta 23ccd04f, 10-23) = 367 USD, EXACTAMENTE lo entregado.
--     El motor no lo vio porque el cobro a nivel de venta quedó clasificado
--     CUP (68e7464d, 23ccd04f) o la venta no llegó a contabilizarse
--     (28e94349: cobros 169.670 ≠ total 177.770 y el motor no tiene línea de
--     diferencia de cobro).
--   · Los egresos «entrega_efectivo» (CUP y USD) se contabilizaron como gasto
--     (GAS_OTROS_OPER) cuando son entrega del efectivo acumulado para
--     depósito bancario (definición del propio concepto del módulo de caja):
--     activo pendiente, no gasto.
--   · fin_opening_balances VACÍO: ENERVIDA arrancó el 01-07-2026 sin saldos
--     preexistentes (0 ventas/pagos/flujo de caja/recepciones antes del
--     01-07) → apertura en cero, que la tabla no podía representar (CHECK
--     amount > 0).
--
-- CONTENIDO (mecanismo estándar del repo: CREATE OR REPLACE + versiones):
--   1. fin_compute_metrics: VENTA replica el modelo físico de caja
--      (settlement + carve de ítems, misma fuente que get_cash_currency_summary)
--      SOLO cuando no hay pagos USD registrados a nivel de venta (evita doble
--      conteo); añade métricas cob_total_cup / diferencia_cobro_debe_cup /
--      diferencia_cobro_haber_cup.
--   2. fin_rule_versions: VENTA v2 (línea de diferencia de cobro en
--      ING_DESCUENTOS) y FLUJO_CAJA v2 (entrega_efectivo → ACT_OTROS_CORR;
--      otros egresos siguen → GAS_OTROS_OPER). v1 → inactive.
--   3. fin_apply_opening_balance: admite la DECLARACIÓN DE APERTURA EN CERO
--      (amount=0 → asiento event='apertura' SIN movimientos, trazable).
--   4. fin_opening_balances: CHECK amount >= 0 (el 0 solo tiene sentido como
--      declaración documentada; el API exige notas que justifiquen la fuente).
--
-- SIN cambios de datos: las correcciones contables (RECT-015-A/B/C/D y la
-- declaración de apertura) se ejecutan por el mecanismo gobernado de la
-- misión (scripts m108 E2E → m109 producción), no por esta migración.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fin_compute_metrics — VENTA: modelo físico de caja + diferencia de cobro
--    (BASE = cuerpo VIVO de producción tras los fixes 20261113120400 /
--    20261113120800 / 20261114120000 / 20261114140000; la extensión M-015
--    añade fallback físico de caja y métricas de diferencia de cobro)
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_txt text; v_num numeric; -- añadidos por 20261113120400 (tipos texto/numérico para FLUJO_CAJA/NOMINA)
  v_missing_txt text;
  -- M-015: componentes del modelo físico de caja (carve de ítems / settlement)
  v_fb_usd_settle numeric; v_fb_settle_cup numeric;
  v_fb_usd_items numeric; v_fb_carve_cup numeric;
  v_fb_cash_amount numeric; v_fb_usd_nom numeric;
  v_fb_usd_cup numeric; v_fb_cup_cash numeric;
  v_fb_otras_cob numeric;
  v_total_cob numeric;
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
    -- FIX SEMÁNTICA 20261114120000: total_amount de una VENTA ya es CUP-equivalente
    -- (create_sale_v2 / sale-currency.ts: total_amount = Σ price_at_sale_cup y
    -- balance = total_amount − Σ pagos.amountCUP; evidencia: en las 131 ventas USD
    -- de ENERVIDA, total_amount == Σ amount_cup de sus pagos EXACTO). El motor NO
    -- debe volver a multiplicar por la tasa (era doble conversión).
    v_total_cup := round(coalesce(v_amt, 0), 2);
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
      -- 20261113120400: para CUP el sufijo de moneda NO se añade (catálogo:
      -- cob_cash_cup / cob_transfer_cup; USD sí: cob_cash_usd_cup / cob_zelle_usd_cup)
      v := jsonb_set(v, ARRAY['cob_' || r.metodo ||
                     CASE WHEN lower(coalesce(r.moneda, 'cup')) = 'cup' THEN ''
                          ELSE '_' || lower(r.moneda) END || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
    END LOOP;

    -- ── M-015: modelo físico de caja (carve/settlement) ─────────────────────
    -- Misma fuente que get_cash_currency_summary (el sub-ledger físico de la
    -- caja): settlement explícito de la venta (precedencia) y carve de ítems
    -- con cobro USD a nivel de ítem. SOLO aplica cuando el cobro de la venta
    -- no tiene NINGÚN pago USD a nivel de venta (si lo tiene, las dos fuentes
    -- ya coinciden en las ventas verificadas del expediente 015 y no se toca).
    IF coalesce((v ->> 'cob_cash_usd_cup')::numeric, 0) = 0 THEN
      SELECT coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0),
             coalesce(t.cash_received_cup, 0) - coalesce(t.change_given_cup, 0),
             coalesce(t.cash_amount, 0)
        INTO v_fb_usd_settle, v_fb_settle_cup, v_fb_cash_amount
        FROM public.transactions t WHERE t.id = p_document_id;
      SELECT coalesce(sum(ti.cash_paid), 0),
             coalesce(sum(ti.cash_paid * ti.exchange_rate), 0)
        INTO v_fb_usd_items, v_fb_carve_cup
        FROM public.transaction_items ti
        WHERE ti.transaction_id = p_document_id
          AND ti.cash_currency = 'USD' AND ti.currency = 'USD'
          AND coalesce(ti.cash_paid, 0) > 0;
      IF coalesce(v_fb_usd_settle, 0) > 0 THEN
        -- Settlement explícito (precedencia caja): los billetes USD de la venta
        -- son los recibidos según el settlement; su valor CUP contable es el
        -- resto del total no cubierto por CUP ni por cobros no-efectivo.
        v_fb_usd_nom := v_fb_usd_settle;
        v_fb_otras_cob := round(coalesce((v ->> 'cob_transfer_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_transfer_usd_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_zelle_usd_cup')::numeric, 0), 2);
        v_fb_usd_cup := round(v_total_cup - coalesce(v_fb_settle_cup, 0) - v_fb_otras_cob, 2);
        v_fb_cup_cash := round(coalesce(v_fb_settle_cup, 0), 2);
      ELSIF coalesce(v_fb_usd_items, 0) > 0 THEN
        -- Carve de ítems (modelo legacy v2.24 de caja): billetes USD registrados
        -- a nivel de ítem; el CUP real es el efectivo de la venta menos el carve.
        v_fb_usd_nom := v_fb_usd_items;
        v_fb_usd_cup := round(coalesce(v_fb_carve_cup, 0), 2);
        v_fb_cup_cash := greatest(round(coalesce(v_fb_cash_amount, v_total_cup), 2) - v_fb_usd_cup, 0);
      END IF;
      IF coalesce(v_fb_usd_nom, 0) > 0 THEN
        v := jsonb_set(v, ARRAY['cob_cash_cup'], to_jsonb(coalesce(v_fb_cup_cash, 0)));
        v := jsonb_set(v, ARRAY['cob_cash_usd_cup'], to_jsonb(coalesce(v_fb_usd_cup, 0)));
        v := v || jsonb_build_object(
          'efectivo_fisico_usd', coalesce(v_fb_usd_nom, 0),
          'fuente_efectivo', CASE WHEN coalesce(v_fb_usd_settle, 0) > 0
                                  THEN 'settlement' ELSE 'carve_items' END);
      END IF;
    END IF;

    -- ── M-015: diferencia de cobro (descuentos/recargos aceptados por caja) ─
    -- total − cobros: > 0 = faltante aceptado (débito ING_DESCUENTOS);
    -- < 0 = exceso aceptado (crédito ING_DESCUENTOS). El motor no podía
    -- contabilizar ventas con descuadre (ERR_UNBALANCED): con esta línea quedan
    -- representadas las diferencias aceptadas y documentadas en payment_incidents.
    v_total_cob := round(coalesce((v ->> 'cob_cash_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_cash_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_zelle_usd_cup')::numeric, 0), 2);
    v := v || jsonb_build_object(
      'cob_total_cup', v_total_cob,
      'diferencia_cobro_debe_cup', round(greatest(v_total_cup - v_total_cob, 0), 2),
      'diferencia_cobro_haber_cup', round(greatest(v_total_cob - v_total_cup, 0), 2));

  WHEN 'DEVOLUCION_VENTA' THEN
    SELECT d.store_id, d.devolution_number, d.processed_at::date, d.status,
           d.currency, d.exchange_rate, d.total_amount
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt
    FROM public.devolutions d WHERE d.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: devolución %', p_document_id; END IF;
    -- 20261114140000 (ciclo divisa): total_amount de una DEVOLUCIÓN ya es el total
    -- canónico CUP (create_devolution_v2: Σ qty × price_at_sale_cup; la divisa real
    -- del reembolso vive en las filas de payment_transactions y en v_rate_sale).
    -- Multiplicar por la tasa era doble conversión — el MISMO defecto que VENTA
    -- (PR #1615): un doc de devolución marcado en divisa inflaba total_cup y el
    -- asiento caía en ERR_UNBALANCED.
    v_total_cup := round(coalesce(v_amt, 0), 2);
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
      -- 20261113120400: para CUP el sufijo de moneda NO se añade (catálogo:
      -- reembolso_cash_cup / reembolso_transfer_cup)
      v := jsonb_set(v, ARRAY['reembolso_' || r.metodo ||
                     CASE WHEN lower(coalesce(r.moneda, 'cup')) = 'cup' THEN ''
                          ELSE '_' || lower(r.moneda) END || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
    END LOOP;
    -- 20261114140000 (ciclo divisa): store_credit_ledger.amount es canónico CUP
    -- (create_devolution_v2 lo emite como v_total); la ×tasa era doble conversión.
    SELECT coalesce(sum(scl.amount), 0)
      INTO v_amt
    FROM public.store_credit_ledger scl WHERE scl.devolution_id = p_document_id;
    v := jsonb_set(v, ARRAY['store_credit_cup'], to_jsonb(round(v_amt, 2)));

  WHEN 'RECEPCION' THEN
    -- 20261113120400: el alias «r» colisionaba con la variable record «r» de
    -- los bucles FOR (VENTA/DEVOLUCIÓN) → 55000 «record "r" is not assigned
    -- yet» al computar métricas de CUALQUIER recepción. Alias renombrado a rc.
    SELECT rc.store_id, rc.document_number, rc.reception_date::date, rc.status
      INTO v_store, v_docnum, v_date, v_status
    FROM public.receipts rc WHERE rc.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: recepción %', p_document_id; END IF;
    -- 20261113120400: receipt_items NO tiene unit_cost_cup (columna inexistente
    -- que hacía crashear toda contabilización de recepciones). El valor CUP se
    -- deriva: unit_cost (moneda de recepción) × tasa_cambio_recepcion (RPC
    -- register_reception: v_unit_cost_cup := v_unit_cost * v_tasa).
    SELECT coalesce(sum(ri.quantity * ri.unit_cost
                 * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0) INTO v_total_cup
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
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_amt, v_total_cup, v_cogs, v_num, v_missing_txt
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
        'total_social_cup', round(coalesce(v_num, 0), 2),
        'metodo_pago', v_missing_txt);
    ELSE
      RAISE EXCEPTION 'ERR_PAYROLL_CURRENCY_NOT_SUPPORTED: nómina % en % (solo CUP soportado; documentado en el expediente)', p_document_id, v_cur;
    END IF;

  WHEN 'FLUJO_CAJA' THEN
    SELECT f.store_id, f.id::text, f.operation_date::date, f.status,
           f.currency, f.doc_type, f.concept, f.amount_cup
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_missing_txt, v_txt, v_total_cup
    FROM public.cash_flow_documents f WHERE f.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: flujo de caja %', p_document_id; END IF;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Movimiento de caja (' || coalesce(v_missing_txt, '') || ')',
      'importe_cup', round(coalesce(v_total_cup, 0), 2),
      'tipo_documento', v_missing_txt, 'concepto', v_txt);

  ELSE
    RAISE EXCEPTION 'ERR_DOCTYPE_NOT_SUPPORTED: %', p_doctype;
  END CASE;

  IF (v ->> 'store_id') IS NULL OR (v ->> 'economic_date') IS NULL THEN
    RAISE EXCEPTION 'ERR_METRICS_INCOMPLETE: % %', p_doctype, p_document_id;
  END IF;
  RETURN v;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. REGLAS v2 — VENTA (diferencia de cobro) y FLUJO_CAJA (entrega_efectivo)
--    v1 → inactive; v2 global activa (fin_resolve_rule exige UNA activa).
--    IDEMPOTENTE (M-015 §reanudación): el índice fin_rule_versions_scope_version_key
--    no dispara ON CONFLICT con store_id NULL (NULLs distintos en btree), por lo que
--    una re-aplicación crearía duplicados; se filtra version < 2 en la desactivación
--    y se inserta solo si NO existe ya una v2 global activa (uq_fin_rules_one_active).
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.fin_rule_versions SET status = 'inactive', deactivated_at = now()
WHERE document_type IN ('VENTA', 'FLUJO_CAJA') AND status = 'active' AND store_id IS NULL
  AND version < 2;

INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
SELECT v.document_type, v.store_id, v.version, v.status, v.movements, v.effective_from, v.notes
FROM (VALUES
-- VENTA v2: idéntica a v1 + líneas de diferencia de cobro (ING_DESCUENTOS)
('VENTA', NULL::uuid, 2, 'active', '[
  {"id":"v-cash-cup","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_cup"},"condicion":{"campo":"cob_cash_cup","op":">","valor":0},"orden":1},
  {"id":"v-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_usd_cup"},"condicion":{"campo":"cob_cash_usd_cup","op":">","valor":0},"orden":2},
  {"id":"v-transf-cup","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_cup"},"condicion":{"campo":"cob_transfer_cup","op":">","valor":0},"orden":3},
  {"id":"v-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_usd_cup"},"condicion":{"campo":"cob_transfer_usd_cup","op":">","valor":0},"orden":4},
  {"id":"v-zelle","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_zelle_usd_cup"},"condicion":{"campo":"cob_zelle_usd_cup","op":">","valor":0},"orden":5},
  {"id":"v-ingreso","evento":"reconocimiento","categoria":"ING_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":6},
  {"id":"v-cogs-d","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":7},
  {"id":"v-cogs-c","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":8},
  {"id":"v-diff-d","evento":"reconocimiento","categoria":"ING_DESCUENTOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"diferencia_cobro_debe_cup"},"condicion":{"campo":"diferencia_cobro_debe_cup","op":">","valor":0},"orden":9},
  {"id":"v-diff-c","evento":"reconocimiento","categoria":"ING_DESCUENTOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"diferencia_cobro_haber_cup"},"condicion":{"campo":"diferencia_cobro_haber_cup","op":">","valor":0},"orden":10}
]'::jsonb, CURRENT_DATE,
'M-015: líneas de diferencia de cobro (faltante/exceso aceptado por caja, documentado en payment_incidents) para que las ventas con descuadre puedan contabilizarse equilibradas. Sin cambios para ventas cuyos cobros cuadran.'),
-- FLUJO_CAJA v2: entrega_efectivo → ACT_OTROS_CORR (entrega de efectivo para
-- depósito, pendiente de conciliación bancaria — NO es gasto); otros egresos
-- siguen → GAS_OTROS_OPER. Ingresos sin cambios.
('FLUJO_CAJA', NULL::uuid, 2, 'active', '[
  {"id":"fc-eg-d","evento":"reconocimiento","categoria":"GAS_OTROS_OPER","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"egreso"},{"campo":"concepto","op":"!=","valor":"entrega_efectivo"}],"orden":1},
  {"id":"fc-entrega-d","evento":"reconocimiento","categoria":"ACT_OTROS_CORR","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"egreso"},{"campo":"concepto","op":"=","valor":"entrega_efectivo"}],"orden":2},
  {"id":"fc-eg-cup-c","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"egreso"},{"campo":"moneda_documento","op":"=","valor":"CUP"}],"orden":3},
  {"id":"fc-eg-usd-c","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"egreso"},{"campo":"moneda_documento","op":"=","valor":"USD"}],"orden":4},
  {"id":"fc-in-cup-d","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"ingreso"},{"campo":"moneda_documento","op":"=","valor":"CUP"}],"orden":5},
  {"id":"fc-in-usd-d","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"debito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":[{"campo":"tipo_documento","op":"=","valor":"ingreso"},{"campo":"moneda_documento","op":"=","valor":"USD"}],"orden":6},
  {"id":"fc-in-c","evento":"reconocimiento","categoria":"ING_OTROS_OPER","sentido":"credito","origen":{"tipo":"metrica","metrica":"importe_cup"},"condicion":{"campo":"tipo_documento","op":"=","valor":"ingreso"},"orden":7}
]'::jsonb, CURRENT_DATE,
'M-015: entrega_efectivo (entrega del efectivo acumulado para depósito bancario) contabiliza como ACTIVO pendiente (ACT_OTROS_CORR) y no como gasto; el resto de egresos ordinarios conserva GAS_OTROS_OPER.')
) AS v(document_type, store_id, version, status, movements, effective_from, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_rule_versions r
  WHERE r.document_type = v.document_type AND r.store_id IS NULL
    AND r.version = 2 AND r.status = 'active'
)
ON CONFLICT (document_type, store_id, version) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2b. Catálogo de métricas para el constructor de la Vista A (m-015)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event) VALUES
  ('VENTA', 'cob_total_cup', 'Total cobrado por todos los métodos (CUP)', 'CUP', 'reconocimiento'),
  ('VENTA', 'diferencia_cobro_debe_cup', 'Faltante de cobro aceptado (CUP)', 'CUP', 'reconocimiento'),
  ('VENTA', 'diferencia_cobro_haber_cup', 'Exceso de cobro aceptado (CUP)', 'CUP', 'reconocimiento'),
  ('VENTA', 'efectivo_fisico_usd', 'Billetes USD físicos del cobro (modelo de caja)', 'USD', 'reconocimiento')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DECLARACIÓN DE APERTURA EN CERO — fin_apply_opening_balance admite
--    amount=0: asiento event='apertura' SIN movimientos (verificación
--    documentada de que no existían saldos preexistentes; nunca inventa valor).
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_amount_cup := round(CASE WHEN v_ob.currency = 'CUP' THEN v_ob.amount
                             ELSE v_ob.amount * v_ob.exchange_rate END, 2);

  IF v_ob.amount = 0 THEN
    -- M-015 · Declaración de apertura en cero: documenta la VERIFICACIÓN de
    -- que la cuenta no tenía saldo al corte (sin inventar importes). El
    -- asiento no lleva movimientos: no altera saldos ni ecuación contable.
    IF NULLIF(btrim(coalesce(v_ob.notes, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ERR_OPENING_ZERO_NEEDS_NOTES: la declaración en cero exige justificación/documento de verificación';
    END IF;
    INSERT INTO public.fin_entries (
      store_id, document_type, document_id, document_number, event, economic_date,
      rule_version_id, description, created_by)
    VALUES (v_ob.store_id, 'APERTURA_FIN', NULL, 'APERTURA-' || v_ob.as_of_date, 'apertura',
            v_ob.as_of_date, NULL,
            'Declaración de apertura en cero: ' || v_cat.name, v_caller)
    RETURNING id INTO v_entry;
    UPDATE public.fin_opening_balances
    SET status = 'applied', applied_at = now(), entry_id = v_entry, authorized_by = v_caller
    WHERE id = p_id;
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('FIN_OPENING_APPLIED_ZERO', 'fin_opening_balances', p_id, v_ob.store_id, v_caller,
            jsonb_build_object('category', v_ob.category_code, 'amount_cup', 0,
                               'as_of', v_ob.as_of_date, 'cero_documentado', true,
                               'notas', v_ob.notes));
    RETURN jsonb_build_object('status', 'success', 'entry_id', v_entry, 'cero', true);
  END IF;

  IF v_cat.clase IN ('activo', 'gasto') THEN v_sense := 'debito'; ELSE v_sense := 'credito'; END IF;
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CHECK amount >= 0 (el 0 solo como declaración documentada; el API exige
--    notas en ese caso y el RPC exige notas al aplicar un cero).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.fin_opening_balances
  DROP CONSTRAINT fin_opening_balances_amount_check;
ALTER TABLE public.fin_opening_balances
  ADD CONSTRAINT fin_opening_balances_amount_check CHECK ((amount >= (0)::numeric));

-- 4b. Inmutabilidad del saldo YA CONTABILIZADO (M-015 §13): un saldo aplicado
--     no se edita silenciosamente; correcciones solo vía documento correctivo
--     trazable. La auditoría y el asiento de apertura deben permanecer fieles.
CREATE OR REPLACE FUNCTION public.fin_opening_guard_applied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.status = 'applied' AND (
    NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.category_code IS DISTINCT FROM OLD.category_code
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.as_of_date IS DISTINCT FROM OLD.as_of_date
    OR NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.entry_id IS DISTINCT FROM OLD.entry_id
    OR (NEW.status = 'voided')
  ) THEN
    RAISE EXCEPTION 'ERR_OPENING_APPLIED_IMMUTABLE: el saldo inicial % ya fue contabilizado; usa un documento correctivo trazable', OLD.id;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS fin_opening_applied_guard ON public.fin_opening_balances;
CREATE TRIGGER fin_opening_applied_guard
  BEFORE UPDATE ON public.fin_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.fin_opening_guard_applied();

COMMENT ON FUNCTION public.fin_apply_opening_balance(uuid, uuid) IS
  'CP-FIN 015: aplica un saldo inicial (asiento de apertura). amount=0 = '
  'declaración de apertura en cero (asiento sin movimientos, exige notas). '
  'Nunca inventa importes ni usa aperturas ficticias para cuadrar.';
