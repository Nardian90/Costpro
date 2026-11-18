-- ============================================================================
-- CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 (parte B)
-- Rectificador canónico de medio de cobro · Backfill autorizado de
-- amount_origin · Origen de importes para FLUJO_CAJA
-- Fecha: 2026-11-19 · Autor: misión CP-FIN-001 (autorización expresa del
-- propietario: §6 rectificación e2614f36 zelle→cash; §12 backfill 538).
--
-- Esta migración COMPLETA a 20261118130000_cp_fin_fs_origin_traceability.sql
-- (que corrige el motor VENTA y la presentación). Contiene:
--   1. fin_compute_metrics v3: FLUJO_CAJA expone importe_cup_origin y
--      tasa_documento (nominal registrado del documento de caja).
--   2. fin_rectify_sale_payment_method: escritor canónico de rectificación
--      de medio de cobro (idempotente, fail-closed, patrón RECT-015).
--   3. Catálogo de métricas: importe_cup_origin (FLUJO_CAJA).
--   4. Backfill idempotente de amount_origin (universo auditado: 538
--      movimientos USD de ENERVIDA; 233 reconstruibles con evidencia exacta,
--      305 quedan NULL documentados — sin invención, §12).
--   5. Guardas fail-closed.
--
-- Reglas de la misión respetadas: no se modifican importes contables
-- históricos (amount/amount_cup intactos), ni ingresos, ni COGS, ni
-- inventario, ni saldos; el backfill SOLO completa la columna de
-- presentación amount_origin cuando la fuente primaria lo determina.
-- ============================================================================

