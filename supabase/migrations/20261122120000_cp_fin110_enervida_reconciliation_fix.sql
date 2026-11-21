-- ============================================================================
-- CP-FIN-AUDITORÍA-FORENSE-ENERVIDA-110 — Corrección integral del motor
-- contable y de la metodología de conciliación CP-FIN-REC-001 (v1 → v2).
-- Versión: 20261122120000 · Fecha: 2026-11-21 · Tienda prioritaria: ENERVIDA-VITALLCONS
-- Expediente: docs/audits/cp-fin-auditoria-enervida-110/EXPEDIENTE.md
--
-- DIAGNÓSTICO (verificado al céntimo contra producción, read-only):
--   D1 ACT_TRANSF_EXTERIOR Δ16.004.276 = 31 anticipos external_transfer de 18
--      órdenes work 100% pagadas en estado draft — el motor NO tenía reglas
--      para ORDEN_TRABAJO (tipo ya declarado postable en fin_document_types).
--   D2/D3 Cajas CUP/USD Δ±158.350 = el fallback settlement/carve de
--      fin_compute_metrics (015→004) SOBRESCRIBÍA el riel de pagos
--      (payment_transactions) en ventas con liquidación dual legacy,
--      revirtiendo el mandato CP-FIN-002 (RECT-MON: moneda real del cobro =
--      la del riel corregido) y descartando la RECT al reconstruir GEN-2.
--   D4 ACT_INVENTARIO Δ2.950.375,33 = COGS histórico sobrecosteado
--      (contaminación FAC-VITALLCONS-001 + COGS congelado DF-02). Las
--      rectificaciones autorizadas RECT-013-A/B/C (33.833.533,43, misión
--      014, 17/11) fueron descartadas por GEN-1/GEN-2 (pase 4 sin lista).
--      → RECT-110-A (asiento aparte, script gobernado) cierra el residual
--      MEDIDO al céntimo y entra en GEN-3 por p_include_ajuste_ids.
--   D5 34 vales sin asiento = 34 VALE_SALIDA de total_cost 0.00 (era
--      pre-motor): legítimamente sin asiento (motor prohíbe importes <= 0).
--   D6 COGS Δ0,01: redondeo global del período vs redondeo por documento del
--      motor → v2 redondea por venta (misma política, ambas fuentes).
--
-- REGLAS DE LA MISIÓN RESPETADAS: no se inventan cifras; el riel de pagos es
-- la fuente operacional canónica (riel-primacía, doctrina CP-FIN-002, mandato
-- posterior del propietario); la partida doble se verifica (ERR_UNBALANCED);
-- idempotencia por (documento+evento+payment_ref) dentro de la generación;
-- migración NUEVA sobre stream inmutable (no se editan migraciones aplicadas);
-- sin debilitar RLS; alcance de DATOS limitado a ENERVIDA-VITALLCONS (las
-- reglas del motor son globales por diseño — comportamiento correcto para
-- cualquier tienda con órdenes; documentado en el expediente).
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1. fin_compute_metrics — (a) riel-primacía en VENTA, (b) rama ORDEN_TRABAJO
-- ═══════════════════════════════════════════════════════════════════════════
-- Cuerpo base = definición vigente (20261120210000, CP-FIN-004), verificado
-- contra LIVE producción. ÚNICAS ediciones: (a) condición del fallback
-- settlement/carve, (b) nueva rama ORDEN_TRABAJO antes del ELSE.

CREATE OR REPLACE FUNCTION public.fin_compute_metrics(p_doctype text, p_document_id uuid, p_event text DEFAULT 'reconocimiento'::text, p_payment_ref uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb := '{}'::jsonb;
  v_store uuid; v_docnum text; v_date date; v_status text;
  v_cur text; v_rate numeric; v_amt numeric;
  v_total_cup numeric; v_cogs numeric; v_missing int;
  v_txt text; v_num numeric;
  v_missing_txt text;
  v_id uuid; v_total_origin numeric;
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
    v_total_cup := round(coalesce(v_amt, 0), 2);
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
      'total_cup_origin', v_total_origin,
      'tasa_documento', CASE WHEN coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_rate, 0) > 0
                             THEN v_rate ELSE NULL END,
      'cob_cash_cup', 0, 'cob_cash_usd_cup', 0,
      'cob_transfer_cup', 0, 'cob_transfer_usd_cup', 0,
      'cob_zelle_usd_cup', 0, 'cob_external_transfer_usd_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup,
             sum(pt.amount) FILTER (WHERE pt.currency <> 'CUP') AS origin
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'sale' AND pt.ref_id = p_document_id
        AND coalesce(pt.direction, 'in') = 'in'
      GROUP BY 1, 2
    LOOP
      v := jsonb_set(v, ARRAY['cob_' || r.metodo ||
                     CASE WHEN lower(coalesce(r.moneda, 'cup')) = 'cup' THEN ''
                          ELSE '_' || lower(r.moneda) END || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
      IF lower(coalesce(r.moneda, 'cup')) <> 'cup' AND coalesce(r.origin, 0) > 0 THEN
        v := jsonb_set(v, ARRAY['cob_' || r.metodo || '_' || lower(r.moneda) || '_cup_origin'],
                       to_jsonb(round(r.origin, 2)));
      END IF;
    END LOOP;

    -- CP-FIN-110 (riel-primacía): el fallback settlement/carve SOLO se aplica
    -- cuando la venta NO tiene NINGÚN cobro de efectivo registrado en el riel de
    -- pagos (payment_transactions). Si el riel registró el cobro (en la moneda
    -- que sea), el riel es la fuente operacional canónica y el motor lo replica.
    -- Restaura el mandato CP-FIN-002 (RECT-MON): la moneda del cobro es la del
    -- riel corregido, no la de los campos de liquidación legacy.
    IF coalesce((v ->> 'cob_cash_cup')::numeric, 0) = 0
       AND coalesce((v ->> 'cob_cash_usd_cup')::numeric, 0) = 0
       AND coalesce((v ->> 'cob_cash_eur_cup')::numeric, 0) = 0
       AND coalesce((v ->> 'cob_cash_mlc_cup')::numeric, 0) = 0 THEN
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
      -- CP-FIN-003 (hallazgo de la reconstrucción de ENERVIDA): settle CUP
      -- NEGATIVO (vuelto entregado sin recepción CUP registrada) = dato
      -- inconsistente → NO aplicar el carve; manda el pago REGISTRADO.
      IF coalesce(v_fb_usd_settle, 0) > 0 AND coalesce(v_fb_settle_cup, 0) >= 0 THEN
        v_fb_usd_nom := v_fb_usd_settle;
        v_fb_otras_cob := round(coalesce((v ->> 'cob_transfer_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_transfer_usd_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_zelle_usd_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_external_transfer_usd_cup')::numeric, 0)
                              + coalesce((v ->> 'cob_external_transfer_eur_cup')::numeric, 0), 2);
        v_fb_usd_cup := round(v_total_cup - coalesce(v_fb_settle_cup, 0) - v_fb_otras_cob, 2);
        v_fb_cup_cash := round(coalesce(v_fb_settle_cup, 0), 2);
      ELSIF coalesce(v_fb_usd_items, 0) > 0 THEN
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

    -- CP-FIN-003: la suma de cobros cubre TODAS las combinaciones de la regla
    -- v3 (EUR/MLC de efectivo/transferencia y zelle EUR). Sin ellas, una venta
    -- cobrada en EUR quedaba descuadrada: débitos > créditos y la línea
    -- diferencia_cobro_haber computaba 0 (hallazgo de la reconstrucción real
    -- de ENERVIDA: 23ccd04f y abab9e20).
    v_total_cob := round(coalesce((v ->> 'cob_cash_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_cash_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_cash_eur_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_cash_mlc_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_eur_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_transfer_mlc_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_zelle_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_zelle_eur_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_external_transfer_usd_cup')::numeric, 0)
                       + coalesce((v ->> 'cob_external_transfer_eur_cup')::numeric, 0), 2);
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
      'reembolso_zelle_usd_cup', 0, 'reembolso_external_transfer_usd_cup', 0,
      'store_credit_cup', 0);
    FOR r IN
      SELECT pt.payment_method AS metodo, pt.currency AS moneda, sum(pt.amount_cup) AS cup
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_document_id
        AND pt.direction = 'refund'
      GROUP BY 1, 2
    LOOP
      v := jsonb_set(v, ARRAY['reembolso_' || r.metodo ||
                     CASE WHEN lower(coalesce(r.moneda, 'cup')) = 'cup' THEN ''
                          ELSE '_' || lower(r.moneda) END || '_cup'],
                     to_jsonb(round(coalesce(r.cup, 0), 2)));
    END LOOP;
    SELECT coalesce(sum(scl.amount), 0)
      INTO v_amt
    FROM public.store_credit_ledger scl WHERE scl.devolution_id = p_document_id;
    v := jsonb_set(v, ARRAY['store_credit_cup'], to_jsonb(round(v_amt, 2)));

  WHEN 'RECEPCION' THEN
    SELECT rc.store_id, rc.document_number, rc.reception_date::date, rc.status
      INTO v_store, v_docnum, v_date, v_status
    FROM public.receipts rc WHERE rc.id = p_document_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: recepción %', p_document_id; END IF;
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
      -- CP-FIN-003 (anexo §2): el pago expone MEDIO y MONEDA reales + nominal
      -- original, para que la regla resuelva la cuenta canónica
      -- (medio × moneda) y el movimiento conserve el importe entregado.
      v := jsonb_set(v, ARRAY['importe_pago_cup'], to_jsonb(round(coalesce(v_pt.amount_cup, 0), 2)))
          || jsonb_build_object(
               'metodo_pago', v_pt.payment_method,
               'moneda_pago', coalesce(v_pt.currency, 'CUP'),
               'importe_pago_cup_origin',
                 CASE WHEN coalesce(v_pt.currency, 'CUP') = 'CUP' THEN NULL
                      ELSE round(coalesce(v_pt.amount, 0), 2) END);
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
          || jsonb_build_object(
               'metodo_pago', v_pt.payment_method,
               'moneda_pago', coalesce(v_pt.currency, 'CUP'),
               'importe_pago_cup_origin',
                 CASE WHEN coalesce(v_pt.currency, 'CUP') = 'CUP' THEN NULL
                      ELSE round(coalesce(v_pt.amount, 0), 2) END);
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

  WHEN 'ORDEN_TRABAJO' THEN
    -- CP-FIN-110: órdenes de trabajo/servicio (production_orders order_type
    -- service|work). Anticipo (pago con payment_ref) y reconocimiento por
    -- finalización (status='completed', economic_date=completion_date).
    SELECT o.store_id, o.order_number, o.order_type, o.status, o.budget_total,
           o.budget_currency, o.budget_exchange_rate, o.paid_amount,
           coalesce(o.completion_date, o.order_date)
      INTO v_store, v_docnum, v_txt, v_status, v_amt, v_cur, v_rate, v_num, v_date
    FROM public.production_orders o
    WHERE o.id = p_document_id AND o.order_type IN ('service', 'work');
    IF v_store IS NULL THEN RAISE EXCEPTION 'ERR_DOC_NOT_FOUND: orden %', p_document_id; END IF;
    v_total_cup := round(CASE WHEN coalesce(v_cur, 'CUP') = 'CUP' OR coalesce(v_rate, 0) <= 0
                              THEN coalesce(v_amt, 0) ELSE v_amt * v_rate END, 2);
    v_total_origin := NULL;
    IF coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_amt, 0) > 0 THEN
      v_total_origin := round(v_amt, 2);
    END IF;
    SELECT coalesce(sum(pt.amount_cup), 0) INTO v_cogs
    FROM public.payment_transactions pt
    WHERE pt.ref_id = p_document_id AND pt.ref_type IN ('production_order', 'work')
      AND coalesce(pt.direction, 'in') = 'in';
    v := jsonb_build_object(
      'store_id', v_store, 'doc_number', v_docnum, 'economic_date', v_date,
      'estado_documento', v_status, 'moneda_documento', coalesce(v_cur, 'CUP'),
      'descripcion_documento', 'Orden ' || coalesce(v_txt, 'trabajo') || ' ' || coalesce(v_docnum, ''),
      'total_cup', v_total_cup, 'total_cup_origin', v_total_origin,
      'tasa_documento', CASE WHEN coalesce(v_cur, 'CUP') <> 'CUP' AND coalesce(v_rate, 0) > 0
                             THEN v_rate ELSE NULL END,
      'anticipos_cup', round(coalesce(v_cogs, 0), 2),
      'anticipos_aplicados_cup', round(least(coalesce(v_cogs, 0), v_total_cup), 2),
      'pendiente_cup', round(greatest(v_total_cup - coalesce(v_cogs, 0), 0), 2),
      'importe_pago_cup', 0, 'metodo_pago', '');
    IF p_event = 'pago' AND p_payment_ref IS NOT NULL THEN
      SELECT * INTO v_pt FROM public.payment_transactions pt WHERE pt.id = p_payment_ref;
      IF v_pt.ref_id <> p_document_id
         OR v_pt.ref_type NOT IN ('production_order', 'work') THEN
        RAISE EXCEPTION 'ERR_PAYMENT_REF_MISMATCH: pt % no pertenece a la orden %', p_payment_ref, p_document_id;
      END IF;
      v := jsonb_set(v, ARRAY['importe_pago_cup'], to_jsonb(round(coalesce(v_pt.amount_cup, 0), 2)))
          || jsonb_build_object(
               'metodo_pago', v_pt.payment_method,
               'moneda_pago', coalesce(v_pt.currency, 'CUP'),
               'importe_pago_cup_origin',
                 CASE WHEN coalesce(v_pt.currency, 'CUP') = 'CUP' THEN NULL
                      ELSE round(coalesce(v_pt.amount, 0), 2) END);
    END IF;

  ELSE
    RAISE EXCEPTION 'ERR_DOCTYPE_NOT_SUPPORTED: %', p_doctype;
  END CASE;

  IF (v ->> 'store_id') IS NULL OR (v ->> 'economic_date') IS NULL THEN
    RAISE EXCEPTION 'ERR_METRICS_INCOMPLETE: % %', p_doctype, p_document_id;
  END IF;
  RETURN v;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2. Catálogo de métricas — ORDEN_TRABAJO (documentación viva del motor)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
SELECT 'ORDEN_TRABAJO', 'total_cup', 'Presupuesto de la orden (CUP)', 'CUP', 'reconocimiento'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_metric_catalog
                  WHERE document_type = 'ORDEN_TRABAJO' AND metric = 'total_cup');
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
SELECT 'ORDEN_TRABAJO', 'anticipos_cup', 'Anticipos cobrados de la orden (CUP)', 'CUP', 'reconocimiento'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_metric_catalog
                  WHERE document_type = 'ORDEN_TRABAJO' AND metric = 'anticipos_cup');
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
SELECT 'ORDEN_TRABAJO', 'anticipos_aplicados_cup', 'Anticipo aplicado al reconocimiento (mín(anticipos, presupuesto))', 'CUP', 'reconocimiento'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_metric_catalog
                  WHERE document_type = 'ORDEN_TRABAJO' AND metric = 'anticipos_aplicados_cup');
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
SELECT 'ORDEN_TRABAJO', 'pendiente_cup', 'Saldo por cobrar de la orden (CUP)', 'CUP', 'reconocimiento'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_metric_catalog
                  WHERE document_type = 'ORDEN_TRABAJO' AND metric = 'pendiente_cup');
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
SELECT 'ORDEN_TRABAJO', 'importe_pago_cup', 'Importe del anticipo (payment_transactions)', 'CUP', 'pago'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_metric_catalog
                  WHERE document_type = 'ORDEN_TRABAJO' AND metric = 'importe_pago_cup');
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
SELECT 'ORDEN_TRABAJO', 'metodo_pago', 'Medio del anticipo (resolución canónica de caja)', 'texto', 'pago'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_metric_catalog
                  WHERE document_type = 'ORDEN_TRABAJO' AND metric = 'metodo_pago');

-- ═══════════════════════════════════════════════════════════════════════════
-- §3. Regla ORDEN_TRABAJO v1 (global, store_id NULL) — idempotente
--   pago           : Dr @cuenta_financiera(medio×moneda) / Cr PAS_ANTICIPOS_CLI
--   reconocimiento : Dr PAS_ANTICIPOS_CLI(aplicado) + Dr ACT_CXC(pendiente) /
--                    Cr ING_SERVICIOS_PREST(presupuesto) — siempre equilibrada:
--                    least(anticipos,total) + greatest(total−anticipos,0) = total.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_rule_versions (
  document_type, store_id, version, status, movements, effective_from, notes, created_by)
SELECT 'ORDEN_TRABAJO', NULL, 1, 'active', $J$
[
  {"id":"ow-pay-fin-d","orden":3,"evento":"pago",
   "origen":{"tipo":"cuenta_financiera","metrica":"importe_pago_cup"},
   "sentido":"debito","categoria":"@cuenta_financiera","condicion":null},
  {"id":"ow-pay-ant-c","orden":4,"evento":"pago",
   "origen":{"tipo":"metrica","metrica":"importe_pago_cup"},
   "sentido":"credito","categoria":"PAS_ANTICIPOS_CLI","condicion":null},
  {"id":"ow-rec-ant-d","orden":3,"evento":"reconocimiento",
   "origen":{"tipo":"metrica","metrica":"anticipos_aplicados_cup"},
   "sentido":"debito","categoria":"PAS_ANTICIPOS_CLI",
   "condicion":{"campo":"anticipos_aplicados_cup","op":">","valor":0}},
  {"id":"ow-rec-cxc-d","orden":4,"evento":"reconocimiento",
   "origen":{"tipo":"metrica","metrica":"pendiente_cup"},
   "sentido":"debito","categoria":"ACT_CXC",
   "condicion":{"campo":"pendiente_cup","op":">","valor":0}},
  {"id":"ow-rec-ing-c","orden":5,"evento":"reconocimiento",
   "origen":{"tipo":"metrica","metrica":"total_cup"},
   "sentido":"credito","categoria":"ING_SERVICIOS_PREST","condicion":null}
]$J$::jsonb,
  DATE '2026-11-21',
  'CP-FIN-110: anticipos de órdenes service/work y reconocimiento por finalización. Dr caja (canónico medio×moneda) / Cr PAS_ANTICIPOS_CLI; reconocimiento consume el anticipo y reconoce ING_SERVICIOS_PREST con CxC por el saldo.',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_rule_versions rv
  WHERE rv.document_type = 'ORDEN_TRABAJO' AND rv.store_id IS NULL AND rv.version = 1);

-- Desactivar versiones anteriores del mismo tipo (defensa idempotente)
UPDATE public.fin_rule_versions
SET status = 'inactive'
WHERE document_type = 'ORDEN_TRABAJO' AND store_id IS NULL AND version < 1
  AND status = 'active';

-- ═══════════════════════════════════════════════════════════════════════════
-- §4. fin_document_types — ORDEN_TRABAJO: estado disparador (documental)
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.fin_document_types
SET trigger_status = 'completed'
WHERE code = 'ORDEN_TRABAJO' AND (trigger_status IS NULL OR trigger_status <> 'completed');

COMMIT;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5. Trigger de anticipos: payment_transactions (work/production_order)
--      Patrón idéntico al vigente para receipts/services (fin_trg_*).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_trg_payment_transactions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
DECLARE
  v_doctype text;
  v_order_type text;