BEGIN;

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
  -- CP-FIN-001: importe original del documento y su ID real (fallback descripción)
  v_id uuid; v_total_origin numeric;
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
           t.sale_currency, t.sale_exchange_rate, t.total_amount, t.id
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_rate, v_amt, v_id
    FROM public.transactions t WHERE t.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: transacción %', p_document_id; END IF;
    -- FIX SEMÁNTICA 20261114120000: total_amount de una VENTA ya es CUP-equivalente
    -- (create_sale_v2 / sale-currency.ts: total_amount = Σ price_at_sale_cup y
    -- balance = total_amount − Σ pagos.amountCUP; evidencia: en las 131 ventas USD
    -- de ENERVIDA, total_amount == Σ amount_cup de sus pagos EXACTO). El motor NO
    -- debe volver a multiplicar por la tasa (era doble conversión).
    v_total_cup := round(coalesce(v_amt, 0), 2);
    -- CP-FIN-001 (§4): importe ORIGINAL de la venta en su moneda documental y
    -- tasa REGISTRADA. Fuente: transaction_items.price_at_sale con
    -- price_currency = moneda del documento (los importes por ítem que el
    -- POS registró en la venta). Si no hay datos suficientes queda NULL:
    -- el motor JAMÁS reconstruye tasas ni importes derivados (misión §4).
    v_total_origin := NULL;
    IF coalesce(v_cur, 'CUP') <> 'CUP' THEN
      SELECT coalesce(sum(ti.quantity * ti.price_at_sale), 0) INTO v_total_origin
      FROM public.transaction_items ti
      WHERE ti.transaction_id = p_document_id
        AND ti.price_currency = v_cur;
      IF coalesce(v_total_origin, 0) <= 0 THEN v_total_origin := NULL; END IF;
    END IF;
    SELECT coalesce(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 0),
           count(*) FILTER (WHERE coalesce(ti.cost_at_sale, 0) = 0)
      INTO v_cogs, v_missing
    FROM public.transaction_items ti
    LEFT JOIN public.products p ON p.id = ti.product_id
    WHERE ti.transaction_id = p_document_id;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Venta ' || coalesce(v_docnum, substr(v_id::text, 1, 8)),
      'total_cup', v_total_cup, 'costo_productos_cup', round(v_cogs, 2),
      'lineas_sin_costo', v_missing,
      -- CP-FIN-001: contraparte _origin del propio nombre de métrica
      -- (fin_apply_templates resuelve <metrica>_origin de forma genérica)
      'total_cup_origin', v_total_origin,
      'tasa_documento', CASE WHEN coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_rate, 0) > 0
                             THEN v_rate ELSE NULL END,
      'cob_cash_cup', 0, 'cob_cash_usd_cup', 0,
      'cob_transfer_cup', 0, 'cob_transfer_usd_cup', 0, 'cob_zelle_usd_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup,
             sum(pt.amount) FILTER (WHERE pt.currency <> 'CUP') AS origin
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
      -- CP-FIN-001: nominal ORIGINAL cobrado por método en SU moneda
      -- (payment_transactions.amount registrado en la moneda del cobro).
      -- Nombre = contraparte _origin de la métrica CUP (cob_cash_usd_cup →
      -- cob_cash_usd_cup_origin); solo para cobros en moneda ≠ CUP.
      IF lower(coalesce(r.moneda, 'cup')) <> 'cup' AND coalesce(r.origin, 0) > 0 THEN
        v := jsonb_set(v, ARRAY['cob_' || r.metodo || '_' || lower(r.moneda) || '_cup_origin'],
                       to_jsonb(round(r.origin, 2)));
      END IF;
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
           f.currency, f.doc_type, f.concept, f.amount_cup, f.amount, f.exchange_rate
      INTO v_store, v_docnum, v_date, v_status, v_cur, v_missing_txt, v_txt, v_total_cup, v_amt, v_rate
    FROM public.cash_flow_documents f WHERE f.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: flujo de caja %', p_document_id; END IF;
    -- CP-FIN-001 §7 (2026-11-19): contraparte _origin para FLUJO_CAJA en
    -- moneda extranjera: el NOMINAL registrado del documento
    -- (cash_flow_documents.amount) y su tasa REGISTRADA. CUP → NULL
    -- (sin conversión inventada). Las plantillas fc-* consumen importe_cup,
    -- por lo que fin_apply_templates resuelve importe_cup_origin de forma
    -- genérica y los movimientos de caja futuros llevan su original.
    v_total_origin := NULL;
    IF coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_amt, 0) > 0 THEN
      v_total_origin := round(v_amt, 2);
    END IF;
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', v_cur,
      'descripcion_documento', 'Movimiento de caja (' || coalesce(v_missing_txt, '') || ')',
      'importe_cup', round(coalesce(v_total_cup, 0), 2),
      'importe_cup_origin', v_total_origin,
      'tasa_documento', CASE WHEN coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_rate, 0) > 0
                             THEN v_rate ELSE NULL END,
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
-- 1b. Tipo documental RECTIFICACION_FIN — el tipo existía SOLO en producción
--     (insertado out-of-band durante CP-FIN-015; verificado LIVE 2026-11-19:
--     valores replicados EXACTOS). Esta declaración cierra la deriva: el
--     replay/E2E reproduce el catálogo completo. Idempotente (ON CONFLICT).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_document_types (
  code, name, module, source_table, description, trigger_status, is_postable, is_active, sort_order)
VALUES (
  'RECTIFICACION_FIN', 'Rectificaciones financieras (CP-FIN)', 'Sistema', 'fin_entries',
  'Asientos de rectificación contable gobernados (misión CP-FIN). No es un documento operativo: sin regla de motor.',
  NULL, false, true, 95)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fin_rectify_sale_payment_method — ESCRITOR CANÓNICO DE RECTIFICACIÓN
--    de medio de cobro de una venta (CP-FIN-001 §6, autorizado por el
--    propietario para e2614f36: zelle → cash, cobro real EFECTIVO USD).
--
--    Qué hace (UNA transacción atómica, idempotente):
--      a) Verifica fail-closed: venta completed, pagos con el método origen,
--         una única moneda de pago, categoría contable de origen y destino
--         existentes, y el movimiento de cobro original localizable SIN
--         ambigüedad (match exacto por categoría+sense+importe CUP).
--      b) Asienta RECTIFICACION_FIN / ajuste_manual (patrón RECT-015): crédito
--         en la categoría mal clasificada + débito en la correcta, CON
--         amount_origin/currency_origin (nominal y moneda del cobro) y traza
--         con referencias al asiento y movimiento originales + causa.
--         ING_VENTAS, COGS e inventario NO se tocan (ingreso intacto).
--      c) Corrige el MEDIO en los datos de la operación para que Historial de
--         Ventas muestre la realidad: payment_transactions.payment_method,
--         transactions.payment_method (+columnas de importe por método) y la
--         asignación por ítem (cash_paid/transfer_paid/zelle_paid + monedas).
--         Los invariantes PT001–PT011 y las auditorías de UPDATE siguen
--         aplicando (los triggers validan las filas modificadas).
--      d) Idempotencia: una segunda ejecución devuelve YA_APLICADO sin
--         escribir nada (guard por entrada RECTIFICACION_FIN existente +
--         advisory lock por venta).
--
--    ACL: SOLO service_role/postgres (canal canónico Management API / E2E
--    aislado). Sin EXECUTE para anon/authenticated (patrón T12).
-- ═══════════════════════════════════════════════════════════════════════════
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
  EXECUTE format(
    'UPDATE public.transaction_items SET %I = coalesce(%I, 0) + coalesce(%I, 0), %I = 0, %I = coalesce(%I, %I) WHERE transaction_id = $1 AND coalesce(%I, 0) > 0',
    v_to_paid, v_to_paid, v_from_paid,
    v_from_paid,
    v_to_cur, v_to_cur, v_from_cur,
    v_from_paid)
  USING p_sale_id;

  RETURN jsonb_build_object(
    'status', 'OK', 'sale_id', p_sale_id, 'entry_id', v_new_entry_id,
    'docnum', v_docnum, 'importe_cup', round(v_cup, 2),
    'importe_origin', v_nom, 'moneda_cobro', v_pay_currency,
    'from_category', v_from_cat, 'to_category', v_to_cat);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fin_rectify_sale_payment_method(uuid, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fin_rectify_sale_payment_method(uuid, text, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_rectify_sale_payment_method(uuid, text, text, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Catálogo de métricas — contraparte de origen de FLUJO_CAJA (Vista A).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event) VALUES
  ('FLUJO_CAJA', 'importe_cup_origin', 'Importe original del flujo (moneda del documento)', 'origen', 'reconocimiento')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL DE amount_origin (§12 — autorizado; idempotente; sin invención).
--
--    Universo auditado (2026-11-19, producción, solo lectura): 538 movimientos
--    con currency_origin='USD' y amount_origin NULL, TODOS de ENERVIDA
--    (5e6fe821). Desglose y decisión por regla (réplica EXACTA de la semántica
--    del motor nuevo; dry-run previo: scripts/out/cpfin001-backfill-dryrun.json
--    + scripts/out/cpfin001-dryrun2.json del sandbox):
--      · 130 ING_VENTAS → R1: nominal del documento (Σ qty×price_at_sale de
--        ítems con price_currency = moneda del doc). 101 reconstruibles
--        (Σ 13,519.50 USD); 29 con ítems solo en CUP → NULL (sin nominal USD;
--        NO se reconstruye por división de tasas — prohibición §12).
--      · 131 ACT_BANCOS débito → R2: nominal del grupo de pagos (método,
--        moneda ≠ CUP) con Σ amount_cup == amount_cup del movimiento.
--        130 con match ÚNICO; 1 sin match (transfer CUP 6,500 de la venta
--        d461485c: cobro en CUP → NULL por semántica del motor).
--      · 260 COGS/inventario → NULL por diseño (el motor no escribe origen
--        para líneas de costo: no existe costo_productos_cup_origin).
--      · 15 ACT_EFECTIVO_CUP (cobros CUP en ventas USD) → NULL por semántica
--        (cob_cash_cup no tiene contraparte _origin).
--      · 2 FLUJO_CAJA (IE-000002-2026) → R3: nominal 367.00 USD registrado en
--        cash_flow_documents.amount (367 × 800 = 293,600 exacto).
--    Resultado esperado: 233 completados + 305 NULL documentados = 538.
--    Idempotente (WHERE amount_origin IS NULL); SOLO toca la columna
--    amount_origin — jamás importes contables ni saldos.
-- ═══════════════════════════════════════════════════════════════════════════

-- R1: ING_VENTAS — nominal del documento desde los ítems (moneda del doc).
-- Ámbito quirúrgico: tienda ENERVIDA (universo auditado §12: 538/538).
UPDATE public.fin_movements m
SET amount_origin = round(nom.nominal, 2)
FROM public.fin_entries e
JOIN (
  SELECT t.id AS sale_id,
         sum(ti.quantity * ti.price_at_sale) AS nominal
  FROM public.transactions t
  JOIN public.transaction_items ti
    ON ti.transaction_id = t.id AND ti.price_currency = t.sale_currency
  WHERE t.sale_currency <> 'CUP'
    AND t.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  GROUP BY t.id
  HAVING sum(ti.quantity * ti.price_at_sale) > 0
) nom ON nom.sale_id = e.document_id
WHERE m.entry_id = e.id
  AND e.document_type = 'VENTA' AND e.event = 'reconocimiento' AND e.status = 'posted'
  AND m.category_code = 'ING_VENTAS'
  AND m.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND m.currency_origin <> 'CUP'
  AND m.amount_origin IS NULL;

-- R2: ACT_BANCOS débito — nominal del grupo de pagos (match ÚNICO por importe:
-- si dos grupos (p.ej. transfer y zelle) suman el mismo CUP en la misma venta,
-- el movimiento es no desambiguable y queda NULL — fail-closed, sin invención).
WITH grupos AS (
  SELECT pt.ref_id AS doc_id, pt.payment_method, pt.currency,
         sum(pt.amount_cup) AS cup, sum(pt.amount) AS nom
  FROM public.payment_transactions pt
  WHERE pt.ref_type = 'sale' AND coalesce(pt.direction, 'in') = 'in'
    AND pt.currency <> 'CUP'
    AND pt.payment_method IN ('transfer', 'zelle')
    AND pt.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  GROUP BY 1, 2, 3
), unicos AS (
  SELECT g.doc_id, g.cup, min(g.nom) AS nom
  FROM grupos g
  GROUP BY g.doc_id, g.cup
  HAVING count(*) = 1
)
UPDATE public.fin_movements m
SET amount_origin = round(u.nom, 2)
FROM public.fin_entries e
JOIN unicos u ON u.doc_id = e.document_id
WHERE m.entry_id = e.id
  AND abs(u.cup - m.amount_cup) < 0.01
  AND e.document_type = 'VENTA' AND e.event = 'reconocimiento' AND e.status = 'posted'
  AND m.category_code = 'ACT_BANCOS' AND m.sense = 'debito'
  AND m.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND m.currency_origin <> 'CUP'
  AND m.amount_origin IS NULL;

-- R3: FLUJO_CAJA — nominal registrado del documento de caja.
UPDATE public.fin_movements m
SET amount_origin = round(f.amount, 2)
FROM public.fin_entries e
JOIN public.cash_flow_documents f ON f.id = e.document_id
WHERE m.entry_id = e.id
  AND e.document_type = 'FLUJO_CAJA'
  AND m.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND f.currency <> 'CUP' AND coalesce(f.amount, 0) > 0
  AND m.currency_origin <> 'CUP'
  AND m.amount_origin IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Guardas de cuerpo (fail-closed al aplicar).
-- ═══════════════════════════════════════════════════════════════════════════
DO $guard$
DECLARE
  v_n int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_compute_metrics'
    AND pg_get_functiondef(p.oid) LIKE '%importe_cup_origin%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-B-GUARD: fin_compute_metrics sin importe_cup_origin (FLUJO_CAJA)'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_rectify_sale_payment_method'
    AND pg_get_functiondef(p.oid) LIKE '%ERR_AMBIGUOUS_COB_MOVEMENT%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-B-GUARD: fin_rectify_sale_payment_method sin guard de ambigüedad'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
  WHERE grantee = 'authenticated' AND table_name = 'fin_entries' AND privilege_type = 'INSERT';
  IF v_n > 0 THEN RAISE EXCEPTION 'CP-FIN-001-B-GUARD: authenticated no debe tener INSERT directo en fin_entries'; END IF;
END $guard$;

COMMIT;