BEGIN
  IF NEW.ref_type = 'receipt' THEN v_doctype := 'RECEPCION';
  ELSIF NEW.ref_type = 'service' THEN v_doctype := 'SERVICIO_RECIBIDO';
  ELSIF NEW.ref_type IN ('work', 'production_order') THEN
    SELECT o.order_type INTO v_order_type
    FROM public.production_orders o WHERE o.id = NEW.ref_id;
    IF coalesce(v_order_type, '') IN ('service', 'work') THEN
      v_doctype := 'ORDEN_TRABAJO';
    ELSE
      RETURN COALESCE(NEW, OLD);  -- órdenes de producción de inventario: fuera de alcance
    END IF;
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

-- ═══════════════════════════════════════════════════════════════════════════
-- §6. Trigger de finalización: production_orders (status → 'completed')
--      Reconocimiento del ingreso + consumo del anticipo + CxC del saldo.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_trg_production_orders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.order_type IN ('service', 'work') THEN
    PERFORM public.fin_post_document_safe('ORDEN_TRABAJO', NEW.id, 'reconocimiento');
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS fin_trg_production_orders ON public.production_orders;
CREATE TRIGGER fin_trg_production_orders
  AFTER UPDATE ON public.production_orders
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.fin_trg_production_orders();

COMMIT;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- §7. fin_generation_build — pase 5: cobertura de ORDEN_TRABAJO
--      (anticipos por riel + reconocimientos de órdenes completadas)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fin_generation_build(
  p_store_id uuid, p_generation_id uuid,
  p_include_rectifications boolean DEFAULT false,
  p_include_ajuste_ids uuid[] DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  g record; m record; r record;
  v_active uuid; v_new uuid;
  v_e record;
  v_ok int := 0; v_skip int := 0; v_err int := 0; v_ann int := 0; v_copied int := 0;
  v_no_recon jsonb := '[]'::jsonb; v_rect_skipped jsonb := '[]'::jsonb;
  v_ajuste_ids uuid[] := p_include_ajuste_ids;
  v_errors jsonb := '[]'::jsonb;
  v_entry uuid;
BEGIN
  -- ACL pura (patrón fin_rectify_*): ejecución SOLO por service_role
  -- (canal canónico). v_caller queda como atribución (puede ser NULL).

  SELECT * INTO g FROM public.fin_posting_generations
  WHERE id = p_generation_id AND store_id = p_store_id;
  IF g.id IS NULL THEN RAISE EXCEPTION 'ERR_GENERACION_NO_ENCONTRADA'; END IF;
  IF g.status NOT IN ('building', 'candidate') THEN
    RAISE EXCEPTION 'ERR_GENERACION_NO_CONSTRUIBLE (estado: %)', g.status;
  END IF;

  v_active := public.fin_active_generation(p_store_id);
  v_new := p_generation_id;

  -- PASE 1: re-contabilizar reconocimiento/pago de la generación activa
  -- (misma cobertura documental; importes y cuentas según reglas vigentes).
  -- IS NOT DISTINCT FROM v_active cubre TAMBIÉN el legado sin generación
  -- (v_active NULL = asientos generation_id NULL de tiendas creadas tras la
  -- migración): sus anulaciones y ajustes deben reproducirse igual.
  FOR r IN
      SELECT fe.document_type, fe.document_id, fe.event, fe.payment_ref
      FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active
        AND fe.document_id IS NOT NULL
        AND fe.event IN ('reconocimiento', 'pago')
      ORDER BY fe.document_type, fe.economic_date, fe.posted_at
    LOOP
      BEGIN
        -- fin_post_document devuelve NULL cuando el asiento YA existe en la
        -- generación (idempotencia) o la regla no produce movimientos: se
        -- cuenta aparte para poder verificar la idempotencia del build.
        IF public.fin_post_document(r.document_type, r.document_id, r.event,
                                    r.payment_ref, v_caller, v_new) IS NOT NULL THEN
          v_ok := v_ok + 1;
        ELSE
          v_skip := v_skip + 1;
        END IF;
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE 'ERR_DOC_NOT_FOUND%' THEN
          -- Documento ya inexistente (energía: fd9d6c88). Por defecto NO se
          -- copia: los ajustes históricos sobre datos YA CORREGIDOS quedan
          -- incorporados en la re-derivación (copiarlos duplicaría la
          -- corrección — hallazgo real de EnerVida: reversión 151.3M y C1
          -- 40.7M). Se REGISTRAN como no reconstruibles con su cuantía para
          -- el expediente (misión §2/§15).
          v_no_recon := v_no_recon || jsonb_build_object('doc', r.document_id,
            'tipo', r.document_type, 'evento', r.event, 'motivo',
            'documento inexistente (ERR_DOC_NOT_FOUND) — asiento NO copiado: cuantificar en el expediente');
          v_skip := v_skip + 1;
        ELSE
          v_err := v_err + 1;
          v_errors := v_errors || jsonb_build_object('pase', 1, 'doc', r.document_id,
            'tipo', r.document_type, 'evento', r.event, 'error', substr(SQLERRM, 1, 200));
        END IF;
      END;
    END LOOP;

    -- PASE 2: anulaciones de la generación activa → compensar en la candidata.
    FOR r IN
      SELECT DISTINCT fe.document_type, fe.document_id
      FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'anulacion'
        AND fe.document_id IS NOT NULL
    LOOP
      BEGIN
        v_ann := v_ann + public.fin_post_document_annulment(r.document_type, r.document_id, v_new);
      EXCEPTION WHEN others THEN
        v_err := v_err + 1;
        v_errors := v_errors || jsonb_build_object('pase', 2, 'doc', r.document_id,
          'tipo', r.document_type, 'evento', 'anulacion', 'error', substr(SQLERRM, 1, 200));
      END;
    END LOOP;

    -- PASE 3: aperturas (saldos iniciales autorizados) → copia literal.
    FOR v_e IN
      SELECT fe.* FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'apertura'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fin_entries x
                     WHERE x.generation_id = v_new AND x.event = 'apertura'
                       AND x.document_type = v_e.document_type
                       AND x.document_number IS NOT DISTINCT FROM v_e.document_number
                       AND x.economic_date = v_e.economic_date
                       AND x.description IS NOT DISTINCT FROM v_e.description
                       AND x.reversal_of IS NOT DISTINCT FROM v_e.reversal_of) THEN
        INSERT INTO public.fin_entries (
          store_id, document_type, document_id, document_number, event, payment_ref,
          economic_date, rule_version_id, movements_snapshot, reversal_of, status,
          description, created_by, generation_id, posted_at)
        VALUES (v_e.store_id, v_e.document_type, v_e.document_id, v_e.document_number, v_e.event,
                v_e.payment_ref, v_e.economic_date, v_e.rule_version_id, v_e.movements_snapshot,
                v_e.reversal_of, v_e.status, v_e.description, v_e.created_by, v_new,
                v_e.posted_at)
        RETURNING id INTO v_entry;
        FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = v_e.id LOOP
          INSERT INTO public.fin_movements (
            entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
            economic_date, document_number, description, currency_origin, amount_origin,
            worker_id, product_id, customer_id, traza)
          VALUES (v_entry, m.store_id, m.category_code, m.sense, m.amount, m.currency,
                  m.exchange_rate, m.economic_date, m.document_number, m.description,
                  m.currency_origin, m.amount_origin, m.worker_id, m.product_id,
                  m.customer_id, m.traza);
        END LOOP;
        v_copied := v_copied + 1;
      END IF;
    END LOOP;

    -- PASE 4: ajustes manuales → política de LISTA EXPLÍCITA (misión §2:
    -- clasificación por asiento, nunca una regla única para hechos distintos):
    -- · RECTIFICACION_FIN: omitidas (efecto incorporado en los datos
    --   corregidos que la candidata re-deriva — CP-FIN-001/002).
    -- · Ajustes que revierten reconocimientos SOBRE DATOS YA CORREGIDOS
    --   (hallazgo EnerVida: reversión 151,299,851 de FAC-VITALLCONS SKU
    --   111/112 y C1 40,733,723.50): omitidos — la re-derivación ya produce
    --   el valor correcto.
    -- · Regularizaciones de VALORACIÓN históricas autorizadas NO derivables
    --   (misiones 013/014: WAC drift, re-costeo): se copian SOLO si su id
    --   está en p_include_ajuste_ids (decisión documentada por asiento).
    -- Todas quedan registradas en stats (omitidas y copiadas).
    FOR v_e IN
      SELECT fe.* FROM public.fin_entries fe
      WHERE fe.store_id = p_store_id
        AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'ajuste_manual'
        AND fe.document_type <> 'RECTIFICACION_FIN'
        AND (v_ajuste_ids IS NOT NULL AND fe.id = ANY (v_ajuste_ids))
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.fin_entries x
                     WHERE x.generation_id = v_new AND x.event = 'ajuste_manual'
                       AND x.document_type = v_e.document_type
                       AND x.document_number IS NOT DISTINCT FROM v_e.document_number
                       AND x.economic_date = v_e.economic_date
                       AND x.description IS NOT DISTINCT FROM v_e.description
                       AND x.reversal_of IS NOT DISTINCT FROM v_e.reversal_of) THEN
        INSERT INTO public.fin_entries (
          store_id, document_type, document_id, document_number, event, payment_ref,
          economic_date, rule_version_id, movements_snapshot, reversal_of, status,
          description, created_by, generation_id, posted_at)
        VALUES (v_e.store_id, v_e.document_type, v_e.document_id, v_e.document_number, v_e.event,
                v_e.payment_ref, v_e.economic_date, v_e.rule_version_id, v_e.movements_snapshot,
                v_e.reversal_of, v_e.status, v_e.description, v_e.created_by, v_new,
                v_e.posted_at)
        RETURNING id INTO v_entry;
        FOR m IN SELECT * FROM public.fin_movements WHERE entry_id = v_e.id LOOP
          INSERT INTO public.fin_movements (
            entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
            economic_date, document_number, description, currency_origin, amount_origin,
            worker_id, product_id, customer_id, traza)
          VALUES (v_entry, m.store_id, m.category_code, m.sense, m.amount, m.currency,
                  m.exchange_rate, m.economic_date, m.document_number, m.description,
                  m.currency_origin, m.amount_origin, m.worker_id, m.product_id,
                  m.customer_id, m.traza);
        END LOOP;
        v_copied := v_copied + 1;
      END IF;
    END LOOP;

    -- Registro completo de ajuste_manual omitidos (RECTIFICACION_FIN y el
    -- resto) para el expediente: identificación + cuantía (misión §15).
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'entry_id', fe.id, 'document_type', fe.document_type,
             'document_number', fe.document_number,
             'descripcion', fe.description, 'economic_date', fe.economic_date,
             'importe', (SELECT round(sum(CASE WHEN fm.sense = 'debito' THEN fm.amount_cup ELSE -fm.amount_cup END), 2)
                         FROM public.fin_movements fm WHERE fm.entry_id = fe.id))), '[]'::jsonb)
    INTO v_rect_skipped
    FROM public.fin_entries fe
    WHERE fe.store_id = p_store_id
      AND fe.generation_id IS NOT DISTINCT FROM v_active AND fe.event = 'ajuste_manual'
      AND NOT (v_ajuste_ids IS NOT NULL AND fe.id = ANY (v_ajuste_ids));

  -- PASE 5: cobertura documental COMPLETA (misión §5/§7): todo documento
  -- operativo que deba contabilizarse y no tenga asiento en la candidata.
  FOR r IN
    SELECT 'VENTA' AS dt, t.id AS doc, 'reconocimiento'::text AS ev, NULL::uuid AS pref
    FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'VENTA' AND e.document_id = t.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', d.id, 'reconocimiento', NULL
    FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'DEVOLUCION_VENTA' AND e.document_id = d.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'RECEPCION', rc.id, 'reconocimiento', NULL
    FROM public.receipts rc
    WHERE rc.store_id = p_store_id AND rc.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'RECEPCION' AND e.document_id = rc.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', s.id, 'reconocimiento', NULL
    FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'SERVICIO_RECIBIDO' AND e.document_id = s.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'VALE_SALIDA', i.id, 'reconocimiento', NULL
    FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'VALE_SALIDA' AND e.document_id = i.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', a.id, 'reconocimiento', NULL
    FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'AJUSTE_INVENTARIO' AND e.document_id = a.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'COMISION', c.id, 'pago', NULL
    FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'COMISION' AND e.document_id = c.id
                        AND e.event = 'pago' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'NOMINA', n.id, 'reconocimiento', NULL
    FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'NOMINA' AND e.document_id = n.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'NOMINA', n.id, 'pago', NULL
    FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'NOMINA' AND e.document_id = n.id
                        AND e.event = 'pago' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'FLUJO_CAJA', f.id, 'reconocimiento', NULL
    FROM public.cash_flow_documents f
    WHERE f.store_id = p_store_id AND f.status = 'confirmado'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'FLUJO_CAJA' AND e.document_id = f.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
    UNION ALL
    SELECT 'RECEPCION', pt.ref_id, 'pago', pt.id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type = 'receipt'
      AND coalesce(pt.direction, 'in') = 'in'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'RECEPCION' AND e.document_id = pt.ref_id
                        AND e.event = 'pago' AND e.payment_ref = pt.id
                        AND e.generation_id = v_new)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', pt.ref_id, 'pago', pt.id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type = 'service'
      AND coalesce(pt.direction, 'in') = 'in'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'SERVICIO_RECIBIDO' AND e.document_id = pt.ref_id
                        AND e.event = 'pago' AND e.payment_ref = pt.id
                        AND e.generation_id = v_new)
    UNION ALL
    -- CP-FIN-110: anticipos de órdenes de trabajo/service (ORDEN_TRABAJO v1).
    SELECT 'ORDEN_TRABAJO', pt.ref_id, 'pago', pt.id
    FROM public.payment_transactions pt
    JOIN public.production_orders po ON po.id = pt.ref_id
    WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
      AND coalesce(pt.direction, 'in') = 'in'
      AND po.order_type IN ('service', 'work')
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'ORDEN_TRABAJO' AND e.document_id = pt.ref_id
                        AND e.event = 'pago' AND e.payment_ref = pt.id
                        AND e.generation_id = v_new)
    UNION ALL
    -- CP-FIN-110: reconocimiento de órdenes completadas (revenue + consumo del anticipo).
    SELECT 'ORDEN_TRABAJO', o.id, 'reconocimiento', NULL
    FROM public.production_orders o
    WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
      AND o.status = 'completed'
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e
                      WHERE e.document_type = 'ORDEN_TRABAJO' AND e.document_id = o.id
                        AND e.event = 'reconocimiento' AND e.generation_id = v_new)
  LOOP
    BEGIN
      IF public.fin_post_document(r.dt, r.doc, r.ev, r.pref, v_caller, v_new) IS NOT NULL THEN
        v_ok := v_ok + 1;
      ELSE
        v_skip := v_skip + 1;
      END IF;
    EXCEPTION WHEN others THEN
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('pase', 5, 'doc', r.doc,
        'tipo', r.dt, 'evento', r.ev, 'error', substr(SQLERRM, 1, 200));
    END;
  END LOOP;

  UPDATE public.fin_posting_generations
  SET status = 'candidate',
      stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object(
        'build', jsonb_build_object(
          'repostados', v_ok, 'ya_existentes', v_skip, 'anulaciones', v_ann, 'copiados', v_copied,
          'errores', v_err, 'detalle_errores', v_errors,
          'no_reconstruibles', v_no_recon,
          'rectificaciones_omitidas', v_rect_skipped,
          'generacion_origen', v_active,
          'construida_en', now()))
  WHERE id = v_new;

  RETURN jsonb_build_object('status', 'candidate', 'repostados', v_ok,
    'ya_existentes', v_skip, 'anulaciones', v_ann, 'copiados', v_copied, 'errores', v_err,
    'detalle_errores', v_errors, 'no_reconstruibles', v_no_recon,
    'rectificaciones_omitidas', v_rect_skipped);
END $function$;

COMMIT;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- §8. fin_get_reconciliation — CP-FIN-REC-001/v2
--      Cuerpo base = definición vigente (20261121230000 con fix #1679),
--      verificada contra LIVE. Ediciones documentadas en v_met_ver.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fin_get_reconciliation(
  p_store_id uuid, p_as_of date,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := CASE WHEN auth.role() = 'service_role' THEN coalesce(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_gen uuid := public.fin_active_generation(p_store_id);
  v_hist date := '1900-01-01';
  -- CP-FIN-REC-001/v2 (misión CP-FIN-110): cambios documentados frente a v1 —
  --   (a) detector de vales sin asiento excluye los de costo cero (sin efecto
  --       contable material: el motor prohíbe movimientos con importe <= 0);
  --   (b) detector de fallback USD restringido a ventas SIN filas en el riel
  --       de pagos (riel-primacía CP-FIN-002; el motor ya no puede divergir);
  --   (c) GAS_COSTO_VENTAS operacional redondea POR VENTA (misma convención
  --       de decimales del motor: round por documento, no global del período);
  --   (d) ACT_CXC restringido a órdenes COMPLETADAS con saldo (las draft no
  --       generan derecho de cobro contable);
  --   (e) PAS_ANTICIPOS_CLI pasa a CONCILIABLE (crédito de tienda + anticipos
  --       de órdenes no completadas);
  --   (f) ING_SERVICIOS_PREST pasa a CONCILIABLE (órdenes completadas del
  --       período — regla ORDEN_TRABAJO v1 del motor);
  --   (g) fuente production_orders en fuentes_actualizadas.
  -- Impacto histórico: ninguno sobre saldos; mejora exactitud de los puentes.
  v_met_ver text := 'CP-FIN-REC-001/v2';
  v_res jsonb;
BEGIN
  IF v_caller IS NOT NULL AND NOT (public.is_admin_check(v_caller)
     OR public.has_store_access_as(v_caller, p_store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  WITH
  -- ── Inventario: estadísticas del maestro (valoración WAC del sistema) ──
  inv AS (
    SELECT count(*) AS productos_total,
           count(*) FILTER (WHERE p.stock_current > 0) AS con_stock,
           count(*) FILTER (WHERE p.stock_current = 0) AS stock_cero,
           count(*) FILTER (WHERE p.stock_current < 0) AS stock_negativo,
           round(coalesce(sum(p.stock_current), 0), 2) AS cantidad_total,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0), 2) AS valor_wac,
           round(coalesce(sum(p.stock_current * coalesce(p.cost_price, 0)), 0), 2) AS valor_cost_price,
           CASE WHEN coalesce(sum(p.stock_current), 0) <> 0
             THEN round(coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0)
                        / sum(p.stock_current), 4) END AS costo_promedio_ponderado,
           count(*) FILTER (WHERE p.stock_current <> 0 AND coalesce(p.cost_average, 0) = 0) AS sin_costo,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current,
                     'costo_promedio', x.cost_average, 'valor', x.valor) ORDER BY x.valor DESC), '[]'::jsonb)
            FROM (SELECT p2.sku, p2.name, p2.stock_current, p2.cost_average,
                         round(p2.stock_current * coalesce(p2.cost_average, 0), 2) AS valor
                  FROM public.products p2
                  WHERE p2.store_id = p_store_id AND p2.stock_current <> 0
                  ORDER BY valor DESC LIMIT 15) x) AS top_productos,
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'sku', x.sku, 'nombre', x.name, 'existencia', x.stock_current)
                    ORDER BY x.sku), '[]'::jsonb)
            FROM (SELECT p3.sku, p3.name, p3.stock_current
                  FROM public.products p3
                  WHERE p3.store_id = p_store_id AND p3.stock_current <> 0
                    AND coalesce(p3.cost_average, 0) = 0
                  ORDER BY p3.sku LIMIT 10) x) AS sin_costo_detalle
    FROM public.products p WHERE p.store_id = p_store_id
  ),
  -- Kardex: valor del último saldo por producto al corte (reconstrucción histórica)
  krd AS (
    SELECT round(coalesce(sum(k.balance_total_value), 0), 2) AS valor_kardex,
           count(*) AS productos_con_kardex,
           max(k.ultimo)::date AS ultima_fecha
    FROM (
      SELECT DISTINCT ON (ke.product_id) ke.product_id, ke.balance_total_value,
             max(ke.created_at) OVER () AS ultimo
      FROM public.kardex_entries ke
      WHERE ke.store_id = p_store_id AND ke.created_at::date <= p_as_of
      ORDER BY ke.product_id, ke.created_at DESC
    ) k
  ),
  -- Detector de ventas con fallback de liquidación USD (settlement/carve):
  -- su cobro contable (cob_cash_cup/cob_cash_usd_cup reescritos por el motor)
  -- puede divergir del riel de payment_transactions → calidad PARCIAL en cajas.
  fb AS (
    -- v2: SOLO ventas sin NINGUNA fila en el riel de pagos (era pre-riel) cuya
    -- reconstrucción física (settlement/carve) contenga USD: son las únicas que
    -- el motor contabiliza con fuente distinta del riel y pueden divergir de él.
    SELECT count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND t.created_at::date <= p_as_of
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_transactions pt
        WHERE pt.ref_type = 'sale' AND pt.ref_id = t.id)
      AND (
        coalesce(t.cash_received_usd, 0) - coalesce(t.change_given_usd, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.transaction_items ti
          WHERE ti.transaction_id = t.id AND ti.cash_currency = 'USD'
            AND ti.currency = 'USD' AND coalesce(ti.cash_paid, 0) > 0))
  ),
  -- Cuentas financieras: flujos operacionales por (medios × moneda)
  cash AS (
    SELECT cur.*, (f ->> 'apertura')::numeric AS apertura, (f ->> 'flujos')::numeric AS flujos,
           (f ->> 'n_flujos')::bigint AS n_flujos, f -> 'desglose' AS desglose
    FROM (
      SELECT 'CUP' AS cur, public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'CUP', p_as_of) AS f
      UNION ALL SELECT 'USD', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'USD', p_as_of)
      UNION ALL SELECT 'EUR', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'EUR', p_as_of)
      UNION ALL SELECT 'MLC', public.fin_cash_flows_operacional(p_store_id, ARRAY['cash'], 'MLC', p_as_of)
      UNION ALL SELECT 'BANCOS', public.fin_cash_flows_operacional(p_store_id, ARRAY['transfer'], NULL, p_as_of)
      UNION ALL SELECT 'EXTERIOR', public.fin_cash_flows_operacional(p_store_id, ARRAY['external_transfer', 'zelle'], NULL, p_as_of)
    ) cur(cur, f)
  ),
  -- Documentos operacionales postables SIN asiento en la generación activa
  docs_pend AS (
    SELECT 'VENTA' AS tipo, count(*) AS n FROM public.transactions t
    WHERE t.store_id = p_store_id AND t.status = 'completed' AND t.created_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VENTA'
                        AND e.document_id = t.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'DEVOLUCION_VENTA', count(*) FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed' AND d.processed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'DEVOLUCION_VENTA'
                        AND e.document_id = d.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'RECEPCION', count(*) FROM public.receipts r
    WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'RECEPCION'
                        AND e.document_id = r.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'SERVICIO_RECIBIDO', count(*) FROM public.received_services s
    WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'SERVICIO_RECIBIDO'
                        AND e.document_id = s.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    -- v2: los vales de costo 0.00 no tienen efecto contable material (el motor
    -- prohíbe movimientos <= 0): no son documentos pendientes, son sin-asiento
    -- legítimo (clasificación CP-FIN-110 D5: 34 vales históricos costo cero).
    SELECT 'VALE_SALIDA', count(*) FROM public.issue_slips i
    WHERE i.store_id = p_store_id AND i.status = 'completed' AND i.created_at::date <= p_as_of
      AND coalesce(i.total_cost, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'VALE_SALIDA'
                        AND e.document_id = i.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'AJUSTE_INVENTARIO', count(*) FROM public.inventory_adjustments a
    WHERE a.store_id = p_store_id AND a.status = 'confirmed' AND a.confirmed_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'AJUSTE_INVENTARIO'
                        AND e.document_id = a.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'COMISION', count(*) FROM public.commission_payments c
    WHERE c.store_id = p_store_id AND c.status = 'paid' AND c.paid_at::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'COMISION'
                        AND e.document_id = c.id AND e.event = 'pago'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'NOMINA', count(*) FROM public.payrolls n
    WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'NOMINA'
                        AND e.document_id = n.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
    UNION ALL
    SELECT 'FLUJO_CAJA', count(*) FROM public.cash_flow_documents cfd
    WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado' AND cfd.operation_date::date <= p_as_of
      AND NOT EXISTS (SELECT 1 FROM public.fin_entries e WHERE e.document_type = 'FLUJO_CAJA'
                        AND e.document_id = cfd.id AND e.event = 'reconocimiento'
                        AND e.generation_id IS NOT DISTINCT FROM v_gen)
  ),
  -- Asientos cuyo documento de origen YA NO EXISTE en la tabla fuente
  sin_resp AS (
    SELECT e.document_type AS tipo, count(*) AS n
    FROM public.fin_entries e
    WHERE e.store_id = p_store_id AND e.generation_id IS NOT DISTINCT FROM v_gen
      AND e.document_id IS NOT NULL AND e.economic_date <= p_as_of
      AND (e.document_type = 'VENTA' AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.document_id)
        OR e.document_type = 'DEVOLUCION_VENTA' AND NOT EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = e.document_id)
        OR e.document_type = 'RECEPCION' AND NOT EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = e.document_id)
        OR e.document_type = 'SERVICIO_RECIBIDO' AND NOT EXISTS (SELECT 1 FROM public.received_services s WHERE s.id = e.document_id)
        OR e.document_type = 'VALE_SALIDA' AND NOT EXISTS (SELECT 1 FROM public.issue_slips i WHERE i.id = e.document_id)
        OR e.document_type = 'AJUSTE_INVENTARIO' AND NOT EXISTS (SELECT 1 FROM public.inventory_adjustments a WHERE a.id = e.document_id)
        OR e.document_type = 'COMISION' AND NOT EXISTS (SELECT 1 FROM public.commission_payments c WHERE c.id = e.document_id)
        OR e.document_type = 'NOMINA' AND NOT EXISTS (SELECT 1 FROM public.payrolls n WHERE n.id = e.document_id)
        OR e.document_type = 'FLUJO_CAJA' AND NOT EXISTS (SELECT 1 FROM public.cash_flow_documents cfd WHERE cfd.id = e.document_id))
    GROUP BY e.document_type
  ),
  -- ── Lado OPERACIONAL por cuenta (UNION: una fila por cuenta conciliable) ──
  op AS (
    -- ACT_INVENTARIO · valoración WAC del sistema (hoy) o kardex al corte (histórico)
    SELECT 'ACT_INVENTARIO' AS cuenta, false AS es_periodo, 10::int AS orden,
           CASE WHEN p_as_of < CURRENT_DATE THEN krd.valor_kardex ELSE inv.valor_wac END AS valor_op,
           inv.con_stock AS docs_op,
           (SELECT max(sm.created_at)::date FROM public.stock_movements sm WHERE sm.store_id = p_store_id) AS ultima_op,
           CASE WHEN inv.sin_costo > 0
                 OR inv.con_stock <> krd.productos_con_kardex
                 OR p_as_of < CURRENT_DATE
                THEN 'PARCIAL' ELSE 'COMPLETA' END::text AS calidad,
           CASE WHEN p_as_of < CURRENT_DATE
             THEN 'Valor según Kardex al corte (último saldo por producto): reconstrucción histórica documental.'
             ELSE 'Σ products.stock_current × cost_average (WAC — método de valoración del sistema). Fuente viva del maestro de productos.' END AS metodologia,
           ARRAY['products', 'kardex_entries', 'stock_movements']::text[] AS fuentes,
           jsonb_build_object(
             'productos_total', inv.productos_total, 'con_stock_positivo', inv.con_stock,
             'stock_cero', inv.stock_cero, 'stock_negativo', inv.stock_negativo,
             'cantidad_total', inv.cantidad_total, 'valor_wac', inv.valor_wac,
             'valor_cost_price', inv.valor_cost_price, 'valor_kardex', krd.valor_kardex,
             'costo_promedio_ponderado', inv.costo_promedio_ponderado,
             'productos_sin_costo', inv.sin_costo, 'sin_costo_detalle', inv.sin_costo_detalle,
             'top_productos', inv.top_productos,
             'diferencia_wac_kardex', round(inv.valor_wac - krd.valor_kardex, 2),
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'movimientos_sin_respaldo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM sin_resp WHERE tipo IN ('VENTA','DEVOLUCION_VENTA','RECEPCION','VALE_SALIDA','AJUSTE_INVENTARIO')) z), '{}'::jsonb),
             'nota_corte', CASE WHEN p_as_of < CURRENT_DATE THEN 'Corte histórico: el valor vivo del maestro refleja HOY; se usa el Kardex al corte como fuente primaria.' END) AS detalle
    FROM inv CROSS JOIN krd
    -- Cajas por moneda (medio = efectivo físico)
    UNION ALL
    SELECT 'ACT_EFECTIVO_' || c.cur, false, 11,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'cash'
               AND pt.currency = c.cur AND pt.payment_date::date <= p_as_of),
           CASE WHEN (c.cur IN ('CUP', 'USD') AND fb.n > 0) THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Apertura declarada + flujos operacionales de payment_transactions/comisiones/nóminas por (efectivo × ' || c.cur || '), en equivalente CUP (amount_cup). Réplica de la semántica de fechas del motor.',
           ARRAY['payment_transactions', 'cash_flow_documents', 'commission_payments', 'payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose,
             'ventas_con_fallback_usd', fb.n,
             'documentos_pendientes', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, n FROM docs_pend WHERE n > 0 AND tipo IN ('VENTA','DEVOLUCION_VENTA','FLUJO_CAJA','COMISION','NOMINA','RECEPCION','SERVICIO_RECIBIDO')) z), '{}'::jsonb))
    FROM cash c CROSS JOIN fb WHERE c.cur IN ('CUP', 'USD', 'EUR', 'MLC')
    -- Bancos (transferencias, cualquier moneda)
    UNION ALL
    SELECT 'ACT_BANCOS', false, 12,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method = 'transfer'
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos por transferencia (cualquier moneda) según mapeo canónico fin_account_mapping (transfer × * → ACT_BANCOS).',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'BANCOS'
    -- Transferencias del exterior (external_transfer + zelle heredado)
    UNION ALL
    SELECT 'ACT_TRANSF_EXTERIOR', false, 13,
           c.apertura + c.flujos, c.n_flujos,
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
             WHERE pt.store_id = p_store_id AND pt.payment_method IN ('external_transfer', 'zelle')
               AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + flujos Transf. Exterior (external_transfer canónico + zelle heredado normalizado), equivalente CUP.',
           ARRAY['payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('apertura', c.apertura, 'flujos', c.flujos, 'desglose', c.desglose)
    FROM cash c WHERE c.cur = 'EXTERIOR'
    -- Cuentas por cobrar: órdenes service/work pendientes
    UNION ALL
    SELECT 'ACT_CXC', false, 14,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_CXC' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(greatest(o.budget_total - o.paid_amount, 0)
                * CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP' THEN 1
                       ELSE coalesce(o.budget_exchange_rate, 1) END), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed' AND o.order_date <= p_as_of), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed' AND o.order_date <= p_as_of
               AND greatest(o.budget_total - o.paid_amount, 0) > 0.01),
           (SELECT max(o.order_date) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed' AND o.order_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ (budget_total − paid_amount) de órdenes service/work COMPLETADAS, a la tasa del propio documento (v2: las draft no generan derecho contable; su anticipo vive en PAS_ANTICIPOS_CLI). Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-cxc-d).',
           ARRAY['production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object(
             'ordenes_pendientes', (SELECT count(*) FROM public.production_orders o
               WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                 AND o.status = 'completed' AND o.order_date <= p_as_of
                 AND greatest(o.budget_total - o.paid_amount, 0) > 0.01),
             'anticipos_cobrados', coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
               WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                 AND coalesce(pt.direction, 'in') = 'in' AND pt.payment_date::date <= p_as_of), 0))
    -- Entregas de efectivo para depósito (ACT_OTROS_CORR · FLUJO_CAJA v2)
    UNION ALL
    SELECT 'ACT_OTROS_CORR', false, 15,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'ACT_OTROS_CORR' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
                AND cfd.operation_date::date <= p_as_of), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ entregas de efectivo confirmadas (cash_flow_documents egreso/entrega_efectivo → ACT_OTROS_CORR, regla FLUJO_CAJA v2).',
           ARRAY['cash_flow_documents', 'fin_opening_balances']::text[],
           jsonb_build_object('entregas_confirmadas', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept = 'entrega_efectivo'
               AND cfd.operation_date::date <= p_as_of))
    -- Cuentas por pagar a proveedores: recepciones activas − pagos
    UNION ALL
    SELECT 'PAS_CXP_PROV', false, 30,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_CXP_PROV' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT r.id,
                       (SELECT coalesce(sum(ri.quantity * ri.unit_cost * coalesce(NULLIF(ri.tasa_cambio_recepcion, 0), 1)), 0)
                          FROM public.receipt_items ri WHERE ri.receipt_id = r.id) AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'receipt' AND pt.ref_id = r.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.receipts r
                WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           (SELECT max(r.reception_date) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ recepciones activas (Σ receipt_items qty×unit_cost×tasa) − pagos registrados (payment_transactions). Misma semántica de fecha del motor: el asiento de pago lleva la fecha del documento.',
           ARRAY['receipts', 'receipt_items', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('recepciones_activas', (SELECT count(*) FROM public.receipts r
             WHERE r.store_id = p_store_id AND r.status = 'active' AND r.reception_date <= p_as_of))
    -- Servicios pendientes de pago
    UNION ALL
    SELECT 'PAS_SERV_PEND', false, 31,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_SERV_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(x.total - x.pagos), 2) FROM (
                SELECT s.id,
                       CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                            THEN coalesce(s.total_amount, 0)
                            ELSE coalesce(s.total_amount, 0) * s.exchange_rate END AS total,
                       (SELECT coalesce(sum(pt.amount_cup), 0) FROM public.payment_transactions pt
                         WHERE pt.ref_type = 'service' AND pt.ref_id = s.id
                           AND coalesce(pt.direction, 'in') = 'in') AS pagos
                FROM public.received_services s
                WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of) x), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ servicios activos (total × tasa documental) − pagos registrados. Misma métrica del motor (fin_compute_metrics SERVICIO_RECIBIDO).',
           ARRAY['received_services', 'payment_transactions', 'fin_opening_balances']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active' AND s.service_date <= p_as_of))
    -- Nómina pendiente (confirmada, no pagada: neto)
    UNION ALL
    SELECT 'PAS_NOMINA_PEND', false, 32,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_NOMINA_PEND' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_net), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.currency = 'CUP'
                AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_net de nóminas confirmadas (devengadas) no pagadas. El pago cancela la obligación (regla NOMINA v1: np-neto-d).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_confirmadas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status = 'confirmed' AND n.period_end <= p_as_of))
    -- Retenciones de nómina (pendientes de liquidación)
    UNION ALL
    SELECT 'PAS_RETENCIONES', false, 33,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_RETENCIONES' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(n.total_deductions), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end <= p_as_of), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ total_deductions de nóminas confirmadas/pagadas (las retenciones permanecen hasta su liquidación — regla NOMINA v1).',
           ARRAY['payrolls', 'fin_opening_balances']::text[],
           jsonb_build_object('nominas_con_retenciones', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid') AND n.period_end <= p_as_of))
    -- Crédito de tienda (store credit)
    UNION ALL
    SELECT 'PAS_ANTICIPOS_CLI', false, 36,
           coalesce((SELECT round(sum(ob.amount_cup), 2) FROM public.fin_opening_balances ob
                      WHERE ob.store_id = p_store_id AND ob.status = 'applied'
                        AND ob.category_code = 'PAS_ANTICIPOS_CLI' AND ob.as_of_date <= p_as_of), 0)
           + coalesce((SELECT round(sum(scl.amount), 2) FROM public.store_credit_ledger scl
              WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of), 0)
           -- v2: anticipos cobrados por órdenes service/work NO completadas (el
           -- dinero del cliente por trabajos aún no ejecutados: pasivo real). Las
           -- órdenes completadas consumen su anticipo en el reconocimiento
           -- (ow-rec-ant-d); un exceso sobre el presupuesto queda aquí.
           + coalesce((SELECT round(sum(pt.amount_cup), 2) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND o.status <> 'completed' AND pt.payment_date::date <= p_as_of), 0)
           + coalesce((SELECT round(coalesce(sum(x.exc), 0), 2) FROM (
                SELECT greatest(sum(pt.amount_cup) - CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END, 0) AS exc
                FROM public.production_orders o
                JOIN public.payment_transactions pt ON pt.ref_id = o.id
                     AND pt.ref_type IN ('production_order', 'work') AND coalesce(pt.direction, 'in') = 'in'
                WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                  AND o.status = 'completed' AND o.order_date <= p_as_of
                GROUP BY o.id) x), 0),
           (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.created_at::date <= p_as_of)
           + (SELECT count(*) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND o.status <> 'completed' AND pt.payment_date::date <= p_as_of),
           (SELECT max(pt.payment_date)::date FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND o.status <> 'completed' AND pt.payment_date::date <= p_as_of),
           'COMPLETA',
           'Apertura declarada + Σ store_credit_ledger (crédito de tienda) + Σ anticipos de órdenes service/work NO completadas + excesos de anticipos sobre presupuesto de órdenes completadas (v2). Contrapartida del motor: regla ORDEN_TRABAJO v1 (anticipos → PAS_ANTICIPOS_CLI).',
           ARRAY['store_credit_ledger', 'payment_transactions', 'production_orders', 'fin_opening_balances']::text[],
           jsonb_build_object('creditos_emitidos', (SELECT count(*) FROM public.store_credit_ledger scl
             WHERE scl.store_id = p_store_id AND scl.amount > 0 AND scl.created_at::date <= p_as_of),
             'anticipos_pendientes', (SELECT coalesce(round(sum(pt.amount_cup), 2), 0) FROM public.payment_transactions pt
              JOIN public.production_orders o ON o.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type IN ('production_order', 'work')
                AND coalesce(pt.direction, 'in') = 'in'
                AND o.order_type IN ('service', 'work')
                AND o.status <> 'completed' AND pt.payment_date::date <= p_as_of),
             'ordenes_no_completadas', (SELECT count(*) FROM public.production_orders o
              WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
                AND o.status <> 'completed' AND o.order_date <= p_as_of))
    -- ══ Cuentas de PERÍODO (mismo rango que el Estado de Rendimiento) ══
    -- Ingresos por ventas (neteo canónico v4: ventas − devoluciones)
    UNION ALL
    SELECT 'ING_VENTAS', true, 60,
           round(coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0)
               - coalesce((SELECT sum(d.total_amount) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to)
           + (SELECT count(*) FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           (SELECT max(d.processed_at)::date FROM public.devolutions d
             WHERE d.store_id = p_store_id AND d.status = 'completed'
               AND d.processed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_amount de ventas completadas − Σ devoluciones completadas del período (neteo canónico de la regla VENTA v4: d-ing-d debita ING_VENTAS).',
           ARRAY['transactions', 'devolutions']::text[],
           jsonb_build_object(
             'ventas_completadas', (SELECT count(*) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to),
             'devoluciones', (SELECT count(*) FROM public.devolutions d
               WHERE d.store_id = p_store_id AND d.status = 'completed'
                 AND d.processed_at::date BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    -- Ingresos por servicios prestados (órdenes service/work completadas) — v2
    SELECT 'ING_SERVICIOS_PREST', true, 61,
           coalesce((SELECT round(sum(CASE WHEN coalesce(o.budget_currency, 'CUP') = 'CUP'
                            OR coalesce(o.budget_exchange_rate, 0) <= 0
                       THEN coalesce(o.budget_total, 0) ELSE o.budget_total * o.budget_exchange_rate END), 2)
              FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed'
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed'
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           (SELECT max(coalesce(o.completion_date, o.order_date)) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed'
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ budget_total × tasa documental de órdenes service/work COMPLETADAS en el período, por completion_date (v2). Contrapartida del motor: regla ORDEN_TRABAJO v1 (línea ow-rec-ing-c).',
           ARRAY['production_orders']::text[],
           jsonb_build_object('ordenes_completadas', (SELECT count(*) FROM public.production_orders o
             WHERE o.store_id = p_store_id AND o.order_type IN ('service', 'work')
               AND o.status = 'completed'
               AND coalesce(o.completion_date, o.order_date) BETWEEN p_from AND p_to))
    -- Descuentos / diferencias de cobro
    UNION ALL
    SELECT 'ING_DESCUENTOS', true, 66,
           round(coalesce((SELECT sum(pt.amount_cup)
               FROM public.payment_transactions pt
               JOIN public.transactions t ON t.id = pt.ref_id
              WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
                AND coalesce(pt.direction, 'in') = 'in'
                AND t.status = 'completed'
                AND t.created_at::date BETWEEN p_from AND p_to), 0)
             - coalesce((SELECT sum(t.total_amount) FROM public.transactions t
               WHERE t.store_id = p_store_id AND t.status = 'completed'
                 AND t.created_at::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           CASE WHEN (SELECT fb2.n FROM fb fb2) > 0 THEN 'PARCIAL' ELSE 'COMPLETA' END,
           'Σ (cobrado − facturado) de las ventas del período (diferencia_cobro de la métrica del motor; presentación crédito−débito). Las ventas con fallback de liquidación USD pueden divergir del riel de pagos.',
           ARRAY['transactions', 'payment_transactions']::text[],
           jsonb_build_object('ventas_con_fallback_usd', (SELECT fb2.n FROM fb fb2))
    -- Costo de ventas (WAC congelado a la venta − costo devuelto)
    UNION ALL
    SELECT 'GAS_COSTO_VENTAS', true, 70,
           -- v2: redondeo POR VENTA/DEVOLUCIÓN (round por documento, idéntico al
           -- motor) — elimina la diferencia de precisión 0.01 del redondeo global
           -- del período sin ocultarla: ambas fuentes aplican la MISMA política.
           round(coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(ti.quantity * coalesce(NULLIF(ti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.transaction_items ti
                     JOIN public.transactions t ON t.id = ti.transaction_id
                     LEFT JOIN public.products p ON p.id = ti.product_id
                    WHERE t.store_id = p_store_id AND t.status = 'completed'
                      AND t.created_at::date BETWEEN p_from AND p_to
                    GROUP BY t.id) x), 0)
             - coalesce((SELECT sum(x.s)
               FROM (SELECT round(sum(di.quantity * coalesce(NULLIF(oti.cost_at_sale, 0), p.cost_average, 0)), 2) AS s
                     FROM public.devolution_items di
                     JOIN public.devolutions d ON d.id = di.devolution_id
                     LEFT JOIN public.transaction_items oti
                       ON oti.transaction_id = d.original_transaction_id AND oti.product_id = di.product_id
                     LEFT JOIN public.products p ON p.id = di.product_id
                    WHERE d.store_id = p_store_id AND d.status = 'completed'
                      AND d.processed_at::date BETWEEN p_from AND p_to
                    GROUP BY d.id) x), 0), 2),
           (SELECT count(*) FROM public.transactions t
             WHERE t.store_id = p_store_id AND t.status = 'completed'
               AND t.created_at::date BETWEEN p_from AND p_to),
           NULL::date,
           'COMPLETA',
           'Σ qty×COALESCE(cost_at_sale, cost_average) de ventas completadas − costo devuelto de devoluciones (misma fórmula de fin_compute_metrics v5: costo_productos_cup y costo_devuelto_cup). El costo queda CONGELADO a la venta (DF-02): no se recalcula.',
           ARRAY['transaction_items', 'devolution_items', 'products']::text[],
           jsonb_build_object(
             'nota', 'COGS histórico congelado (cost_at_sale de la era de cada venta). La brecha frente al inventario vivo de la era FAC-VITALLCONS-001 está documentada en el expediente CP-FIN-003 §5.1.')
    -- Vales de salida (consumo interno)
    UNION ALL
    SELECT 'GAS_VALES', true, 74,
           coalesce((SELECT round(sum(i.total_cost), 2) FROM public.issue_slips i
              WHERE i.store_id = p_store_id AND i.status = 'completed'
                AND i.created_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           (SELECT max(i.created_at)::date FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_cost de vales completados del período (métrica costo_cup del motor).',
           ARRAY['issue_slips']::text[],
           jsonb_build_object('vales_completados', (SELECT count(*) FROM public.issue_slips i
             WHERE i.store_id = p_store_id AND i.status = 'completed'
               AND i.created_at::date BETWEEN p_from AND p_to))
    -- Servicios recibidos (gasto)
    UNION ALL
    SELECT 'GAS_SERVICIOS', true, 71,
           coalesce((SELECT round(sum(CASE WHEN coalesce(s.currency, 'CUP') = 'CUP' OR coalesce(s.exchange_rate, 0) <= 0
                        THEN coalesce(s.total_amount, 0)
                        ELSE coalesce(s.total_amount, 0) * s.exchange_rate END), 2)
              FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           (SELECT max(s.service_date) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total×tasa de servicios recibidos activos del período (métrica total_cup del motor).',
           ARRAY['received_services']::text[],
           jsonb_build_object('servicios_activos', (SELECT count(*) FROM public.received_services s
             WHERE s.store_id = p_store_id AND s.status = 'active'
               AND s.service_date BETWEEN p_from AND p_to))
    -- Comisiones pagadas
    UNION ALL
    SELECT 'GAS_COMISIONES', true, 73,
           coalesce((SELECT round(sum(CASE WHEN coalesce(c.currency, 'CUP') = 'CUP' OR coalesce(c.exchange_rate, 0) <= 0
                        THEN coalesce(c.final_amount, 0)
                        ELSE coalesce(c.final_amount, 0) * c.exchange_rate END), 2)
              FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           (SELECT max(c.paid_at)::date FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ final_amount×tasa de comisiones pagadas del período (métrica total_cup del motor; gasto y pago en el mismo evento).',
           ARRAY['commission_payments']::text[],
           jsonb_build_object('comisiones_pagadas', (SELECT count(*) FROM public.commission_payments c
             WHERE c.store_id = p_store_id AND c.status = 'paid'
               AND c.paid_at::date BETWEEN p_from AND p_to))
    -- Nóminas (gasto devengado)
    UNION ALL
    SELECT 'GAS_NOMINAS', true, 72,
           coalesce((SELECT round(sum(n.total_gross), 2) FROM public.payrolls n
              WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
                AND n.currency = 'CUP' AND n.period_end BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           (SELECT max(n.period_end) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ total_gross de nóminas confirmadas/pagadas del período (métrica total_gross_cup del motor).',
           ARRAY['payrolls']::text[],
           jsonb_build_object('nominas', (SELECT count(*) FROM public.payrolls n
             WHERE n.store_id = p_store_id AND n.status IN ('confirmed', 'paid')
               AND n.period_end BETWEEN p_from AND p_to))
    -- Pérdidas de inventario (faltantes confirmados, valorados al WAC del momento)
    UNION ALL
    SELECT 'GAS_PERDIDA_INV', true, 75,
           coalesce((SELECT round(sum((-i.difference) * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference < 0), 2)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           (SELECT max(a.confirmed_at)::date FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ faltantes (difference<0 × WAC del momento del ajuste según wac_change_log, fallback cost_average) de ajustes confirmados — métrica valor_faltante_cup del motor.',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'products']::text[],
           jsonb_build_object('ajustes_confirmados', (SELECT count(*) FROM public.inventory_adjustments a
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to))
    -- Otros ingresos operacionales (sobrantes + ingresos de caja)
    UNION ALL
    SELECT 'ING_OTROS_OPER', true, 62,
           round(coalesce((SELECT sum(i.difference * coalesce(NULLIF(w.wac, 0), p.cost_average, 0))
                 FILTER (WHERE i.difference > 0)
              FROM public.inventory_adjustments a
              JOIN public.inventory_adjustment_items i ON i.adjustment_id = a.id
              JOIN public.products p ON p.id = i.product_id
              LEFT JOIN LATERAL (
                SELECT wcl.wac_after AS wac FROM public.wac_change_log wcl
                WHERE wcl.product_id = i.product_id AND wcl.store_id = a.store_id
                  AND wcl.created_at <= a.confirmed_at
                ORDER BY wcl.created_at DESC LIMIT 1) w ON true
             WHERE a.store_id = p_store_id AND a.status = 'confirmed'
               AND a.confirmed_at::date BETWEEN p_from AND p_to), 0)
             + coalesce((SELECT sum(cfd.amount_cup) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'ingreso'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0), 2),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ sobrantes de inventario (WAC del momento) + ingresos de caja documentados del período (reglas AJUSTE_INVENTARIO v1 y FLUJO_CAJA v2: fc-in-c).',
           ARRAY['inventory_adjustments', 'inventory_adjustment_items', 'wac_change_log', 'cash_flow_documents']::text[],
           jsonb_build_object('ingresos_caja', coalesce((SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'ingreso'
               AND cfd.operation_date::date BETWEEN p_from AND p_to), 0))
    -- Otros gastos operacionales (egresos de caja ordinarios ≠ entrega_efectivo)
    UNION ALL
    SELECT 'GAS_OTROS_OPER', true, 81,
           coalesce((SELECT round(sum(cfd.amount_cup), 2) FROM public.cash_flow_documents cfd
              WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
                AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
                AND cfd.operation_date::date BETWEEN p_from AND p_to), 0),
           (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           (SELECT max(cfd.operation_date)::date FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to),
           'COMPLETA',
           'Σ egresos de caja ordinarios confirmados (concepto ≠ entrega_efectivo) del período — regla FLUJO_CAJA v2: fc-eg-d.',
           ARRAY['cash_flow_documents']::text[],
           jsonb_build_object('egresos_confirmados', (SELECT count(*) FROM public.cash_flow_documents cfd
             WHERE cfd.store_id = p_store_id AND cfd.status = 'confirmado'
               AND cfd.doc_type = 'egreso' AND cfd.concept <> 'entrega_efectivo'
               AND cfd.operation_date::date BETWEEN p_from AND p_to))
  ),
  -- ── Lado CONTABLE (mayor de la generación activa, ventana por naturaleza) ──
  led AS (
    SELECT o.cuenta, o.es_periodo, o.orden, o.valor_op, o.docs_op, o.ultima_op,
           o.calidad, o.metodologia, o.fuentes, o.detalle,
           c.name AS nombre, c.clase, c.grupo, c.sort_order,
           CASE WHEN o.es_periodo THEN lper.saldo ELSE lcut.saldo END AS valor_contable,
           CASE WHEN o.es_periodo THEN lper.movimientos ELSE lcut.movimientos END AS movs,
           CASE WHEN o.es_periodo THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_cont
    FROM op o
    JOIN public.fin_categories c ON c.code = o.cuenta
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, o.cuenta, v_gen, p_from, p_to) ls) lper ON true
  ),
  calc AS (
    SELECT l.*,
           round(l.valor_op - l.valor_contable, 2) AS diferencia,
           round(coalesce(cf.tolerancia, 0.01), 2) AS tolerancia,
           greatest(coalesce(cf.materialidad_min, 1), round(coalesce(cf.materialidad_pct, 0)
                 * greatest(abs(l.valor_op), abs(l.valor_contable)), 2)) AS materialidad
    FROM led l LEFT JOIN public.fin_reconciliation_config cf ON cf.category_code = l.cuenta
  ),
  final_rows AS (
    SELECT calc.cuenta, calc.nombre, calc.clase, calc.grupo, calc.sort_order,
           calc.es_periodo,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.valor_op END AS valor_operacional,
           calc.valor_contable,
           CASE WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE calc.diferencia END AS diferencia,
           CASE WHEN abs(calc.valor_contable) > 0.005
             THEN round(abs(calc.valor_op - calc.valor_contable) / abs(calc.valor_contable) * 100, 2) END AS diferencia_pct,
           CASE
             WHEN calc.es_periodo AND (p_from IS NULL OR p_to IS NULL) THEN 'PENDIENTE'
             WHEN calc.calidad = 'SIN_FUENTE' THEN 'INCOMPLETO'
             WHEN abs(calc.diferencia) <= calc.tolerancia
               THEN CASE WHEN calc.calidad = 'PARCIAL' THEN 'INCOMPLETO' ELSE 'CONCILIADO' END
             WHEN abs(calc.diferencia) > calc.materialidad THEN 'ALERTA'
             ELSE 'DIFERENCIA'
           END AS estado,
           calc.tolerancia, calc.materialidad,
           calc.docs_op AS documentos_operacionales, calc.movs AS movimientos_contables,
           calc.ultima_op AS ultima_fecha_operacional, calc.ultima_cont AS ultima_fecha_contable,
           calc.calidad, calc.metodologia, calc.fuentes, calc.detalle,
           calc.orden
    FROM calc
    UNION ALL
    -- Resto del catálogo: SIN fuente operacional independiente (misión §5.3)
    SELECT c.code, c.name, c.clase, c.grupo, c.sort_order,
           (c.clase IN ('ingreso', 'gasto')) AS es_periodo,
           NULL::numeric AS valor_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL) THEN NULL
                ELSE CASE WHEN c.clase IN ('ingreso', 'gasto')
                     THEN lper.saldo ELSE lcut.saldo END END AS valor_contable,
           NULL::numeric AS diferencia, NULL::numeric AS diferencia_pct,
           CASE WHEN c.clase IN ('ingreso', 'gasto') AND (p_from IS NULL OR p_to IS NULL)
             THEN 'PENDIENTE' ELSE 'NO_CONCILIABLE' END AS estado,
           NULL::numeric AS tolerancia, NULL::numeric AS materialidad,
           NULL::bigint AS documentos_operacionales,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.movimientos ELSE lcut.movimientos END AS movimientos_contables,
           NULL::date AS ultima_fecha_operacional,
           CASE WHEN c.clase IN ('ingreso', 'gasto') THEN lper.ultima_fecha ELSE lcut.ultima_fecha END AS ultima_fecha_contable,
           'SIN_FUENTE' AS calidad,
           'NO CONCILIABLE — FALTA FUENTE OPERACIONAL: ninguna tabla operativa independiente respalda esta cuenta (sin módulo documental que la genere).' AS metodologia,
           ARRAY[]::text[] AS fuentes,
           NULL::jsonb AS detalle,
           c.sort_order AS orden
    FROM public.fin_categories c
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, v_hist, p_as_of) ls) lcut ON true
    LEFT JOIN LATERAL (SELECT ls.saldo, ls.movimientos, ls.ultima_fecha
                         FROM public.fin_ledger_saldo(p_store_id, c.code, v_gen, p_from, p_to) ls) lper ON true
    WHERE c.is_active AND NOT EXISTS (SELECT 1 FROM op o WHERE o.cuenta = c.code)
  )
  SELECT jsonb_build_object(
    'ejecucion', jsonb_build_object(
      'calculado_en', now(),
      'fecha_corte', p_as_of,
      'desde', p_from, 'hasta', p_to,
      'generacion', (SELECT jsonb_build_object('id', id, 'code', code)
                     FROM public.fin_posting_generations WHERE id = v_gen),
      'metodologia_version', v_met_ver,
      'fuentes_actualizadas', jsonb_build_object(
        'products', (SELECT max(updated_at)::text FROM public.products WHERE store_id = p_store_id),
        'inventory', (SELECT max(updated_at)::text FROM public.inventory WHERE store_id = p_store_id),
        'stock_movements', (SELECT max(created_at)::text FROM public.stock_movements WHERE store_id = p_store_id),
        'kardex_entries', (SELECT max(created_at)::text FROM public.kardex_entries WHERE store_id = p_store_id),
        'payment_transactions', (SELECT max(created_at)::text FROM public.payment_transactions WHERE store_id = p_store_id),
        'transactions', (SELECT max(created_at)::text FROM public.transactions WHERE store_id = p_store_id),
        'receipts', (SELECT max(created_at)::text FROM public.receipts WHERE store_id = p_store_id),
        'received_services', (SELECT max(created_at)::text FROM public.received_services WHERE store_id = p_store_id),
        'issue_slips', (SELECT max(created_at)::text FROM public.issue_slips WHERE store_id = p_store_id),
        'production_orders', (SELECT max(updated_at)::text FROM public.production_orders WHERE store_id = p_store_id),
        'fin_entries', (SELECT max(posted_at)::text FROM public.fin_entries
                         WHERE store_id = p_store_id AND generation_id IS NOT DISTINCT FROM v_gen)),
      'convention', 'Diferencia = valor operacional − valor contable (naturaleza-aware).'),
    'resumen', jsonb_build_object(
      'conciliadas', count(*) FILTER (WHERE r.estado = 'CONCILIADO'),
      'diferencias', count(*) FILTER (WHERE r.estado = 'DIFERENCIA'),
      'alertas', count(*) FILTER (WHERE r.estado = 'ALERTA'),
      'incompletas', count(*) FILTER (WHERE r.estado = 'INCOMPLETO'),
      'no_conciliables', count(*) FILTER (WHERE r.estado = 'NO_CONCILIABLE'),
      'pendientes', count(*) FILTER (WHERE r.estado = 'PENDIENTE'),
      'documentos_pendientes', coalesce((SELECT sum(n) FROM docs_pend), 0),
      'movimientos_sin_respaldo', coalesce((SELECT sum(n) FROM sin_resp), 0)),
    'hallazgos', jsonb_build_object(
      'documentos_pendientes', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'pendientes', n)
                          ORDER BY tipo) FROM docs_pend WHERE n > 0), '[]'::jsonb),
      'movimientos_sin_respaldo', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n)
                          ORDER BY tipo) FROM sin_resp), '[]'::jsonb),
      'ventas_con_fallback_usd', max(fb.n)),
    'cuentas', coalesce(jsonb_agg(row_to_json(r) ORDER BY r.orden), '[]'::jsonb))
  INTO v_res
  FROM final_rows r, fb;

  RETURN v_res;
END $function$;

COMMIT;
