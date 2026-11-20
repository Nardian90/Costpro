-- ============================================================================
-- CP-FIN-004 — ANEXO VINCULANTE POS-BACKEND (M2 de 2)
-- Motor contable + reglas + normalizador histórico bajo el contrato canónico
-- `external_transfer` (Transf. Exterior). Complementa a
-- 20261120200000_cp_fin004_external_transfer_contract.sql (M1: enum/columnas/
-- mapeo/catálogo). Cuerpos base = definiciones LIVE verificadas 2026-11-20
-- (scripts/out/cpfin004-live-*.sql), editadas con reemplazos exactos
-- verificados (scripts/build-m2-cpfin004.py — fail-closed por patrón).
--
-- Contenido:
--   1. fin_compute_metrics v5: métricas canónicas cob_external_transfer_*
--      (los nombres se derivan dinámicamente del método persistido) +
--      coberturas del carve M-015 y del total cobrado. Las métricas zelle
--      heredadas se conservan (generaciones superseded las referencian).
--   2. create_sale_v2: normalización del medio en el punto único de ingreso
--      (zelle→external_transfer; JAMÁS se persiste zelle), whitelist temprana,
--      riel de divisa para exterior, pools/ítems en columnas canónicas y
--      §17 con método canónico y clave 'pay-external_transfer-*'.
--   3. Rectificadores v3/v2 (medio y moneda) + invariantes PT005 + writers
--      (register_supplier_payment, pay_commission, create_devolution_v2,
--      reverse_devolution, close_production_order_v2,
--      close_service_order_as_sale, adjust_sale_payment,
--      regularize_sale_payment): aceptan external_transfer y normalizan el
--      heredado zelle.
--   4. Lectores de arqueo/caja/reportes: pools duales
--      (zelle_amount + external_transfer_amount) y grupos
--      ('transfer','zelle','external_transfer').
--   5. Reglas VENTA v4 y DEVOLUCION_VENTA v3: métricas canónicas
--      external_transfer → ACT_TRANSF_EXTERIOR (con ramas zelle HEREDADAS
--      para re-derivación de datos pre-normalización — misma cuenta).
--   6. cp_fin004_normalize_enervida_payments(): normalizador histórico
--      idempotente de ENERVIDA (declaración del propietario: las 3 ventas
--      Zelle identificadas → external_transfer; TODAS las demás ventas USD →
--      cash; works → solo representación). NO se ejecuta aquí: se ejecuta de
--      forma controlada (regla de oro 11g) en la secuencia de producción
--      M1→M2→verificar→normalizar→GEN-2, y es invocable en E2E con fixtures.
--
-- Reglas de la misión respetadas: no se alteran importes, monedas, fechas,
-- tasas, equivalentes contables históricos, cantidades, inventario, COGS ni
-- ingresos; los pagos anulados conservan estado y tratamiento; sin doble
-- contabilización (la reclasificación es de MEDIO, no de hecho económico).
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fin_compute_metrics
-- ═══════════════════════════════════════════════════════════════════════════

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

  ELSE
    RAISE EXCEPTION 'ERR_DOCTYPE_NOT_SUPPORTED: %', p_doctype;
  END CASE;

  IF (v ->> 'store_id') IS NULL OR (v ->> 'economic_date') IS NULL THEN
    RAISE EXCEPTION 'ERR_METRICS_INCOMPLETE: % %', p_doctype, p_document_id;
  END IF;
  RETURN v;
END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. create_sale_v2
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_supervisor_token_jti text DEFAULT NULL::text, p_supervisor_scope jsonb DEFAULT NULL::jsonb, p_discount_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_payment_incidents jsonb DEFAULT NULL::jsonb, p_cash_received_cup numeric DEFAULT NULL::numeric, p_cash_received_usd numeric DEFAULT NULL::numeric, p_change_given_cup numeric DEFAULT NULL::numeric, p_change_given_usd numeric DEFAULT NULL::numeric, p_change_currency text DEFAULT NULL::text, p_payment_components jsonb DEFAULT NULL::jsonb, p_customer_code text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text)
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
  -- CP-FIN-004: normalización canónica del medio de pago en el PUNTO ÚNICO
  -- de ingreso del RPC. 'zelle' es un VALOR HEREDADO de clientes previos al
  -- contrato external_transfer (Transf. Exterior): se acepta y se normaliza;
  -- JAMÁS se persiste. El identificador canónico del POS de 3 opciones es
  -- cash | transfer | external_transfer (+ mixed como agregado).
  v_effective_method text := CASE lower(btrim(COALESCE(p_payment_method, 'cash')))
                               WHEN 'zelle' THEN 'external_transfer'
                               ELSE COALESCE(p_payment_method, 'cash') END;
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
  -- MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24): componentes de pago por
  -- moneda REAL — importe efectivamente cobrado en CUP y en USD por método.
  v_comp jsonb;
  v_comp_method text;
  v_comp_cur text;
  v_comp_amt numeric;
  v_components_ok boolean := false;
  v_usd_rate numeric := NULL;
  v_usd_rate_source text := NULL;
  v_usd_rate_eff timestamptz := NULL;
  v_comp_cash_cup numeric := 0;
  v_comp_cash_usd numeric := 0;
  v_comp_transfer_cup numeric := 0;
  v_comp_transfer_usd numeric := 0;
  v_comp_zelle_usd numeric := 0;
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
      '|customer_code=' || COALESCE(p_customer_code, '') ||
      '|customer_address=' || COALESCE(p_customer_address, '') ||
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
      COALESCE(p_change_currency, '') ||
      -- MISIÓN PAGOS MIXTOS (2026-10-24): los componentes por moneda forman
      -- parte de la identidad de idempotencia (misma clave + componentes
      -- distintos = conflicto limpio, sin duplicar filas del ledger).
      '|payment_components=' || COALESCE(p_payment_components::text, '')
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

  -- CP-FIN-004: whitelist del contrato de 3 opciones del POS (tras la
  -- normalización zelle→external_transfer). Fail-closed temprano: un medio
  -- desconocido NO debe llegar al cast del enum tras mover inventario.
  IF v_effective_method NOT IN ('cash', 'transfer', 'external_transfer', 'mixed') THEN
    RAISE EXCEPTION 'ERR_PAYMENT_METHOD_INVALID: % (cash|transfer|external_transfer|mixed)', p_payment_method;
  END IF;

  -- 6. Auto-promote to mixed — sin cambio (CP-FIN-004: evalúa el método ya
  --     normalizado; p_zelle_amount conserva su nombre de parámetro por
  --     estabilidad del contrato PostgREST y del hash de idempotencia).
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND v_effective_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND v_effective_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  -- MISIÓN-FLEX: con incidencias de pago NO se infla el importe del exterior
  -- al total (un Transf. Exterior parcial debe registrarse como lo reportado).
  IF p_payment_incidents IS NULL AND v_effective_method = 'external_transfer' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
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
      -- CP-CATALOGO (2026-10-28): cierre del fallback legacy sin filtro de tienda
      -- (hallazgo CICLO 2 / E2E-POS-007). products.store_id es NOT NULL, de modo
      -- que no existe el caso legitimo «producto sin tienda»: si la fila
      -- (id, store_id) no existe, el producto pertenece a otra tienda o no
      -- existe. Fail-closed con error explicito; ninguna venta puede tomar
      -- precio/costo/existencia de una fila ajena a la tienda.
      IF EXISTS (SELECT 1 FROM public.products WHERE id = v_pid) THEN
        RAISE EXCEPTION 'ERR_STORE_MISMATCH: el producto % pertenece a otra tienda (solicitada: %)', v_pid, p_store_id;
      END IF;
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: el producto % no existe', v_pid;
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
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid AND store_id = p_store_id;
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
  --     → exchange_rates Diviza informal (rate_date) → fail-closed. D-EXR-01: la tasa
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
      SELECT er.rate, 'global_' || lower(er.source), er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'Diviza'
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

  -- 13.7 MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24): COMPONENTES DE PAGO
  --      POR MONEDA REAL. El cliente declara lo efectivamente cobrado en cada
  --      moneda: [{method, currency, amount}] con importes ORIGINALES (sin
  --      convertir). El servidor:
  --        1. Valida la estructura (método ∈ cash|transfer|zelle, moneda ∈
  --           CUP|USD, importe > 0; zelle es riel USD por diseño).
  --        2. Resuelve la TASA USD de la operación con la jerarquía autoritaria
  --           (tienda → BCC seg3 → Diviza informal, fail-closed, staleness 45 días) —
  --           la MISMA fuente del §10; para venta USD reutiliza v_server_rate.
  --        3. DERIVA los pools canónicos (v_cash_amt/v_transfer_amt/
  --           v_zelle_amt) desde los componentes a la tasa servidor — el
  --           desglose por moneda del cliente deja de tener autoridad
  --           financiera (paridad con D-EXR-02).
  --      Sin componentes (p_payment_components NULL): flujo previo IDÉNTICO
  --      (compatibilidad con /api/sync/batch y clientes legados).
  v_components_ok := false;
  IF p_payment_components IS NOT NULL THEN
    IF jsonb_typeof(p_payment_components) <> 'array' THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: p_payment_components debe ser un array [{method, currency, amount}]';
    END IF;
    IF jsonb_array_length(p_payment_components) > 20 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: máximo 20 componentes por venta';
    END IF;
    v_comp_cash_cup := 0; v_comp_cash_usd := 0;
    v_comp_transfer_cup := 0; v_comp_transfer_usd := 0;
    v_comp_zelle_usd := 0;
    FOR v_comp IN SELECT * FROM jsonb_array_elements(p_payment_components) LOOP
      v_comp_method := lower(btrim(COALESCE(v_comp->>'method', '')));
      v_comp_cur := upper(btrim(COALESCE(v_comp->>'currency', '')));
      v_comp_amt := COALESCE(NULLIF(v_comp->>'amount', '')::numeric, NULL);
      -- CP-FIN-004: 'zelle' heredado se normaliza al canónico external_transfer
      v_comp_method := CASE WHEN v_comp_method = 'zelle' THEN 'external_transfer' ELSE v_comp_method END;
      IF v_comp_method NOT IN ('cash', 'transfer', 'external_transfer')
         OR v_comp_cur NOT IN ('CUP', 'USD')
         OR v_comp_amt IS NULL OR v_comp_amt <= 0 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componente inválido (method=%, currency=%, amount=%)',
          v_comp_method, v_comp_cur, COALESCE(v_comp->>'amount', 'NULL');
      END IF;
      IF v_comp_method = 'external_transfer' AND v_comp_cur <> 'USD' THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: Transf. Exterior (external_transfer) es un riel de divisa (currency=%)', v_comp_cur;
      END IF;
      IF v_comp_method = 'cash' THEN
        IF v_comp_cur = 'CUP' THEN
          v_comp_cash_cup := v_comp_cash_cup + v_comp_amt;
        ELSE
          v_comp_cash_usd := v_comp_cash_usd + v_comp_amt;
        END IF;
      ELSIF v_comp_method = 'transfer' THEN
        IF v_comp_cur = 'CUP' THEN
          v_comp_transfer_cup := v_comp_transfer_cup + v_comp_amt;
        ELSE
          v_comp_transfer_usd := v_comp_transfer_usd + v_comp_amt;
        END IF;
      ELSE
        -- CP-FIN-004: acumulador del pool exterior (nombre interno heredado)
        v_comp_zelle_usd := v_comp_zelle_usd + v_comp_amt;
      END IF;
    END LOOP;

    -- CP-MONEY-002 (D3, posmerge #1467): UNICIDAD de (método, moneda). El
    -- cliente AGRUPA por (método, moneda) (buildPaymentComponents); un payload
    -- con duplicados solo puede venir de un cliente no estándar y §17
    -- insertaría DOS filas del ledger con la MISMA idempotency_key
    -- 'pay-<method>-<currency>-<tx>' — payment_transactions no tiene
    -- UNIQUE(idempotency_key) (verificado contra la BD viva 2026-10-24: solo
    -- PK) → filas duplicadas en la fuente autoritativa del Reporte Entrega.
    -- Fail-closed coherente con la regla de la misión (Fase B: «Rechaza
    -- componentes duplicados») y con la agregación previa de pools (§13.7).
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payment_components) c
      GROUP BY lower(btrim(c->>'method')), upper(btrim(c->>'currency'))
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componentes duplicados — agrupa los importes del mismo método y moneda en un solo componente [{method, currency, amount}]';
    END IF;

    -- Tasa USD de la operación (jerarquía §6.1 — misma fuente que v_server_rate)
    IF upper(COALESCE(p_sale_currency, 'CUP')) = 'USD' AND v_server_rate > 1 THEN
      v_usd_rate := v_server_rate;  -- venta USD: la tasa ya resuelta ES la tasa USD
    END IF;
    IF (v_comp_cash_usd + v_comp_transfer_usd + v_comp_zelle_usd) > 0
       AND (v_usd_rate IS NULL OR v_usd_rate <= 1) THEN
      SELECT ser.rate, 'store_exchange_rates', ser.updated_at
        INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
        FROM public.store_exchange_rates ser
        WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
      IF v_usd_rate IS NULL THEN
        SELECT er.rate, 'global_bcc_seg3', er.rate_date
          INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_usd_rate IS NULL THEN
        SELECT er.rate, 'global_' || lower(er.source), er.rate_date
          INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'Diviza'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: componentes en USD exigen tasa USD (jerarquía tienda→BCC→Diviza) — tienda %', p_store_id;
      END IF;
      IF v_usd_rate_eff < now() - INTERVAL '45 days' THEN
        RAISE EXCEPTION 'ERR_RATE_STALE: currency=USD, store=%, source=%, effective=%',
          p_store_id, v_usd_rate_source, v_usd_rate_eff;
      END IF;
    END IF;

    -- Pools canónicos DERIVADOS (autoridad servidor, fail-closed): la suma de
    -- componentes convertidos a la tasa de la operación.
    v_cash_amt := v_comp_cash_cup + v_comp_cash_usd * COALESCE(v_usd_rate, 1);
    v_transfer_amt := v_comp_transfer_cup + v_comp_transfer_usd * COALESCE(v_usd_rate, 1);
    v_zelle_amt := v_comp_zelle_usd * COALESCE(v_usd_rate, 1);
    v_components_ok := true;
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
  ELSIF v_components_ok THEN
    -- MISIÓN PAGOS MIXTOS (2026-10-24): los pools DERIVADOS de los
    -- componentes (§13.7) son la autoridad — el importe realmente recibido
    -- por moneda ya está validado contra la tasa servidor. Las sobreescritas
    -- por método (total canónico / pool del cliente) NO aplican: destruirían
    -- el desglose por moneda. La suma sigue validándose abajo (14.5/14.9/18)
    -- con las mismas reglas e incidencias MISIÓN-FLEX.
    NULL;
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
  ELSIF v_effective_method = 'external_transfer' THEN
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
        SELECT er.rate, 'global_' || lower(er.source) INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'Diviza'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL OR v_chg_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: el cobro/vuelto en USD exige tasa USD de la tienda (jerarquía tienda→BCC→Diviza) — sin tasa no se completa la operación (tienda %)', p_store_id;
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
    cash_amount, transfer_amount, external_transfer_amount,
    customer_id, customer_name,
    -- CLASIFICATOR-PARTIES (2026-11-04): snapshot histórico del comprador
    customer_code, customer_address,
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
    p_customer_code, p_customer_address,
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
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid AND store_id = p_store_id;
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
    -- CP-CATALOGO (2026-10-28): fallback legacy eliminado (leía el costo por id
    -- sin filtro de tienda). Fail-closed con la misma semántica del bloque 1.
    IF v_cost IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.products WHERE id = v_pid) THEN
        RAISE EXCEPTION 'ERR_STORE_MISMATCH: el producto % pertenece a otra tienda (solicitada: %)', v_pid, p_store_id;
      END IF;
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: el producto % no existe', v_pid;
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
      cash_paid, transfer_paid, external_transfer_paid, currency, exchange_rate,
      cash_currency, transfer_currency, external_transfer_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      external_transfer_discount_type, external_transfer_discount_value, external_transfer_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup,
      catalog_price_at_sale, item_discount_value, item_discount_pct
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'external_transfer_paid','')::numeric,
               NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      COALESCE(v_item->>'external_transfer_currency', v_item->>'zelle_currency'),
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      COALESCE(v_item->>'external_transfer_discount_type', v_item->>'zelle_discount_type'),
      COALESCE(NULLIF(v_item->>'external_transfer_discount_value','')::numeric,
               NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      COALESCE(v_item->>'external_transfer_discount_currency', v_item->>'zelle_discount_currency'),
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
  -- MISIÓN PAGOS MIXTOS (2026-10-24): con componentes, el ledger registra
  -- UNA FILA POR COMPONENTE con su MONEDA REAL y la TASA DE LA OPERACIÓN
  -- persistida (exchange_rate de la fila USD = tasa servidor §13.7). El
  -- invariante PT011 (Σ amount_cup = total) se preserva EXACTO porque los
  -- pools del INSERT de la venta se derivaron de estos mismos componentes a
  -- esta misma tasa. Sin componentes: flujo previo (pool canónico CUP).
  IF v_components_ok THEN
    FOR v_comp IN SELECT * FROM jsonb_array_elements(p_payment_components) LOOP
      v_comp_method := lower(btrim(COALESCE(v_comp->>'method', '')));
      v_comp_cur := upper(btrim(COALESCE(v_comp->>'currency', '')));
      v_comp_amt := COALESCE(NULLIF(v_comp->>'amount', '')::numeric, NULL);
      IF v_comp_method = 'external_transfer' THEN
        -- Transf. Exterior: mismas reglas canónicas del flujo previo (riel de
        -- divisa, tasa > 1, moneda de venta USD/EUR/MLC). Código de error
        -- ERR_ZELLE_REQUIRES_RATE conservado por compatibilidad de clientes.
        IF p_sale_currency = 'CUP' OR v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
          RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and server_exchange_rate > 1. Got: currency=%, rate=%',
            p_sale_currency, v_usd_rate USING ERRCODE = 'PT009';
        END IF;
        IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
          RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
            p_sale_currency USING ERRCODE = 'PT004';
        END IF;
      END IF;
      INSERT INTO public.payment_transactions (
        store_id, ref_type, ref_id, transaction_id,
        amount, payment_method, currency, exchange_rate,
        payment_date, paid_by, idempotency_key
      ) VALUES (
        p_store_id, 'sale', v_tx_id, v_tx_id,
        v_comp_amt, v_comp_method, v_comp_cur,
        CASE WHEN v_comp_cur = 'USD' THEN v_usd_rate ELSE 1.0 END,
        v_eff, v_uid, 'pay-' || v_comp_method || '-' || v_comp_cur || '-' || v_tx_id::text
      ) RETURNING id INTO v_pt_id;
    END LOOP;
  ELSIF v_cash_amt > 0 THEN
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

  -- CP-FIN-001 (2026-11-18): el bloque legacy de TRANSFERENCIA solo aplica
    -- fuera del riel de componentes (§13.7 ya insertó la fila por componente;
    -- sin este guard la fila se DUPLICABA — mismo método, mismo ledger — y el
    -- invariante I1b (§18) reventaba con ERR_PAYMENT_INVARIANT_VIOLATED
    -- (SUM(amount_cup) duplica la parte transfer). Defecto PREEXISTENTE desde
    -- MISIÓN PAGOS MIXTOS 2026-10-24: cualquier venta con payment_components
    -- con componente transferencia (CUP o USD) fallaba; las ventas legacy sin
    -- componentes (p. ej. mixta CUP por pools del cliente) no lo tocaban.
    -- Corrección de una línea: el guard NOT v_components_ok ya usado por zelle.
  IF v_transfer_amt > 0 AND NOT v_components_ok THEN
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

  IF NOT v_components_ok AND v_zelle_amt > 0 THEN
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
      v_zelle_original_amount, 'external_transfer', p_sale_currency, v_server_rate,
      v_eff, v_uid, 'pay-external_transfer-' || v_tx_id::text
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
      'change_rate_source', v_chg_rate_src,
      -- MISIÓN PAGOS MIXTOS (2026-10-24): desglose por moneda auditado
      'payment_components', COALESCE(p_payment_components, 'null'::jsonb),
      'usd_operation_rate', v_usd_rate,
      'usd_operation_rate_source', v_usd_rate_source
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
END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. fin_rectify_sale_payment_method
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fin_rectify_sale_payment_method(p_sale_id uuid, p_from_method text, p_to_method text, p_actor uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  -- CP-FIN-004: 'zelle' es entrada HEREDADA y se normaliza al canónico
  -- external_transfer (los registros históricos pre-normalización también
  -- pueden rectificarse: el rectificador opera sobre el valor REAL almacenado).
  IF lower(btrim(COALESCE(p_from_method, ''))) = 'zelle' THEN p_from_method := 'external_transfer'; END IF;
  IF lower(btrim(COALESCE(p_to_method, ''))) = 'zelle' THEN p_to_method := 'external_transfer'; END IF;
  IF p_from_method NOT IN ('cash', 'transfer', 'external_transfer')
     OR p_to_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'ERR_METHOD_NOT_SUPPORTED: from=% to=% (cash/transfer/external_transfer)', p_from_method, p_to_method;
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
  -- CP-FIN-003: resolución de cuentas por el MAPEO CANÓNICO
  -- (fin_account_mapping: medio × moneda → cuenta). Fallback TRANSITORIO al
  -- mapeo legado (zelle→ACT_BANCOS) para asientos pre-v3 que aún viven en la
  -- generación activa: la rectificación debe encontrar el cobro donde el
  -- motor lo clasificó EN SU MOMENTO. Tras la reconstrucción (GEN-nueva con
  -- reglas v3) el canónico coincide con el asiento y el fallback no se usa.
  v_from_cat := public.fin_resolve_financial_account(p_from_method, v_pay_currency);
  v_to_cat := public.fin_resolve_financial_account(p_to_method, v_pay_currency);
  IF NOT EXISTS (
    SELECT 1 FROM public.fin_movements m
    JOIN public.fin_entries e ON e.id = m.entry_id
    WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
      AND e.event = 'reconocimiento' AND e.status = 'posted'
      AND m.category_code = v_from_cat AND m.sense = 'debito'
  ) THEN
    v_from_cat := CASE
      WHEN p_from_method = 'cash' AND v_pay_currency = 'CUP' THEN 'ACT_EFECTIVO_CUP'
      WHEN p_from_method = 'cash' AND v_pay_currency = 'USD' THEN 'ACT_EFECTIVO_USD'
      WHEN p_from_method IN ('transfer', 'zelle', 'external_transfer')
                                                   THEN 'ACT_BANCOS'
    END;
  END IF;
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

  v_from_col := CASE p_from_method WHEN 'cash' THEN 'cash_amount' WHEN 'transfer' THEN 'transfer_amount'
                                   WHEN 'external_transfer' THEN 'external_transfer_amount' WHEN 'zelle' THEN 'zelle_amount' END;
  v_to_col   := CASE p_to_method   WHEN 'cash' THEN 'cash_amount' WHEN 'transfer' THEN 'transfer_amount'
                                   WHEN 'external_transfer' THEN 'external_transfer_amount' WHEN 'zelle' THEN 'zelle_amount' END;
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
END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. fin_reclassify_sale_payment_currency
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fin_reclassify_sale_payment_currency(p_sale_id uuid, p_metodo text, p_moneda_desde text, p_moneda_hacia text, p_actor uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sale public.transactions%ROWTYPE;
  v_from_cat text; v_to_cat text;
  v_metodo text := lower(btrim(coalesce(p_metodo, '')));
  v_cur_from text := upper(btrim(coalesce(p_moneda_desde, '')));
  v_cur_to   text := upper(btrim(coalesce(p_moneda_hacia, '')));
  v_cup numeric := 0;
  v_nom numeric := NULL;            -- nominal registrado en la moneda origen (evidencia de pagos)
  v_rate_reg numeric := NULL;       -- tasa REGISTRADA en los pagos origen
  v_nom_items numeric := 0;         -- Σ nominales de ítems en la moneda origen
  v_cup_pagos_to numeric := 0;      -- Σ amount_cup de pagos del método ya en la moneda destino
  v_r_doc numeric := NULL;          -- tasa documental reconstruida (evidencia)
  v_orig_entry_id uuid;
  v_orig_mov_id uuid;
  v_new_entry_id uuid;
  v_date date;
  v_docnum text;
  v_count int;
  v_col_paid text; v_col_cur text;
  v_stale boolean := false;
BEGIN
  -- a) Validaciones de entrada (fail-closed; monedas de caja soportadas por
  --    el plan contable REAL: ACT_EFECTIVO_CUP y ACT_EFECTIVO_USD).
  IF lower(btrim(COALESCE(v_metodo, ''))) = 'zelle' THEN v_metodo := 'external_transfer'; END IF;
  IF v_metodo NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'ERR_METHOD_NOT_SUPPORTED: % (cash/transfer/external_transfer)', v_metodo;
  END IF;
  IF v_cur_from NOT IN ('CUP', 'USD') OR v_cur_to NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_CURRENCY_NOT_SUPPORTED: % → % (solo CUP/USD; el plan contable no define cajas EUR/MLC)', v_cur_from, v_cur_to;
  END IF;
  IF v_cur_from = v_cur_to THEN
    RAISE EXCEPTION 'ERR_SAME_CURRENCY: %', v_cur_from;
  END IF;

  v_from_cat := CASE
    WHEN v_metodo = 'cash' AND v_cur_from = 'CUP' THEN 'ACT_EFECTIVO_CUP'
    WHEN v_metodo = 'cash' AND v_cur_from = 'USD' THEN 'ACT_EFECTIVO_USD'
    WHEN v_metodo IN ('transfer', 'zelle', 'external_transfer')        THEN 'ACT_BANCOS'
  END;
  v_to_cat := CASE
    WHEN v_metodo = 'cash' AND v_cur_to = 'CUP' THEN 'ACT_EFECTIVO_CUP'
    WHEN v_metodo = 'cash' AND v_cur_to = 'USD' THEN 'ACT_EFECTIVO_USD'
    WHEN v_metodo IN ('transfer', 'zelle', 'external_transfer')      THEN 'ACT_BANCOS'
  END;
  IF v_from_cat IS NULL OR v_to_cat IS NULL THEN
    RAISE EXCEPTION 'ERR_CATEGORY_UNMAPPED: % % → %', v_metodo, v_cur_from, v_cur_to;
  END IF;
  IF v_from_cat = v_to_cat THEN
    RAISE EXCEPTION 'ERR_SAME_FINANCIAL_CATEGORY: % % → % ambas imputan % (sin efecto contable que rectificar)', v_metodo, v_cur_from, v_cur_to, v_to_cat;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_categories
                 WHERE code = v_to_cat AND is_active) THEN
    RAISE EXCEPTION 'ERR_TARGET_CATEGORY_MISSING: % no existe/activa en el catálogo', v_to_cat;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fin:reclassmon:' || p_sale_id::text));

  -- b) Idempotencia determinista por (venta, método, moneda_origen).
  IF EXISTS (
    SELECT 1
    FROM public.fin_entries e
    JOIN public.fin_movements m ON m.entry_id = e.id
    WHERE e.document_type = 'RECTIFICACION_FIN'
      AND e.document_id = p_sale_id
      AND e.status = 'posted'
      AND m.traza ->> 'origen' = 'reclasificacion_moneda_cobro'
      AND m.traza ->> 'metodo' = v_metodo
      AND m.traza ->> 'moneda_desde' = v_cur_from
  ) THEN
    RETURN jsonb_build_object('status', 'YA_APLICADO', 'sale_id', p_sale_id,
      'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to);
  END IF;

  SELECT * INTO v_sale FROM public.transactions WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'ERR_SALE_NOT_FOUND: %', p_sale_id;
  END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_SALE_NOT_COMPLETED: status=% (solo ventas completed son rectificables)', v_sale.status;
  END IF;

  -- c) Movimiento ORIGINAL del cobro: EXACTAMENTE un débito en la categoría
  --    origen dentro del reconocimiento VENTA posted de la venta.
  SELECT count(*) INTO v_count
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
    AND e.event = 'reconocimiento' AND e.status = 'posted'
    AND m.category_code = v_from_cat AND m.sense = 'debito';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ERR_COB_MOVEMENT_NOT_FOUND: sin débito % en el reconocimiento de % (¿ya rectificado con otra moneda?)', v_from_cat, p_sale_id;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ERR_AMBIGUOUS_COB_MOVEMENT: % débitos % en el reconocimiento de % (no desambiguable)', v_count, v_from_cat, p_sale_id;
  END IF;
  SELECT m.entry_id, m.id, m.amount_cup INTO v_orig_entry_id, v_orig_mov_id, v_cup
  FROM public.fin_movements m
  JOIN public.fin_entries e ON e.id = m.entry_id
  WHERE e.document_type = 'VENTA' AND e.document_id = p_sale_id
    AND e.event = 'reconocimiento' AND e.status = 'posted'
    AND m.category_code = v_from_cat AND m.sense = 'debito';
  IF coalesce(v_cup, 0) <= 0 THEN
    RAISE EXCEPTION 'ERR_ZERO_AMOUNT: débito original = % CUP', v_cup;
  END IF;

  -- d) Coherencia con los pagos registrados (fuente primaria del cobro).
  SELECT count(*), coalesce(sum(amount), 0), min(exchange_rate)
    INTO v_count, v_nom, v_rate_reg
  FROM public.payment_transactions
  WHERE ref_type = 'sale' AND ref_id = p_sale_id
    AND payment_method = v_metodo AND currency = v_cur_from
    AND coalesce(direction, 'in') = 'in';
  IF v_count > 0 THEN
    -- Pagos en la moneda origen: su Σ amount_cup debe explicar EXACTAMENTE el
    -- débito contable a reclasificar (±0.01).
    IF abs(coalesce((SELECT sum(amount_cup) FROM public.payment_transactions
                     WHERE ref_type = 'sale' AND ref_id = p_sale_id
                       AND payment_method = v_metodo AND currency = v_cur_from
                       AND coalesce(direction, 'in') = 'in'), 0) - v_cup) > 0.01 THEN
      RAISE EXCEPTION 'ERR_INCOHERENT_PAGOS: Σ amount_cup pagos %/% (%) ≠ débito contable (%)', v_metodo, v_cur_from,
        (SELECT sum(amount_cup) FROM public.payment_transactions
         WHERE ref_type = 'sale' AND ref_id = p_sale_id
           AND payment_method = v_metodo AND currency = v_cur_from
           AND coalesce(direction, 'in') = 'in'), v_cup;
    END IF;
    IF coalesce(v_nom, 0) > 0 THEN
      v_r_doc := round(v_cup / v_nom, 6);  -- tasa documental desde evidencia (pago registrado)
    END IF;
  ELSE
    -- Caso «asiento obsoleto» (p. ej. 28e94349: el asiento fue publicado por
    -- una versión anterior del motor con reparto por ítems y el pago ya está
    -- registrado en la moneda destino): se exige que exista cobro del método
    -- en la moneda destino y que el débito origen sea explicable por los
    -- nominales de los ítems (tasa documental = débito / Σ nominales).
    v_stale := true;
    SELECT coalesce(sum(amount_cup), 0) INTO v_cup_pagos_to
    FROM public.payment_transactions
    WHERE ref_type = 'sale' AND ref_id = p_sale_id
      AND payment_method = v_metodo AND currency = v_cur_to
      AND coalesce(direction, 'in') = 'in';
    IF v_cup_pagos_to <= 0 THEN
      RAISE EXCEPTION 'ERR_STALE_WITHOUT_TARGET_PAYMENT: sin pagos %/% ni %/% para %', v_metodo, v_cur_from, v_metodo, v_cur_to, p_sale_id;
    END IF;
    v_nom := NULL;
  END IF;

  -- Nominales de ítems en la moneda origen (para normalización de datos).
  v_col_paid := v_metodo || '_paid';
  v_col_cur  := v_metodo || '_currency';
  EXECUTE format(
    'SELECT coalesce(sum(%I), 0) FROM public.transaction_items WHERE transaction_id = $1 AND %I = $2 AND coalesce(%I, 0) > 0',
    v_col_paid, v_col_cur, v_col_paid)
  INTO v_nom_items
  USING p_sale_id, v_cur_from;

  IF v_stale THEN
    IF v_nom_items <= 0 THEN
      RAISE EXCEPTION 'ERR_STALE_WITHOUT_ITEM_NOMINALS: caso asiento obsoleto sin nominales de ítems % en % (no reconstruible)', v_metodo, v_cur_from;
    END IF;
    v_r_doc := round(v_cup / v_nom_items, 6);
  END IF;

  -- e) Documento de rectificación (determinista por venta+método+moneda).
  v_date   := v_sale.created_at::date;
  v_docnum := 'RECT-MON-' || upper(substr(p_sale_id::text, 1, 8)) || '-' || v_metodo || '-' || v_cur_from;

  INSERT INTO public.fin_entries (
    store_id, document_type, document_id, document_number, event, payment_ref,
    economic_date, posted_at, rule_version_id, movements_snapshot, description, created_by, status)
  VALUES (
    v_sale.store_id, 'RECTIFICACION_FIN', p_sale_id, v_docnum, 'ajuste_manual', NULL,
    v_date, now(), NULL, NULL,
    v_docnum || ': reclasificación de la MONEDA del cobro de la venta ' || substr(p_sale_id::text, 1, 8)
      || ' — registrado ' || v_metodo || '/' || v_cur_from || ', moneda real ' || v_cur_to
      || ' · venta facturada en ' || coalesce(v_sale.sale_currency, 'CUP')
      || coalesce(' · cobro contable ' || trim(to_char(v_cup, 'FM999999999999990.00')) || ' CUP', '')
      || coalesce(' · tasa documental ' || trim(to_char(v_r_doc, 'FM999999999999990.000000')), '')
      || ' (moneda real del cobro según evidencia primaria y mandato del propietario).'
      || ' Ref asiento original ' || v_orig_entry_id::text || ' · movimiento ' || v_orig_mov_id::text
      || coalesce(' · causa: ' || p_reason, '')
      || ' · expediente CP-FIN-ENERVIDA-CASH-BANK-CLASSIFICATION-AND-BALANCE-RECONCILIATION-001.',
    coalesce(p_actor, v_sale.seller_id), 'posted')
  RETURNING id INTO v_new_entry_id;

  -- f) Movimientos compensatorios (equilibrados; valor económico íntegro).
  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, traza,
    currency_origin, amount_origin)
  VALUES (
    v_new_entry_id, v_sale.store_id, v_from_cat, 'credito', round(v_cup, 2), 'CUP', 1,
    v_date, v_docnum,
    'Contrapartida: retiro del cobro clasificado en ' || v_from_cat || ' (' || v_metodo || '/' || v_cur_from || ')',
    jsonb_build_object(
      'rect', v_docnum, 'mision', 'CP-FIN-002',
      'origen', 'reclasificacion_moneda_cobro',
      'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to,
      'tasa_documental', v_r_doc, 'caso', CASE WHEN v_stale THEN 'asiento_obsoleto' ELSE 'pagos_registrados' END,
      'ref_entry', v_orig_entry_id, 'ref_mov', v_orig_mov_id,
      'reason', p_reason),
    v_cur_from, v_nom);

  INSERT INTO public.fin_movements (
    entry_id, store_id, category_code, sense, amount, currency, exchange_rate,
    economic_date, document_number, description, traza,
    currency_origin, amount_origin)
  VALUES (
    v_new_entry_id, v_sale.store_id, v_to_cat, 'debito', round(v_cup, 2), 'CUP', 1,
    v_date, v_docnum,
    'Cobro real en ' || v_to_cat || ' (' || v_metodo || ') reclasificado a ' || v_to_cat
      || ' (venta ' || substr(p_sale_id::text, 1, 8) || ')',
    jsonb_build_object(
      'rect', v_docnum, 'mision', 'CP-FIN-002',
      'origen', 'reclasificacion_moneda_cobro',
      'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to,
      'tasa_documental', v_r_doc, 'caso', CASE WHEN v_stale THEN 'asiento_obsoleto' ELSE 'pagos_registrados' END,
      'ref_entry', v_orig_entry_id, 'ref_mov', v_orig_mov_id,
      'reason', p_reason),
    v_cur_to,
    CASE WHEN v_cur_to = 'CUP' THEN round(v_cup, 2)
         WHEN v_r_doc IS NOT NULL AND v_r_doc > 0 THEN round(v_cup / v_r_doc, 2)
         ELSE NULL END);

  -- g) Corrección de los datos de la operación (Historial de Ventas y motor).
  IF v_count > 0 THEN
    UPDATE public.payment_transactions
    SET currency = v_cur_to,
        exchange_rate = CASE WHEN v_cur_to = 'CUP' THEN 1.0 ELSE exchange_rate END,
        amount = CASE WHEN v_cur_to = 'CUP' THEN round(amount_cup, 2) ELSE amount END,
        notes = CASE WHEN coalesce(notes, '') = ''
                     THEN 'Rectificado ' || v_metodo || '/' || v_cur_from || ' → ' || v_cur_to
                     ELSE notes || ' · Rectificado ' || v_metodo || '/' || v_cur_from || ' → ' || v_cur_to END,
        updated_at = now()
    WHERE ref_type = 'sale' AND ref_id = p_sale_id
      AND payment_method = v_metodo AND currency = v_cur_from
      AND coalesce(direction, 'in') = 'in';
  END IF;

  IF v_r_doc IS NOT NULL AND v_r_doc > 0 AND v_nom_items > 0 THEN
    EXECUTE format(
      'UPDATE public.transaction_items SET %I = round(%I * $2, 2), %I = $3 WHERE transaction_id = $1 AND %I = $4 AND coalesce(%I, 0) > 0',
      v_col_paid, v_col_paid, v_col_cur, v_col_cur, v_col_paid)
    USING p_sale_id, v_r_doc, v_cur_to, v_cur_from;
  END IF;

  RETURN jsonb_build_object(
    'status', 'OK', 'sale_id', p_sale_id, 'entry_id', v_new_entry_id,
    'docnum', v_docnum, 'importe_cup', round(v_cup, 2),
    'metodo', v_metodo, 'moneda_desde', v_cur_from, 'moneda_hacia', v_cur_to,
    'tasa_documental', v_r_doc, 'caso', CASE WHEN v_stale THEN 'asiento_obsoleto' ELSE 'pagos_registrados' END,
    'from_category', v_from_cat, 'to_category', v_to_cat,
    'nominal_items_normalizados', v_nom_items);
END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. validate_pt_invariants
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_payment_transactions_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'PT007'; END IF; IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1' USING ERRCODE = 'PT003'; END IF; IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1' USING ERRCODE = 'PT004'; END IF; IF NEW.payment_method IN ('zelle', 'external_transfer') AND NEW.currency = 'CUP' THEN RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP' USING ERRCODE = 'PT005'; END IF; IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0)); PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0)); ELSIF NEW.transaction_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0)); END IF; /* DF-03: los refunds (direction='refund') son contra-asientos de trazabilidad — NO se suman como pago hacia el total del documento. MISIÓN DE CIERRE 2026-10-24: las RECUPERACIONES (direction='recovery') de reembolsos revertidos son contra-asientos simétricos — tampoco se suman como pago (PT001) ni participan de la consistencia de tasa del pago (PT006). */ IF NEW.transaction_id IS NOT NULL AND NEW.direction NOT IN ('refund', 'recovery') THEN DECLARE v_total_amount numeric; v_sum_payments numeric; v_existing_rate numeric; BEGIN SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id; SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id AND direction NOT IN ('refund', 'recovery'); IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL' USING ERRCODE = 'PT001'; END IF; SELECT exchange_rate INTO v_existing_rate FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id AND direction NOT IN ('refund', 'recovery') LIMIT 1; IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES' USING ERRCODE = 'PT006'; END IF; END; END IF; RETURN NEW; END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. register_supplier_payment
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_doc_currency text;
  v_doc_rate numeric;
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_rate numeric := p_exchange_rate;
  v_store_rate numeric;
BEGIN
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

  -- CP-FIN-003: monedas y medios del catálogo canónico solamente.
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'Moneda de pago no soportada: %', p_currency;
  END IF;
  -- CP-FIN-004: normalización del heredado 'zelle' al canónico
  IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'Medio de pago no soportado: %', p_payment_method;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1)
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
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

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- CP-FIN-003 (anexo §2): tasa de conversión REAL para moneda ≠ CUP.
  -- El equivalente contable (amount_cup) es columna GENERATED: la tasa debe
  -- llegar correcta a la INSERT. Sin tasa del llamante → tasa manual de la
  -- tienda; sin ninguna → fail-closed (jamás tasa 1 para divisa).
  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION
          'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1). Configúrela en Tasas o envíela con el pago.',
          p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  -- Monto en CUP (para payment_transactions.amount_cup — invariante)
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE round(p_amount * v_rate, 2)
  END;

  -- R3: Validar overpay — todo en la MONEDA DEL DOCUMENTO (20261113120800).
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_amount_in_doc_currency := CASE
    WHEN p_currency = v_doc_currency THEN p_amount
    ELSE v_amount_cup / v_doc_rate
  END;

  v_balance := v_total - v_paid;
  IF v_amount_in_doc_currency > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_in_doc_currency, v_balance;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, v_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. pay_commission
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pay_commission(p_payment_id uuid, p_payment_method text, p_reference text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
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
  -- CP-FIN-004: normalización del heredado 'zelle' al canónico
  IF lower(trim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF lower(trim(p_payment_method)) NOT IN ('cash', 'transfer', 'external_transfer', 'mixed') THEN
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
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. create_devolution_v2
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- CP-FIN-004: normalización del heredado 'zelle' al canónico
  IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF p_payment_method NOT IN ('cash','transfer','external_transfer','store_credit') THEN
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
  IF p_payment_method = 'external_transfer' AND v_refund_currency = 'CUP' THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_ZELLE_CURRENCY: Transf. Exterior (external_transfer) opera en divisa — un reembolso exterior no puede emitirse en CUP';
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

  IF p_payment_method IN ('cash','transfer','external_transfer','zelle') THEN
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
           COALESCE(SUM(CASE WHEN pt.payment_method IN ('transfer','external_transfer','zelle') AND pt.currency = 'CUP' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method IN ('transfer','external_transfer','zelle') AND pt.currency = 'USD' THEN pt.amount END), 0)
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
      -- 20261114140000 (ciclo divisa): conservar la invariante DOCUMENTADA de este
      -- RPC («amount = canónico / tasa para USD ⇒ amount_cup conserva el total
      -- canónico»). round() al céntimo USD la rompía: amount×tasa ≠ v_total →
      -- ERR_UNBALANCED en el asiento de DEVOLUCION_VENTA. La fila lleva ahora la
      -- TASA EFECTIVA exacta v_total/v_refund_amount (amount_cup = v_total);
      -- la tasa histórica de la venta permanece en v_rate_sale y audit_logs
      -- (rate_sale). El importe físico sigue en céntimos USD reales.
      v_refund_rate := CASE WHEN v_refund_amount > 0
                             THEN v_total / v_refund_amount ELSE v_rate_sale END;
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
          v_comp_usd, p_payment_method, 'USD',
          -- 20261114140000 (ciclo divisa): tasa efectiva exacta del componente USD
          -- ⇒ amount_cup = v_total − v_comp_cup (canónico; misma invariante que M3).
          (v_total - v_comp_cup) / NULLIF(v_comp_usd, 0),
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
END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. reverse_devolution
-- ═══════════════════════════════════════════════════════════════════════════

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
      IF lower(btrim(COALESCE(v_rec_method, ''))) = 'zelle' THEN v_rec_method := 'external_transfer'; END IF;
      IF v_rec_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: método de cobro % no reconocido (cash|transfer|external_transfer)',
          COALESCE(v_rec->>'method', '');
      END IF;
      -- espejo del invariante PT005 de payment_transactions (fail-closed limpio)
      IF v_rec_method = 'external_transfer' AND upper(btrim(v_rec->>'currency')) = 'CUP' THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: Transf. Exterior no opera en CUP (riel de divisa)';
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
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. close_production_order_v2
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL::text, p_final_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_output_product_id uuid DEFAULT NULL::uuid, p_output_quantity numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_transaction_id uuid;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_recv_result jsonb;
  v_existing_result jsonb;
  v_param_hash text;
  v_sum_payments numeric;
BEGIN
  -- ─── 0. Idempotencia — DF-08 FIX: record_id = p_order_id (uuid=uuid, sin ::text) ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      -- AUDITORÍA 2026-10-21 (trampa de nulidad): `!=` contra un hash ausente
      -- (filas legadas de v2.26-g8/hotfix1 — 3/5 reales) evalúa NULL y el IF
      -- NO se ejecuta: se devolvía el resultado original sin verificar que los
      -- parámetros coinciden. IS DISTINCT FROM es fail-closed: hash ausente ⇒
      -- no se puede probar la igualdad ⇒ ERR_IDEMPOTENCY_KEY_REUSE (misma
      -- doctrina que create_cash_flow_document). Para operandos no nulos,
      -- IS DISTINCT FROM ≡ != (tabla de verdad empírica en el informe).
      IF v_existing_result->>'param_hash' IS DISTINCT FROM v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia de estado ───
  IF v_order.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'order_id', p_order_id, 'transaction_id', v_order.transaction_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar que la orden está en progreso ───
  IF v_order.status NOT IN ('in_progress', 'approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSABLE: status %', v_order.status;
  END IF;

  -- ─── 5. Transición a in_progress (si no lo está) ───
  IF v_order.status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_order.status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  -- ─── 6. Pago final (atómico) ───
  IF p_final_amount > 0 AND p_final_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id,
      p_amount := p_final_amount,
      p_payment_method := p_final_method,
      p_paid_by := v_caller_uid,
      p_currency := p_final_currency,
      p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text
    );
  END IF;

  -- PATH A: PRODUCCIÓN → receive consolidado (paquetes 01/03: server-side)
  IF v_order.order_type = 'production' THEN
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT: product_id y quantity > 0 son obligatorios';
    END IF;

    PERFORM public.receive_production_output(
      p_order_id := p_order_id,
      p_product_id := p_output_product_id,
      p_quantity := p_output_quantity,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_idempotency_key := 'recv-' || p_order_id::text
    );

  -- PATH B: SERVICIO
  ELSIF v_order.order_type = 'service' THEN
    SELECT
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method IN ('zelle', 'external_transfer') THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_amount, v_transfer_amount, v_zelle_amount
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

    v_effective_method := COALESCE(p_final_method, 'cash');
    IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
      v_effective_method := 'mixed';
    ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
      v_effective_method := 'mixed';
    ELSIF v_cash_amount > 0 THEN
      v_effective_method := 'cash';
    ELSIF v_transfer_amount > 0 THEN
      v_effective_method := 'transfer';
    ELSIF v_zelle_amount > 0 THEN
      v_effective_method := 'external_transfer';
    END IF;

    INSERT INTO transactions (
      store_id, seller_id, total_amount, payment_method,
      sale_currency, sale_exchange_rate, status, created_at, completed_at,
      customer_name, customer_phone, customer_ci, customer_address,
      subtotal, cash_amount, transfer_amount, external_transfer_amount
    ) VALUES (
      v_order.store_id, p_seller_id, v_order.budget_total,
      v_effective_method::public.payment_method_enum,
      p_final_currency, p_exchange_rate, 'completed', now(), now(),
      v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
      v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
    ) RETURNING id INTO v_transaction_id;

    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
    );

    UPDATE public.payment_transactions
      SET transaction_id = v_transaction_id
      WHERE ref_type IN ('production_order', 'work')
        AND ref_id = p_order_id
        AND transaction_id IS NULL;

    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_transaction_id;

    IF v_sum_payments > v_order.budget_total + 0.01 THEN
      RAISE EXCEPTION 'ERR_OT_OVERPAID: payments=% > budget_total=%', v_sum_payments, v_order.budget_total;
    END IF;

    IF ABS(v_sum_payments - v_order.budget_total) > 0.01 THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'OT_SALDO_PENDING', 'transactions', v_transaction_id, v_order.store_id, v_caller_uid,
        jsonb_build_object('order_id', p_order_id, 'budget_total', v_order.budget_total,
          'sum_payments_cup', v_sum_payments, 'saldo', v_order.budget_total - v_sum_payments)
      );
    END IF;
  END IF;

  -- ─── 7. Transición a completed → closed ───
  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET
    status = 'closed',
    closed_at = now(),
    transaction_id = COALESCE(v_transaction_id, v_order.transaction_id),
    payment_status = 'paid'
  WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_CLOSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'transaction_id', v_transaction_id,
      'final_amount', p_final_amount,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'payment_transactions_associated', true,
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id),
      'df08_uuid_fix', true
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'transaction_id', v_transaction_id
  );
END $function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. close_service_order_as_sale
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_current_status text;
BEGIN
  -- ─── 1. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 3. Idempotencia: si ya está closed con transaction, retornar ───
  IF v_order.status = 'closed' AND v_order.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_closed', 'transaction_id', v_order.transaction_id);
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- ─── 4. Calcular desglose de pagos ───
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method IN ('zelle', 'external_transfer') THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  v_effective_method := p_payment_method;
  IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
    v_effective_method := 'mixed';
  ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
    v_effective_method := 'mixed';
  ELSIF v_cash_amount > 0 THEN
    v_effective_method := 'cash';
  ELSIF v_transfer_amount > 0 THEN
    v_effective_method := 'transfer';
  ELSIF v_zelle_amount > 0 THEN
    v_effective_method := 'external_transfer';
  END IF;

  -- ─── 5. Crear venta ───
  INSERT INTO transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at, completed_at,
    customer_name, customer_phone, customer_ci, customer_address,
    subtotal, cash_amount, transfer_amount, external_transfer_amount
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    v_effective_method::public.payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(), now(),
    v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
    v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
  ) RETURNING id INTO v_transaction_id;

  -- ─── 6. Crear item de venta — cost_at_sale = 0 (regla congelada: servicios no tienen WAC) ───
  INSERT INTO transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- ─── 7. Transición de estados (inline, no sub-LLamada) ───
  SELECT status INTO v_current_status FROM production_orders WHERE id = p_order_id;

  IF v_current_status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_current_status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'PRODUCTION_CLOSED_AS_SALE', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'transaction_id', v_transaction_id,
      'budget_total', v_order.budget_total,
      'cost_at_sale', 0,
      'effective_method', v_effective_method
    )
  );

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id);
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. adjust_sale_payment
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_cash_amount numeric DEFAULT NULL::numeric, p_transfer_amount numeric DEFAULT NULL::numeric, p_zelle_amount numeric DEFAULT NULL::numeric, p_sale_currency text DEFAULT NULL::text, p_sale_exchange_rate numeric DEFAULT NULL::numeric, p_items_price_adjustments jsonb DEFAULT NULL::jsonb, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_old_data JSONB;
  v_new_data JSONB;
  v_old_items JSONB;
  v_new_items JSONB;
  v_items_changed BOOLEAN := FALSE;
  v_payment_changed BOOLEAN := FALSE;
  v_new_subtotal NUMERIC := 0;
  v_new_total NUMERIC := 0;
  v_price_adj JSONB;
  v_adj_product_id UUID;
  v_adj_price NUMERIC;
  v_adj_price_cup NUMERIC;
  v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- V2.12.9 anti-spoofing
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar transacción
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  -- Verificar acceso a la store
  IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- No permitir ajustar ventas ya anuladas o reversadas
  IF v_tx.status IN ('voided', 'reversed', 'cancelled') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
  END IF;

  -- Snapshot BEFORE (transacción + items)
  SELECT jsonb_build_object(
    'total_amount', v_tx.total_amount,
    'subtotal', v_tx.subtotal,
    'payment_method', v_tx.payment_method,
    'cash_amount', v_tx.cash_amount,
    'transfer_amount', v_tx.transfer_amount,
    'zelle_amount', v_tx.zelle_amount, 'external_transfer_amount', v_tx.external_transfer_amount,
    'sale_currency', v_tx.sale_currency,
    'sale_exchange_rate', v_tx.sale_exchange_rate,
    'discount_type', v_tx.discount_type,
    'discount_value', v_tx.discount_value
  ) INTO v_old_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_old_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_old_data := v_old_data || jsonb_build_object('items', v_old_items);

  -- 1. Ajustar payment_method si se proporciona
  -- AUDITORÍA 2026-10-21 (trampa de nulidad): transactions.payment_method es
  -- NULLABLE. `p <> v_tx.payment_method::text` con v_tx NULL ⇒ NULL ⇒ el IF
  -- NO se ejecuta ⇒ v_payment_changed=false ⇒ el bloque UPDATE (paso 5) se
  -- OMITE COMPLETO ⇒ el ajuste solicitado se descarta en silencio con audit
  -- «success» y changes=[]. IS DISTINCT FROM detecta NULL⇄valor como cambio
  -- real; para operandos no nulos es idéntico a <> (tabla de verdad empírica).
  IF p_payment_method IS NOT NULL AND p_payment_method IS DISTINCT FROM v_tx.payment_method::text THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'payment_method');
  END IF;

  -- 2. Ajustar montos de pago
  IF p_cash_amount IS NOT NULL AND p_cash_amount <> COALESCE(v_tx.cash_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'cash_amount');
  END IF;
  IF p_transfer_amount IS NOT NULL AND p_transfer_amount <> COALESCE(v_tx.transfer_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'transfer_amount');
  END IF;
  -- CP-FIN-004: pool exterior canónico (external_transfer_amount); la lectura
  -- dual cubre ventas de la era heredada (zelle_amount) sin normalizar.
  IF p_zelle_amount IS NOT NULL AND p_zelle_amount <> COALESCE(v_tx.external_transfer_amount, v_tx.zelle_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'external_transfer_amount');
  END IF;
  IF p_sale_currency IS NOT NULL AND p_sale_currency <> v_tx.sale_currency THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_currency');
  END IF;
  IF p_sale_exchange_rate IS NOT NULL AND p_sale_exchange_rate <> v_tx.sale_exchange_rate THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_exchange_rate');
  END IF;
  IF p_discount_type IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_type');
  END IF;
  IF p_discount_value IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_value');
  END IF;

  -- 3. Ajustar precios de items (price_at_sale)
  IF p_items_price_adjustments IS NOT NULL THEN
    FOR v_price_adj IN SELECT * FROM jsonb_array_elements(p_items_price_adjustments)
    LOOP
      v_adj_product_id := (v_price_adj->>'product_id')::UUID;
      v_adj_price := (v_price_adj->>'price_at_sale')::NUMERIC;

      -- Validar: NO permitir cambiar quantity o cost_at_sale
      IF (v_price_adj ? 'quantity') OR (v_price_adj ? 'cost_at_sale') THEN
        RAISE EXCEPTION 'ERR_IMMUTABLE_FIELD: quantity y cost_at_sale no son ajustables (NIC 2)';
      END IF;

      -- Cargar item actual para validar que existe y obtener currency
      SELECT * INTO v_item FROM public.transaction_items
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: product_id=% no está en la transacción', v_adj_product_id;
      END IF;

      IF v_adj_price < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale no puede ser negativo';
      END IF;

      -- Recalcular price_at_sale_cup basado en sale_currency/exchange_rate
      v_adj_price_cup := CASE
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = v_item.price_currency THEN v_adj_price
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'CUP' AND v_item.price_currency = 'USD' THEN v_adj_price * COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'USD' AND v_item.price_currency = 'CUP' THEN v_adj_price / COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        ELSE v_adj_price
      END;

      UPDATE public.transaction_items
        SET price_at_sale = v_adj_price,
            price_at_sale_cup = v_adj_price_cup
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id;

      v_items_changed := TRUE;
      v_changes := array_append(v_changes, 'item_price:' || v_adj_product_id);
    END LOOP;
  END IF;

  -- 4. Recalcular subtotal y total_amount desde items (si se ajustaron precios)
  IF v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    SELECT COALESCE(SUM(price_at_sale_cup * quantity), 0) INTO v_new_subtotal
      FROM public.transaction_items WHERE transaction_id = p_transaction_id;

    -- Aplicar descuento
    DECLARE
      v_disc_type TEXT := COALESCE(p_discount_type, v_tx.discount_type::text, 'fixed');
      v_disc_val NUMERIC := COALESCE(p_discount_value, v_tx.discount_value, 0);
    BEGIN
      IF v_disc_type = 'percentage' THEN
        v_new_total := v_new_subtotal * (1 - (v_disc_val / 100.0));
      ELSE
        v_new_total := v_new_subtotal - v_disc_val;
      END IF;
      v_new_total := GREATEST(v_new_total, 0);
    END;
  ELSE
    v_new_subtotal := v_tx.subtotal;
    v_new_total := v_tx.total_amount;
  END IF;

  -- 5. Aplicar cambios de payment (si hay)
  IF v_payment_changed OR v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    UPDATE public.transactions
      SET
        payment_method = COALESCE((CASE WHEN lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle'
                                         THEN 'external_transfer' ELSE p_payment_method END)::public.payment_method_enum, payment_method),
        cash_amount = COALESCE(p_cash_amount, cash_amount),
        transfer_amount = COALESCE(p_transfer_amount, transfer_amount),
        external_transfer_amount = COALESCE(p_zelle_amount, external_transfer_amount),
        sale_currency = COALESCE(p_sale_currency, sale_currency),
        sale_exchange_rate = COALESCE(p_sale_exchange_rate, sale_exchange_rate),
        discount_type = COALESCE(p_discount_type::public.discount_type_enum, discount_type),
        discount_value = COALESCE(p_discount_value, discount_value),
        subtotal = v_new_subtotal,
        total_amount = v_new_total,
        updated_at = NOW()
      WHERE id = p_transaction_id;
  END IF;

  -- 6. Snapshot AFTER
  SELECT jsonb_build_object(
    'total_amount', v_new_total,
    'subtotal', v_new_subtotal,
    'payment_method', COALESCE(p_payment_method, v_tx.payment_method::text),
    'cash_amount', COALESCE(p_cash_amount, v_tx.cash_amount),
    'transfer_amount', COALESCE(p_transfer_amount, v_tx.transfer_amount),
    'zelle_amount', COALESCE(p_zelle_amount, v_tx.zelle_amount),
    'external_transfer_amount', COALESCE(p_zelle_amount, v_tx.external_transfer_amount),
    'sale_currency', COALESCE(p_sale_currency, v_tx.sale_currency),
    'sale_exchange_rate', COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate),
    'discount_type', COALESCE(p_discount_type, v_tx.discount_type::text),
    'discount_value', COALESCE(p_discount_value, v_tx.discount_value)
  ) INTO v_new_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_new_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_new_data := v_new_data || jsonb_build_object('items', v_new_items);

  -- 7. Audit log (V2.12.17 — trazabilidad NIIF 15 + IAS 8)
  INSERT INTO public.audit_logs (
    action, table_name, record_id, store_id, user_id,
    old_data, new_data, metadata
  )
  VALUES (
    CASE WHEN v_items_changed THEN 'SALE_PRICE_ADJUST' ELSE 'SALE_PAYMENT_ADJUST' END,
    'transactions',
    p_transaction_id,
    v_tx.store_id,
    v_caller_uid,
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'changes', to_jsonb(v_changes),
      'reason', p_reason,
      'items_changed', v_items_changed,
      'payment_changed', v_payment_changed,
      'adjustment_timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'old_total', v_tx.total_amount,
    'new_total', v_new_total,
    'changes', to_jsonb(v_changes),
    'audit_logged', TRUE
  );
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. regularize_sale_payment
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.regularize_sale_payment(p_transaction_id uuid, p_reason text, p_user_id uuid, p_idempotency_key text, p_new_cash numeric DEFAULT NULL::numeric, p_new_zelle_cup numeric DEFAULT NULL::numeric, p_new_zelle_usd numeric DEFAULT NULL::numeric, p_new_zelle_rate numeric DEFAULT NULL::numeric, p_new_transfer numeric DEFAULT NULL::numeric, p_new_subtotal numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_jwt_role text;
    v_cash numeric;
    v_zelle numeric;
    v_transfer numeric;
    v_new_total numeric;
    v_subtotal numeric;
    v_old_tx jsonb;
    v_old_pays jsonb;
    v_new_pays jsonb;
    v_sum_pays numeric;
    v_idem_exists boolean := false;
BEGIN
    -- 1) Canal de llamada: solo service_role (convención server-to-server del
    --    proyecto). Lectura de claims inline (patrón app_actor_uid) para no
    --    requerir USAGE del esquema auth al rol owner NOLOGIN.
    v_jwt_role := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    );
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013';
    END IF;
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = 'PT014';
    END IF;

    -- 2) Transacción + lock de fila
    SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016';
    END IF;

    -- 3) Autorización de negocio: admin/manager/encargado EN LA TIENDA de la venta
    IF NOT public.can_admin_reverse_transaction(p_user_id, v_tx.store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;

    -- 4) Estado: solo ventas completadas
    IF v_tx.status <> 'completed' THEN
        RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
    END IF;

    -- 5) Idempotencia por audit_logs
    SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'REGULARIZE_SALE_PAYMENT'
          AND record_id = p_transaction_id
          AND metadata->>'idempotency_key' = btrim(p_idempotency_key)
    ) INTO v_idem_exists;
    IF v_idem_exists THEN
        RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
    END IF;

    -- 6) Montos nuevos (NULL = mantener actual)
    v_cash     := COALESCE(p_new_cash, v_tx.cash_amount, 0);
    v_zelle    := COALESCE(p_new_zelle_cup, v_tx.external_transfer_amount, v_tx.zelle_amount, 0);
    v_transfer := COALESCE(p_new_transfer, v_tx.transfer_amount, 0);
    IF v_cash < 0 OR v_zelle < 0 OR v_transfer < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_AMOUNTS' USING ERRCODE = 'PT012';
    END IF;
    v_new_total := v_cash + v_zelle + v_transfer;
    v_subtotal  := COALESCE(p_new_subtotal, v_new_total);

    -- 7) Snapshot BEFORE
    SELECT jsonb_build_object(
        'total_amount', v_tx.total_amount, 'subtotal', v_tx.subtotal,
        'cash_amount', v_tx.cash_amount, 'transfer_amount', v_tx.transfer_amount,
        'zelle_amount', v_tx.zelle_amount, 'external_transfer_amount', v_tx.external_transfer_amount,
        'sale_currency', v_tx.sale_currency,
        'sale_exchange_rate', v_tx.sale_exchange_rate
    ) INTO v_old_tx;
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) - 'amount_cup' ORDER BY pt.payment_method), '[]'::jsonb)
      INTO v_old_pays
      FROM public.payment_transactions pt
     WHERE pt.transaction_id = p_transaction_id;

    -- 8) UPDATE transactions — primero el total (invariante ERR_PAYMENT_EXCEEDS_TOTAL)
    UPDATE public.transactions
       SET cash_amount = v_cash,
           external_transfer_amount = v_zelle,
           transfer_amount = v_transfer,
           total_amount = v_new_total,
           subtotal = v_subtotal,
           updated_at = now()
     WHERE id = p_transaction_id;

    -- 9) Libro de pagos (amount_cup GENERATED; respete trg_validate_payment_invariants)
    UPDATE public.payment_transactions
       SET amount = v_cash, updated_at = now()
     WHERE transaction_id = p_transaction_id AND payment_method = 'cash' AND currency = 'CUP';

    IF p_new_zelle_usd IS NOT NULL THEN
        UPDATE public.payment_transactions
           SET amount = p_new_zelle_usd,
               payment_method = 'external_transfer',
               exchange_rate = COALESCE(p_new_zelle_rate, exchange_rate),
               updated_at = now()
         WHERE transaction_id = p_transaction_id AND payment_method IN ('zelle', 'external_transfer');
    END IF;

    -- 10) Post-condición: Σ pagos (no refund) = total
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_pays
      FROM public.payment_transactions
     WHERE transaction_id = p_transaction_id
       AND (direction IS DISTINCT FROM 'refund');
    IF ABS(v_sum_pays - v_new_total) > 0.01 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total=%', v_sum_pays, v_new_total
            USING ERRCODE = 'PT011';
    END IF;

    -- 11) Snapshot AFTER + auditoría
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) - 'amount_cup' ORDER BY pt.payment_method), '[]'::jsonb)
      INTO v_new_pays
      FROM public.payment_transactions pt
     WHERE pt.transaction_id = p_transaction_id;

    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
    VALUES (
        'REGULARIZE_SALE_PAYMENT', 'transactions', p_transaction_id, v_tx.store_id, p_user_id,
        jsonb_build_object('transaction', v_old_tx, 'payment_rows', v_old_pays),
        jsonb_build_object('transaction', jsonb_build_object(
            'total_amount', v_new_total, 'subtotal', v_subtotal,
            'cash_amount', v_cash, 'transfer_amount', v_transfer, 'zelle_amount', v_zelle,
            'external_transfer_amount', v_zelle),
            'payment_rows', v_new_pays),
        jsonb_build_object('reason', p_reason, 'idempotency_key', btrim(p_idempotency_key))
    );

    RETURN jsonb_build_object(
        'status', 'success', 'transaction_id', p_transaction_id,
        'old_total', v_old_tx->>'total_amount', 'new_total', v_new_total,
        'new_cash', v_cash, 'new_zelle', v_zelle, 'new_external_transfer', v_zelle
    );
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. close_cash_shift
-- ═══════════════════════════════════════════════════════════════════════════

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

  SELECT COALESCE(SUM(COALESCE(zelle_amount, 0) + COALESCE(external_transfer_amount, 0)), 0) INTO v_zelle_sales
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
      AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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
      AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. get_cash_shift_expected
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): libro físico acumulado + residuo.
  v_phys_cup numeric := 0;
  v_phys_usd numeric := 0;
  v_valuation_residual numeric := 0;
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
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(COALESCE(zelle_amount, 0) + COALESCE(external_transfer_amount, 0)), 0)
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
      AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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
      AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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

  -- ═══ MISIÓN EFECTIVO FÍSICO (P0 2026-10-26) ═══
  -- Disponibilidad FÍSICA acumulada por moneda: la MISMA lectura que usan las
  -- autorizaciones del cajón (get_cash_currency_summary con tope 'infinity'
  -- — post-inserto, el movimiento ES un hecho físico). El saldo que la UI
  -- presenta como disponible es EXACTAMENTE el que los RPC de autorización
  -- exigen: una sola fuente de verdad, sin fórmulas por componente.
  SELECT
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'CUP')::numeric, 0),
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'USD')::numeric, 0)
    INTO v_phys_cup, v_phys_usd;

  -- Residuo de valoración: esperado canónico − libro físico CUP. NUNCA es
  -- efectivo disponible: recoge la valorización de flujos en otra moneda a
  -- tasas históricas (p. ej. cobros USD a tasa del ítem vs entrega a tasa
  -- vigente) y, con turno abierto, la base de apertura del turno. Informativo,
  -- trazable en el libro de movimientos; las salidas siguen autorizándose
  -- SOLO contra physical_cash por moneda (sin cambios en los reductores).
  v_valuation_residual := round(v_expected_cash - v_phys_cup, 2);

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
    'expected_total', v_expected_total,
    'physical_cash', jsonb_build_object(
      'CUP', round(v_phys_cup, 2),
      'USD', round(v_phys_usd, 2)
    ),
    'valuation_residual_cup', v_valuation_residual
  );
  RETURN v_result;
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 16. get_cash_flow_summary
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- MISIÓN EFECTIVO FÍSICO (P0 2026-10-26): libro físico acumulado + residuo.
  v_phys_cup numeric := 0;
  v_phys_usd numeric := 0;
  v_valuation_residual numeric := 0;
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
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(COALESCE(zelle_amount, 0) + COALESCE(external_transfer_amount, 0)), 0)
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
    WHERE store_id = p_store_id AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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
      AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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

  -- ═══ MISIÓN EFECTIVO FÍSICO (P0 2026-10-26) ═══
  -- Misma lectura acumulada por moneda que las autorizaciones del cajón
  -- (tope 'infinity': el inserto ES la entrega de billetes). Los KPIs de
  -- disponibilidad consumen ESTE campo — nunca expected_cash.
  SELECT
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'CUP')::numeric, 0),
    COALESCE((public.get_cash_currency_summary(
                p_store_id, NULL, 'infinity'::timestamptz)->'net'->>'USD')::numeric, 0)
    INTO v_phys_cup, v_phys_usd;

  -- Residuo de valoración (canónico − libro físico CUP): informativo, jamás
  -- disponible. Traza: cobros/entregas en otra moneda valorados a tasas
  -- históricas distintas sobre los MISMOS billetes.
  v_valuation_residual := round(v_expected_cash - v_phys_cup, 2);

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
    'physical_cash', jsonb_build_object(
      'CUP', round(v_phys_cup, 2),
      'USD', round(v_phys_usd, 2)
    ),
    'valuation_residual_cup', v_valuation_residual,
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
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 17. get_cash_report
-- ═══════════════════════════════════════════════════════════════════════════

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
  AND payment_method IN ('transfer', 'zelle', 'external_transfer')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_recoveries_cash_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'recovery' AND payment_method = 'cash'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_recoveries_voucher_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'recovery'
  AND payment_method IN ('transfer', 'zelle', 'external_transfer')
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
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 18. get_tenant_cash_report
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start timestamptz := COALESCE(p_start_date, date_trunc('day', now()) - interval '30 days');
  v_end timestamptz := COALESCE(p_end_date, now());
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS(
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only tenant owner or admin can view tenant reports';
  END IF;

  SELECT jsonb_build_object(
    'tenant_id', p_tenant_id,
    'start_date', v_start,
    'end_date', v_end,
    'stores_count', (SELECT COUNT(*) FROM public.stores WHERE tenant_id = p_tenant_id AND is_active = true),
    'total_sales', COALESCE((
      SELECT SUM(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_cash', COALESCE((
      SELECT SUM(cash_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_transfer', COALESCE((
      SELECT SUM(transfer_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_zelle', COALESCE((
      SELECT SUM(COALESCE(zelle_amount, 0) + COALESCE(external_transfer_amount, 0)) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'transaction_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'voided_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'voided' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'by_store', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'store_id', s.id, 'store_name', s.name,
        'sales', COALESCE(t.total, 0), 'count', COALESCE(t.cnt, 0)
      ))
      FROM public.stores s
      LEFT JOIN (
        SELECT store_id, SUM(total_amount) as total, COUNT(*) as cnt
        FROM public.transactions
        WHERE status = 'completed' AND created_at BETWEEN v_start AND v_end
        GROUP BY store_id
      ) t ON t.store_id = s.id
      WHERE s.tenant_id = p_tenant_id AND s.is_active = true
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 19. get_transactions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_transactions(p_store_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text, p_date_from timestamp without time zone DEFAULT NULL::timestamp without time zone, p_date_to timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 1000)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, total_amount numeric, status text, payment_method text, subtotal numeric, discount_value numeric, store_id uuid, seller_id uuid, seller_name text, cash_amount numeric, transfer_amount numeric, zelle_amount numeric, external_transfer_amount numeric, sale_currency text, sale_exchange_rate numeric, completed_at timestamp with time zone, customer_name text, customer_code text, customer_address text, invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_admin boolean;
BEGIN
    v_user_id := auth.uid();
    v_is_admin := public.is_admin();

    IF p_limit IS NULL THEN
        p_limit := 1000;
    END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.created_at,
        t.total_amount,
        t.status::text,
        t.payment_method::text,
        t.subtotal,
        t.discount_value,
        t.store_id,
        t.seller_id,
        p.full_name as seller_name,
        t.cash_amount,
        t.transfer_amount,
        t.zelle_amount,
        t.external_transfer_amount,
        t.sale_currency,
        t.sale_exchange_rate,
        t.completed_at,
        t.customer_name,
        -- CLASIFICATOR-PARTIES: snapshot del comprador (copia histórica)
        t.customer_code,
        t.customer_address,
        t.invoice_number
    FROM public.transactions t
    LEFT JOIN public.profiles p ON t.seller_id = p.id
    WHERE
        (v_is_admin OR public.has_store_access(t.store_id))
        AND (p_store_id IS NULL OR t.store_id = p_store_id)
        AND (p_date_from IS NULL OR t.created_at >= p_date_from)
        AND (p_date_to IS NULL OR t.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR p.full_name ILIKE ('%' || p_search_term || '%')
            OR t.id::text ILIKE ('%' || p_search_term || '%')
        )
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$function$

-- ═══════════════════════════════════════════════════════════════════════════
-- 20. get_sales_dashboard_analytics
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_dashboard_analytics(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_prev_from timestamp with time zone, p_prev_to timestamp with time zone, p_seller_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_limit_products integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_store_ids uuid[];
  v_from timestamptz := p_date_from;
  v_to timestamptz := p_date_to;
  v_prev_from timestamptz := p_prev_from;
  v_prev_to timestamptz := p_prev_to;
  v_result jsonb;
  v_limit_products integer := GREATEST(3, LEAST(COALESCE(p_limit_products, 8), 20));
BEGIN
  -- ── Guards (gate CI Check 1: auth.uid; aislamiento por tienda) ──────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: sesión requerida' USING ERRCODE = '42501';
  END IF;

  IF p_store_id IS NOT NULL THEN
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: sin acceso a la tienda %', p_store_id USING ERRCODE = '42501';
    END IF;
    v_store_ids := ARRAY[p_store_id];
  ELSE
    -- Sin tienda concreta: SOLO las tiendas del usuario (jamás se mezclan
    -- tiendas sin permiso — superadmin ve todas, admin su tenant, resto
    -- sus membresías activas).
    SELECT COALESCE(array_agg(s), '{}') INTO v_store_ids
      FROM public.current_user_store_ids() AS s;
    IF array_length(v_store_ids, 1) IS NULL THEN
      v_store_ids := '{}';
    END IF;
  END IF;

  IF v_from IS NULL OR v_to IS NULL OR v_to < v_from THEN
    RAISE EXCEPTION 'ERR_INVALID_PERIOD: p_date_from/p_date_to inválidos';
  END IF;

  WITH

  -- ── Ventas válidas del período (ventana actual) ─────────────────────────
  sales AS (
    SELECT t.id, t.store_id, t.seller_id, t.subtotal, t.discount_value,
           t.tax_amount, t.total_amount, t.payment_method, t.completed_at,
           t.payment_incidents, t.created_at
      FROM public.transactions t
     WHERE t.status::text = COALESCE(NULLIF(p_status, ''), 'completed')
       AND t.completed_at >= v_from AND t.completed_at <= v_to
       AND t.store_id = ANY(v_store_ids)
       AND (p_seller_id IS NULL OR t.seller_id = p_seller_id)
       AND (p_status IS NULL OR p_status = '' OR t.status::text = p_status)
       AND (p_payment_method IS NULL OR p_payment_method = ''
            OR t.payment_method::text = p_payment_method)
  ),

  -- ── Serie temporal: buckets completos (generate_series) en Havana ───────
  -- Granularidad: hora (≤3d), día (≤62d), semana (≤180d), mes (resto).
  gran AS (
    SELECT CASE
      WHEN (v_to - v_from) <= interval '3 days' THEN 'hour'
      WHEN (v_to - v_from) <= interval '62 days' THEN 'day'
      WHEN (v_to - v_from) <= interval '180 days' THEN 'week'
      ELSE 'month'
    END AS unit
  ),
  buckets AS (
    SELECT gs AS bucket_start
      FROM gran, generate_series(
        date_trunc((SELECT unit FROM gran), v_from AT TIME ZONE 'America/Havana') AT TIME ZONE 'America/Havana',
        v_to,
        CASE (SELECT unit FROM gran)
          WHEN 'hour' THEN interval '1 hour'
          WHEN 'day' THEN interval '1 day'
          WHEN 'week' THEN interval '1 week'
          ELSE interval '1 month'
        END
      ) AS gs
  ),
  sales_bucketed AS (
    SELECT b.bucket_start,
           COUNT(s.id) AS ops,
           COALESCE(SUM(s.subtotal), 0) AS gross,
           COALESCE(SUM(s.total_amount), 0) AS net,
           COALESCE(SUM(s.discount_value), 0) AS discounts
      FROM buckets b
      LEFT JOIN sales s
        ON date_trunc((SELECT unit FROM gran), s.completed_at AT TIME ZONE 'America/Havana')
           AT TIME ZONE 'America/Havana' = b.bucket_start
     GROUP BY b.bucket_start
  ),

  -- ── Devoluciones del período (documento NC; en SU moneda) ──────────────
  devos AS (
    SELECT d.id, d.store_id, d.original_transaction_id, d.total_amount,
           d.currency, d.processed_by, d.created_at, d.status
      FROM public.devolutions d
     WHERE d.status = 'completed'
       AND d.created_at >= v_from AND d.created_at <= v_to
       AND d.store_id = ANY(v_store_ids)
  ),

  -- ── Unidades: líneas de ventas válidas / líneas de devolución ───────────
  item_units AS (
    SELECT ti.product_id, SUM(ti.quantity) AS units
      FROM public.transaction_items ti
      JOIN sales s ON s.id = ti.transaction_id
     GROUP BY ti.product_id
  ),
  devo_units AS (
    SELECT di.product_id, SUM(di.quantity) AS units
      FROM public.devolution_items di
      JOIN devos d ON d.id = di.devolution_id
     GROUP BY di.product_id
  ),

  -- ── Cobros reales (fuente autoritativa, por moneda) ─────────────────────
  payments AS (
    SELECT pt.payment_method, pt.currency, pt.amount, pt.amount_cup,
           pt.transaction_id, s.seller_id, s.payment_method AS sale_method
      FROM public.payment_transactions pt
      JOIN sales s ON s.id = pt.transaction_id
     WHERE pt.ref_type = 'sale' AND pt.direction = 'in'
  ),

  -- ── Ventas válidas del período ANTERIOR equivalente (mismos filtros) ────
  sales_prev AS (
    SELECT t.id, t.store_id, t.subtotal, t.discount_value, t.total_amount, t.seller_id,
           t.payment_method
      FROM public.transactions t
     WHERE t.status::text = COALESCE(NULLIF(p_status, ''), 'completed')
       AND t.completed_at >= v_prev_from AND t.completed_at <= v_prev_to
       AND t.store_id = ANY(v_store_ids)
       AND (p_seller_id IS NULL OR t.seller_id = p_seller_id)
       AND (p_status IS NULL OR p_status = '' OR t.status::text = p_status)
       AND (p_payment_method IS NULL OR p_payment_method = ''
            OR t.payment_method::text = p_payment_method)
  ),
  devos_prev AS (
    SELECT d.id, d.total_amount, d.currency
      FROM public.devolutions d
     WHERE d.status = 'completed'
       AND d.created_at >= v_prev_from AND d.created_at <= v_prev_to
       AND d.store_id = ANY(v_store_ids)
  ),
  payments_prev AS (
    SELECT pt.payment_method, pt.currency, pt.amount
      FROM public.payment_transactions pt
      JOIN sales_prev sp ON sp.id = pt.transaction_id
     WHERE pt.ref_type = 'sale' AND pt.direction = 'in'
  ),

  -- ── Totales del período actual ──────────────────────────────────────────
  totals AS (
    SELECT
      COUNT(s.id) AS ops,
      COALESCE(SUM(s.subtotal), 0) AS gross,
      COALESCE(SUM(s.discount_value), 0) AS discounts,
      COALESCE(SUM(s.tax_amount), 0) AS taxes,
      COALESCE(SUM(s.total_amount), 0) AS net
    FROM sales s
  ),
  devo_totals AS (
    SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE currency = 'CUP'), 0) AS cup,
      COALESCE(SUM(total_amount) FILTER (WHERE currency = 'USD'), 0) AS usd
    FROM devos
  ),
  pay_totals AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE currency = 'USD' AND payment_method IN ('zelle', 'external_transfer')), 0) AS usd,
      COALESCE(SUM(amount_cup), 0) AS cup_equiv,
      COUNT(*) AS rows
    FROM payments
  ),

  -- ── Totales del período anterior ────────────────────────────────────────
  totals_prev AS (
    SELECT COUNT(sp.id) AS ops,
           COALESCE(SUM(sp.subtotal), 0) AS gross,
           COALESCE(SUM(sp.discount_value), 0) AS discounts,
           COALESCE(SUM(sp.total_amount), 0) AS net
    FROM sales_prev sp
  ),
  devo_totals_prev AS (
    SELECT COALESCE(SUM(total_amount) FILTER (WHERE currency = 'CUP'), 0) AS cup,
           COALESCE(SUM(total_amount) FILTER (WHERE currency = 'USD'), 0) AS usd
    FROM devos_prev
  ),
  pay_totals_prev AS (
    SELECT COALESCE(SUM(amount) FILTER (WHERE currency = 'USD' AND payment_method IN ('zelle', 'external_transfer')), 0) AS usd
    FROM payments_prev
  ),

  -- ── Rendimiento por vendedor (ventas + devoluciones por venta original) ─
  seller_rows AS (
    SELECT
      s.seller_id,
      p.full_name AS seller_name,
      COUNT(*) AS ops,
      COALESCE(SUM(s.subtotal), 0) AS gross,
      COALESCE(SUM(s.discount_value), 0) AS discounts,
      COALESCE(SUM(s.total_amount), 0) AS net
    FROM sales s
    LEFT JOIN public.profiles p ON p.id = s.seller_id
    GROUP BY s.seller_id, p.full_name
  ),
  seller_devo AS (
    SELECT t.seller_id, COALESCE(SUM(d.total_amount), 0) AS devolutions_cup
      FROM devos d
      JOIN public.transactions t ON t.id = d.original_transaction_id
     WHERE d.currency = 'CUP'
     GROUP BY t.seller_id
  ),
  sellers AS (
    -- Participación sobre las ventas NETAS del ámbito filtrado (total
    -- comparable): neto del vendedor tras sus devoluciones ÷ neto total.
    SELECT sr.*, COALESCE(sd.devolutions_cup, 0) AS devolutions_cup,
           CASE WHEN (SELECT net FROM totals) > 0
                THEN ROUND(100.0 * (sr.net - COALESCE(sd.devolutions_cup, 0))
                           / (SELECT net FROM totals), 2)
                ELSE 0 END AS participation_pct
      FROM seller_rows sr
      LEFT JOIN seller_devo sd ON sd.seller_id = sr.seller_id
  ),

  -- ── Rendimiento por TIENDA (REFINEMENT-002 §3.2) ────────────────────────
  -- Mismos indicadores que sellers, agregados por tienda del ámbito, más
  -- unidades vendidas y variación vs período anterior equivalente.
  -- Participación sobre las netas del ámbito (mismo criterio que sellers).
  store_rows AS (
    SELECT
      s.store_id,
      COUNT(*) AS ops,
      COALESCE(SUM(s.subtotal), 0) AS gross,
      COALESCE(SUM(s.discount_value), 0) AS discounts,
      COALESCE(SUM(s.total_amount), 0) AS net
    FROM sales s
    GROUP BY s.store_id
  ),
  store_devo AS (
    SELECT d.store_id, COALESCE(SUM(d.total_amount), 0) AS devolutions_cup
      FROM devos d
     WHERE d.currency = 'CUP'
     GROUP BY d.store_id
  ),
  store_units AS (
    SELECT s.store_id, COALESCE(SUM(ti.quantity), 0) AS units_sold
      FROM public.transaction_items ti
      JOIN sales s ON s.id = ti.transaction_id
     GROUP BY s.store_id
  ),
  store_rows_prev AS (
    SELECT sp.store_id,
           COUNT(*) AS ops,
           COALESCE(SUM(sp.total_amount), 0) AS net
      FROM sales_prev sp
     GROUP BY sp.store_id
  ),
  store_perf AS (
    SELECT
      sr.store_id,
      sr.ops, sr.gross, sr.discounts, sr.net,
      COALESCE(sd.devolutions_cup, 0) AS devolutions_cup,
      COALESCE(su.units_sold, 0) AS units_sold,
      COALESCE(srp.ops, 0) AS prev_ops,
      COALESCE(srp.net, 0) AS prev_net
    FROM store_rows sr
    LEFT JOIN store_devo sd ON sd.store_id = sr.store_id
    LEFT JOIN store_units su ON su.store_id = sr.store_id
    LEFT JOIN store_rows_prev srp ON srp.store_id = sr.store_id
  ),
  stores_agg AS (
    SELECT
      sp.store_id,
      st.name AS store_name,
      sp.ops, sp.gross, sp.discounts, sp.net, sp.devolutions_cup, sp.units_sold,
      CASE WHEN sp.ops > 0 THEN sp.net / sp.ops ELSE 0 END AS avg_ticket,
      CASE WHEN (SELECT net FROM totals) > 0
           THEN ROUND(100.0 * (sp.net - sp.devolutions_cup) / (SELECT net FROM totals), 2)
           ELSE 0 END AS participation_pct,
      -- Variación % de netas vs período anterior (NULL sin base previa:
      -- la UI muestra «sin datos previos», nunca un % fabricado).
      CASE WHEN sp.prev_net > 0
           THEN ROUND(100.0 * ((sp.net - sp.devolutions_cup) - sp.prev_net) / sp.prev_net, 2)
           ELSE NULL END AS net_change_pct
    FROM store_perf sp
    JOIN public.stores st ON st.id = sp.store_id
  ),

  -- ── Evolución por tienda (REFINEMENT-002 §3.2/§4): mismo bucketing que
  -- series, una fila por bucket × tienda con ventas (el cliente pivota). ──
  stores_bucketed AS (
    SELECT b.bucket_start,
           s.store_id,
           COUNT(s.id) AS ops,
           COALESCE(SUM(s.total_amount), 0) AS net
      FROM buckets b
      JOIN sales s
        ON date_trunc((SELECT unit FROM gran), s.completed_at AT TIME ZONE 'America/Havana')
           AT TIME ZONE 'America/Havana' = b.bucket_start
     GROUP BY b.bucket_start, s.store_id
  ),

  -- ── Productos: neto por producto (CUP contable, neto de descuento línea) ─
  product_net AS (
    SELECT ti.product_id,
           pr.name AS product_name,
           pr.sku,
           SUM(ti.quantity) AS units,
           SUM(GREATEST(ti.quantity * ti.price_at_sale_cup - COALESCE(ti.item_discount_value, 0), 0)) AS net_cup
      FROM public.transaction_items ti
      JOIN sales s ON s.id = ti.transaction_id
      LEFT JOIN public.products pr ON pr.id = ti.product_id
     GROUP BY ti.product_id, pr.name, pr.sku
  ),
  product_units AS (
    SELECT COALESCE(u.product_id, du.product_id) AS product_id,
           COALESCE(u.units, 0) AS sold_units,
           COALESCE(du.units, 0) AS returned_units
      FROM item_units u
      FULL OUTER JOIN devo_units du ON du.product_id = u.product_id
  ),
  products_agg AS (
    SELECT COALESCE(pn.product_id, pu.product_id) AS product_id,
           COALESCE(pn.product_name, pr2.name) AS product_name,
           COALESCE(pn.sku, pr2.sku) AS sku,
           COALESCE(pu.sold_units, 0) AS units_sold,
           COALESCE(pu.returned_units, 0) AS units_returned,
           COALESCE(pn.net_cup, 0) AS net_cup
      FROM product_net pn
      FULL OUTER JOIN product_units pu ON pu.product_id = pn.product_id
      LEFT JOIN public.products pr2 ON pr2.id = COALESCE(pn.product_id, pu.product_id)
  ),
  total_product_net AS (
    SELECT COALESCE(SUM(net_cup), 0) AS total FROM products_agg WHERE net_cup > 0
  ),
  top_products AS (
    SELECT pa.product_id, pa.product_name, pa.sku, pa.units_sold,
           pa.units_returned, pa.net_cup,
           CASE WHEN (SELECT total FROM total_product_net) > 0
                THEN ROUND(100.0 * pa.net_cup / (SELECT total FROM total_product_net), 2)
                ELSE 0 END AS participation_pct
      FROM products_agg pa
     ORDER BY pa.net_cup DESC, pa.units_sold DESC
     LIMIT v_limit_products
  ),
  top_units AS (
    SELECT product_id, product_name, sku, units_sold, units_returned, net_cup
      FROM products_agg
     ORDER BY units_sold DESC, net_cup DESC
     LIMIT v_limit_products
  ),
  -- Menor movimiento: catálogo activo del ámbito SIN actividad (0 unidades)
  -- o por debajo del percentil 25 de unidades vendidas del período.
  active_catalog AS (
    SELECT pr.id, pr.name, pr.sku
      FROM public.products pr
     WHERE pr.is_active = true
       AND pr.status = 'ACTIVE'
       AND pr.store_id = ANY(v_store_ids)
       AND pr.is_service = false
  ),
  sold_stats AS (
    SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY units_sold), 0) AS p25
      FROM products_agg WHERE units_sold > 0
  ),
  low_movement AS (
    SELECT ac.id AS product_id, ac.name AS product_name, ac.sku,
           COALESCE(pu.sold_units, 0) AS units_sold
      FROM active_catalog ac
      LEFT JOIN product_units pu ON pu.product_id = ac.id
     WHERE COALESCE(pu.sold_units, 0) = 0
        OR COALESCE(pu.sold_units, 0) <= (SELECT p25 FROM sold_stats)
     ORDER BY COALESCE(pu.sold_units, 0) ASC, ac.name ASC
     LIMIT v_limit_products
  ),

  -- ── Métodos de pago: facturado (documento) vs cobrado (payment_transactions)
  method_doc AS (
    SELECT s.payment_method::text AS method,
           COUNT(*) AS ops,
           COALESCE(SUM(s.total_amount), 0) AS amount_cup
      FROM sales s
     GROUP BY s.payment_method
  ),
  method_pay AS (
    SELECT pt.payment_method AS method,
           pt.currency,
           COUNT(DISTINCT pt.transaction_id) AS ops,
           COALESCE(SUM(pt.amount), 0) AS amount
      FROM payments pt
     GROUP BY pt.payment_method, pt.currency
  ),

  -- ── Horario: día de semana × hora (America/Havana) ──────────────────────
  heatmap AS (
    SELECT EXTRACT(ISODOW FROM s.completed_at AT TIME ZONE 'America/Havana')::int AS dow,
           EXTRACT(HOUR FROM s.completed_at AT TIME ZONE 'America/Havana')::int AS hour,
           COUNT(*) AS ops,
           COALESCE(SUM(s.total_amount), 0) AS net
      FROM sales s
     GROUP BY 1, 2
  ),

  -- ── Alertas ──────────────────────────────────────────────────────────────
  doc_status_counts AS (
    SELECT t.status::text AS status, COUNT(*) AS ops,
           COALESCE(SUM(t.total_amount), 0) AS amount
      FROM public.transactions t
     WHERE t.completed_at >= v_from AND t.completed_at <= v_to
       AND t.store_id = ANY(v_store_ids)
       AND t.status IN ('voided', 'reversed', 'pending', 'failed', 'cancelled', 'compensated', 'refunded')
     GROUP BY t.status
  ),
  incident_sales AS (
    SELECT COUNT(*) AS ops
      FROM sales s
     WHERE s.payment_incidents IS NOT NULL
       AND s.payment_incidents::text NOT IN ('null', '[]', '{}', '')
  ),
  sync_log_alerts AS (
    SELECT sl.status AS status, COUNT(*) AS ops
      FROM public.sync_log sl
     WHERE sl.created_at >= v_from AND sl.created_at <= v_to
       AND sl.entity = 'sale'
       AND sl.status IN ('error', 'conflict')
       AND sl.store_id = ANY(v_store_ids)
     GROUP BY sl.status
  ),
  -- Conciliación: ventas válidas sin pagos registrados o con diferencia > 0.05
  unreconciled AS (
    SELECT COUNT(*) AS ops,
           COALESCE(SUM(s.total_amount - COALESCE(pt.sum_cup, 0)), 0) AS diff
      FROM sales s
      LEFT JOIN (
        SELECT transaction_id, SUM(amount_cup) AS sum_cup
          FROM public.payment_transactions
         WHERE ref_type = 'sale' AND direction = 'in'
         GROUP BY transaction_id
      ) pt ON pt.transaction_id = s.id
     WHERE COALESCE(pt.sum_cup, 0) = 0
        OR ABS(s.total_amount - COALESCE(pt.sum_cup, 0)) > 0.05
  )

  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to,
      'granularity', (SELECT unit FROM gran),
      'prev_from', v_prev_from, 'prev_to', v_prev_to),
    'kpi', jsonb_build_object(
      'ops', (SELECT ops FROM totals),
      'gross_cup', (SELECT ROUND(gross, 2) FROM totals),
      'discounts_cup', (SELECT ROUND(discounts, 2) FROM totals),
      'taxes_cup', (SELECT ROUND(taxes, 2) FROM totals),
      'net_cup', (SELECT ROUND(net, 2) FROM totals),
      'devolutions_cup', (SELECT ROUND(cup, 2) FROM devo_totals),
      'devolutions_usd', (SELECT ROUND(usd, 2) FROM devo_totals),
      'collected_usd', (SELECT ROUND(usd, 2) FROM pay_totals),
      'collected_cup_equiv', (SELECT ROUND(cup_equiv, 2) FROM pay_totals),
      'avg_ticket_cup', (SELECT CASE WHEN ops > 0 THEN ROUND(net / ops, 2) ELSE 0 END FROM totals),
      'units_sold', (SELECT COALESCE(SUM(units), 0) FROM item_units),
      'units_returned', (SELECT COALESCE(SUM(units), 0) FROM devo_units),
      'prev', jsonb_build_object(
        'ops', (SELECT ops FROM totals_prev),
        'gross_cup', (SELECT ROUND(gross, 2) FROM totals_prev),
        'discounts_cup', (SELECT ROUND(discounts, 2) FROM totals_prev),
        'net_cup', (SELECT ROUND(net, 2) FROM totals_prev),
        'devolutions_cup', (SELECT ROUND(cup, 2) FROM devo_totals_prev),
        'devolutions_usd', (SELECT ROUND(usd, 2) FROM devo_totals_prev),
        'collected_usd', (SELECT ROUND(usd, 2) FROM pay_totals_prev),
        'avg_ticket_cup', (SELECT CASE WHEN ops > 0 THEN ROUND(net / ops, 2) ELSE 0 END FROM totals_prev)
      )
    ),
    'series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'bucket', to_char(bucket_start AT TIME ZONE 'America/Havana', 'YYYY-MM-DD HH24:MI'),
        'ops', ops, 'gross_cup', ROUND(gross, 2), 'net_cup', ROUND(net, 2),
        'discounts_cup', ROUND(discounts, 2)
      ) ORDER BY bucket_start), '[]'::jsonb)
      FROM sales_bucketed
    ),
    'sellers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'seller_id', seller_id, 'name', COALESCE(seller_name, 'Usuario'),
        'ops', ops, 'gross_cup', ROUND(gross, 2), 'discounts_cup', ROUND(discounts, 2),
        'devolutions_cup', ROUND(devolutions_cup, 2),
        'net_cup', ROUND(net, 2),
        'avg_ticket_cup', CASE WHEN ops > 0 THEN ROUND(net / ops, 2) ELSE 0 END,
        'participation_pct', participation_pct
      ) ORDER BY net DESC), '[]'::jsonb)
      FROM sellers
    ),
    'stores', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'store_id', store_id, 'name', store_name,
        'ops', ops, 'gross_cup', ROUND(gross, 2),
        'discounts_cup', ROUND(discounts, 2),
        'devolutions_cup', ROUND(devolutions_cup, 2),
        'net_cup', ROUND(net, 2),
        'avg_ticket_cup', ROUND(avg_ticket, 2),
        'units_sold', ROUND(units_sold, 2),
        'participation_pct', participation_pct,
        'net_change_pct', net_change_pct
      ) ORDER BY net DESC), '[]'::jsonb)
      FROM stores_agg
    ),
    'stores_series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'bucket', to_char(bucket_start AT TIME ZONE 'America/Havana', 'YYYY-MM-DD HH24:MI'),
        'store_id', store_id,
        'ops', ops, 'net_cup', ROUND(net, 2)
      ) ORDER BY bucket_start, store_id), '[]'::jsonb)
      FROM stores_bucketed
    ),
    'accessible_stores', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name
      ) ORDER BY s.name), '[]'::jsonb)
      FROM public.stores s
     WHERE s.id = ANY(v_store_ids)
    ),
    'products', jsonb_build_object(
      'top_net', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY rn), '[]'::jsonb) FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY net_cup DESC) AS rn, 'net' AS kind,
               product_id, product_name AS name, sku, units_sold, units_returned,
               ROUND(net_cup, 2) AS net_cup, participation_pct FROM top_products) x),
      'top_units', (SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY rn), '[]'::jsonb) FROM (
        SELECT ROW_NUMBER() OVER (ORDER BY units_sold DESC) AS rn, 'units' AS kind,
               product_id, product_name AS name, sku, units_sold, units_returned,
               ROUND(net_cup, 2) AS net_cup FROM top_units) x),
      'low_movement', (SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) FROM (
        SELECT product_id, product_name AS name, sku, units_sold FROM low_movement) x),
      'total_net_cup', (SELECT ROUND(total, 2) FROM total_product_net)
    ),
    'payment_methods', jsonb_build_object(
      'by_document', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'method', method, 'ops', ops, 'amount_cup', ROUND(amount_cup, 2)
        ) ORDER BY amount_cup DESC), '[]'::jsonb) FROM method_doc),
      'by_collection', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'method', method, 'currency', currency, 'ops', ops,
          'amount', ROUND(amount, 2)
        ) ORDER BY amount DESC), '[]'::jsonb) FROM method_pay)
    ),
    'heatmap', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'dow', dow, 'hour', hour, 'ops', ops, 'net_cup', ROUND(net, 2)
      )), '[]'::jsonb) FROM heatmap
    ),
    'alerts', jsonb_build_object(
      'doc_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', status, 'ops', ops, 'amount_cup', ROUND(amount, 2)
      )), '[]'::jsonb) FROM doc_status_counts),
      'devolutions_count', (SELECT COUNT(*) FROM devos),
      'devolutions_cup', (SELECT ROUND(cup, 2) FROM devo_totals),
      'devolutions_usd', (SELECT ROUND(usd, 2) FROM devo_totals),
      'incident_sales', (SELECT ops FROM incident_sales),
      'sync_log', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'status', status, 'ops', ops)), '[]'::jsonb) FROM sync_log_alerts),
      'unreconciled_ops', (SELECT ops FROM unreconciled),
      'unreconciled_diff_cup', (SELECT ROUND(diff, 2) FROM unreconciled)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$


-- ═══════════════════════════════════════════════════════════════════════════
-- 21. Reglas VENTA v4 — contrato canónico external_transfer (idempotente por
--     marcador de notas; las ramas zelle quedan como HEREDAD documentada para
--     la re-derivación de datos pre-normalización — ambas imputan la misma
--     cuenta ACT_TRANSF_EXTERIOR, sin segunda convención).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'VENTA' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-004%') THEN
    RAISE NOTICE 'VENTA: regla CP-FIN-004 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por la regla CP-FIN-004 (contrato canónico external_transfer).'
      WHERE document_type = 'VENTA' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'VENTA', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"v-cash-cup","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_cup"},"condicion":{"campo":"cob_cash_cup","op":">","valor":0},"orden":1},
      {"id":"v-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_usd_cup"},"condicion":{"campo":"cob_cash_usd_cup","op":">","valor":0},"orden":2},
      {"id":"v-cash-eur","evento":"reconocimiento","categoria":"ACT_EFECTIVO_EUR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_eur_cup"},"condicion":{"campo":"cob_cash_eur_cup","op":">","valor":0},"orden":3},
      {"id":"v-cash-mlc","evento":"reconocimiento","categoria":"ACT_EFECTIVO_MLC","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_cash_mlc_cup"},"condicion":{"campo":"cob_cash_mlc_cup","op":">","valor":0},"orden":4},
      {"id":"v-transf-cup","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_cup"},"condicion":{"campo":"cob_transfer_cup","op":">","valor":0},"orden":5},
      {"id":"v-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_usd_cup"},"condicion":{"campo":"cob_transfer_usd_cup","op":">","valor":0},"orden":6},
      {"id":"v-transf-eur","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_eur_cup"},"condicion":{"campo":"cob_transfer_eur_cup","op":">","valor":0},"orden":7},
      {"id":"v-transf-mlc","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_transfer_mlc_cup"},"condicion":{"campo":"cob_transfer_mlc_cup","op":">","valor":0},"orden":8},
      {"id":"v-ext-usd","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_external_transfer_usd_cup"},"condicion":{"campo":"cob_external_transfer_usd_cup","op":">","valor":0},"orden":9},
      {"id":"v-ext-eur","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_external_transfer_eur_cup"},"condicion":{"campo":"cob_external_transfer_eur_cup","op":">","valor":0},"orden":10},
      {"id":"v-zelle","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_zelle_usd_cup"},"condicion":{"campo":"cob_zelle_usd_cup","op":">","valor":0},"orden":11},
      {"id":"v-zelle-eur","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"debito","origen":{"tipo":"metrica","metrica":"cob_zelle_eur_cup"},"condicion":{"campo":"cob_zelle_eur_cup","op":">","valor":0},"orden":12},
      {"id":"v-ingreso","evento":"reconocimiento","categoria":"ING_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":13},
      {"id":"v-cogs-d","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":14},
      {"id":"v-cogs-c","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_productos_cup"},"condicion":{"campo":"costo_productos_cup","op":">","valor":0},"orden":15},
      {"id":"v-desc-debe","evento":"reconocimiento","categoria":"ING_DESCUENTOS","sentido":"debito","origen":{"tipo":"metrica","metrica":"diferencia_cobro_debe_cup"},"condicion":{"campo":"diferencia_cobro_debe_cup","op":">","valor":0},"orden":16},
      {"id":"v-desc-haber","evento":"reconocimiento","categoria":"ING_DESCUENTOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"diferencia_cobro_haber_cup"},"condicion":{"campo":"diferencia_cobro_haber_cup","op":">","valor":0},"orden":17}
    ]'::jsonb, CURRENT_DATE,
      'CP-FIN-004: contrato canónico external_transfer (Transf. Exterior) — el POS de 3 opciones es la referencia. Cobros por (medio × moneda); ramas zelle HEREDADAS (pre-normalización) imputan la misma ACT_TRANSF_EXTERIOR. Diferencias de cobro M-015 conservadas.'
    FROM public.fin_rule_versions WHERE document_type = 'VENTA' AND store_id IS NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 22. Regla DEVOLUCION_VENTA v3 — reembolsos exterior canónicos (heredado
--     zelle conservado; misma cuenta).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_rule_versions
             WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL
               AND notes LIKE '%CP-FIN-004%') THEN
    RAISE NOTICE 'DEVOLUCION_VENTA: regla CP-FIN-004 ya presente — omisión idempotente';
  ELSE
    UPDATE public.fin_rule_versions
      SET status = 'inactive', deactivated_at = now(),
          notes = coalesce(notes, '') || ' | Sustituida por la regla CP-FIN-004 (contrato canónico external_transfer).'
      WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL AND status = 'active';
    INSERT INTO public.fin_rule_versions (document_type, store_id, version, status, movements, effective_from, notes)
    SELECT 'DEVOLUCION_VENTA', NULL, coalesce(max(version), 0) + 1, 'active', '[
      {"id":"d-ref-cash","evento":"reconocimiento","categoria":"ACT_EFECTIVO_CUP","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_cup"},"condicion":{"campo":"reembolso_cash_cup","op":">","valor":0},"orden":1},
      {"id":"d-ref-cash-usd","evento":"reconocimiento","categoria":"ACT_EFECTIVO_USD","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_cash_usd_cup"},"condicion":{"campo":"reembolso_cash_usd_cup","op":">","valor":0},"orden":2},
      {"id":"d-ref-transf","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_cup"},"condicion":{"campo":"reembolso_transfer_cup","op":">","valor":0},"orden":3},
      {"id":"d-ref-transf-usd","evento":"reconocimiento","categoria":"ACT_BANCOS","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_transfer_usd_cup"},"condicion":{"campo":"reembolso_transfer_usd_cup","op":">","valor":0},"orden":4},
      {"id":"d-ref-ext-usd","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_external_transfer_usd_cup"},"condicion":{"campo":"reembolso_external_transfer_usd_cup","op":">","valor":0},"orden":5},
      {"id":"d-ref-zelle","evento":"reconocimiento","categoria":"ACT_TRANSF_EXTERIOR","sentido":"credito","origen":{"tipo":"metrica","metrica":"reembolso_zelle_usd_cup"},"condicion":{"campo":"reembolso_zelle_usd_cup","op":">","valor":0},"orden":6},
      {"id":"d-inv-d","evento":"reconocimiento","categoria":"ACT_INVENTARIO","sentido":"debito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":7},
      {"id":"d-cogs-c","evento":"reconocimiento","categoria":"GAS_COSTO_VENTAS","sentido":"credito","origen":{"tipo":"metrica","metrica":"costo_devuelto_cup"},"condicion":{"campo":"costo_devuelto_cup","op":">","valor":0},"orden":8},
      {"id":"d-ing-d","evento":"reconocimiento","categoria":"ING_VENTAS","sentido":"debito","origen":{"tipo":"metrica","metrica":"total_cup"},"condicion":null,"orden":9},
      {"id":"d-credit","evento":"reconocimiento","categoria":"PAS_CREDITO_TIENDA","sentido":"credito","origen":{"tipo":"metrica","metrica":"store_credit_cup"},"condicion":{"campo":"store_credit_cup","op":">","valor":0},"orden":10}
    ]'::jsonb, CURRENT_DATE,
      'CP-FIN-004: reembolsos con el contrato canónico external_transfer (heredado zelle conservado, misma cuenta exterior).'
    FROM public.fin_rule_versions WHERE document_type = 'DEVOLUCION_VENTA' AND store_id IS NULL;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 23. Normalizador histórico de ENERVIDA (idempotente, con guardas y
--     auditoría). NO se ejecuta en esta migración: la regla de oro (11g del
--     protocolo) exige validarlo en la BD aislada (E2E lo invoca con fixtures)
--     y aplicarlo a producción UNA SOLA VEZ, en la secuencia controlada
--     M1 → M2 → verificar → NORMALIZAR → GEN-2 (create/build/validate/activate).
--
--     Evidencia de negocio (declaración del propietario, anexo §4): las
--     ÚNICAS ventas Zelle (Transf. Exterior + USD) son las tres identificadas;
--     todas las demás ventas USD se cobraron en EFECTIVO. Identificación
--     inequívoca: expediente docs/audits/cp-fin004-external-transfer-contract/
--     (pares idénticos resueltos por orden del registro original — los
--     estados financieros son invariantes a la elección, documentada).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cp_fin004_normalize_enervida_payments(
  p_store_id uuid DEFAULT '5e6fe821-5465-48b1-b3f1-3aa3182edc38',
  p_exterior_sales uuid[] DEFAULT ARRAY[
    '9033864b-2c13-4aa3-b2b8-2fd645a190db',
    '3d19e5e7-2080-4eb1-8eca-cf7e391f30b9',
    '1a03c37f-3a9b-4c5a-912c-3958ebbaf91c']::uuid[],
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_exists boolean;
  v_sale_id uuid;
  v_method text;
  v_n_ext int := 0;
  v_n_cash int := 0;
  v_n_works int := 0;
  v_usd_ext numeric := 0;
  v_usd_cash numeric := 0;
  v_residual int;
  v_residual_hdr int;
  v_sale record;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RETURN jsonb_build_object('status', 'SKIP_STORE_NOT_FOUND', 'store_id', p_store_id);
  END IF;

  -- Idempotencia global (auditoría de la normalización ya registrada)
  IF EXISTS (SELECT 1 FROM public.audit_logs
             WHERE action = 'CP_FIN004_NORMALIZE' AND record_id = p_store_id) THEN
    RETURN jsonb_build_object('status', 'YA_APLICADO', 'store_id', p_store_id);
  END IF;

  -- ── A. Las 3 ventas declaradas Transf. Exterior (Zelle): zelle → external_transfer ──
  FOREACH v_sale_id IN ARRAY p_exterior_sales LOOP
    IF EXISTS (SELECT 1 FROM public.transactions WHERE id = v_sale_id AND store_id = p_store_id) THEN
      UPDATE public.payment_transactions
        SET payment_method = 'external_transfer',
            notes = CASE WHEN coalesce(notes, '') = ''
                         THEN 'CP-FIN-004: rectificado zelle → external_transfer (Transf. Exterior — declaración del propietario)'
                         ELSE notes || ' · CP-FIN-004: rectificado zelle → external_transfer' END,
            updated_at = now()
        WHERE ref_type = 'sale' AND ref_id = v_sale_id
          AND payment_method = 'zelle' AND coalesce(direction, 'in') = 'in';

      UPDATE public.transactions
        SET external_transfer_amount = coalesce(external_transfer_amount, 0) + coalesce(zelle_amount, 0),
            zelle_amount = 0,
            updated_at = now()
        WHERE id = v_sale_id;

      SELECT CASE WHEN count(DISTINCT pt.payment_method) = 1 THEN min(pt.payment_method) ELSE 'mixed' END
        INTO v_method
      FROM public.payment_transactions pt
      WHERE pt.ref_type = 'sale' AND pt.ref_id = v_sale_id AND coalesce(pt.direction, 'in') = 'in';
      IF v_method IS NOT NULL THEN
        UPDATE public.transactions
          SET payment_method = v_method::public.payment_method_enum, updated_at = now()
        WHERE id = v_sale_id;
      END IF;

      UPDATE public.transaction_items
        SET external_transfer_paid = coalesce(external_transfer_paid, 0) + coalesce(zelle_paid, 0),
            external_transfer_currency = coalesce(external_transfer_currency, zelle_currency),
            external_transfer_discount_type = coalesce(external_transfer_discount_type, zelle_discount_type),
            external_transfer_discount_value = coalesce(external_transfer_discount_value, zelle_discount_value),
            external_transfer_discount_currency = coalesce(external_transfer_discount_currency, zelle_discount_currency),
            zelle_paid = 0, zelle_currency = NULL,
            zelle_discount_type = NULL, zelle_discount_value = NULL, zelle_discount_currency = NULL
      WHERE transaction_id = v_sale_id AND coalesce(zelle_paid, 0) > 0;

      v_n_ext := v_n_ext + 1;
    END IF;
  END LOOP;

  -- ── B. Todas las demás ventas con cobros zelle → cash (efectivo USD) ──
  FOR v_sale IN
    SELECT DISTINCT pt.ref_id AS sale_id
    FROM public.payment_transactions pt
    WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
      AND pt.payment_method = 'zelle' AND coalesce(pt.direction, 'in') = 'in'
      AND NOT (pt.ref_id = ANY (p_exterior_sales))
  LOOP
    SELECT coalesce(sum(pt.amount), 0) INTO v_usd_cash
    FROM public.payment_transactions pt
    WHERE pt.ref_id = v_sale.sale_id AND pt.payment_method = 'zelle'
      AND pt.ref_type = 'sale' AND coalesce(pt.direction, 'in') = 'in';

    UPDATE public.payment_transactions
      SET payment_method = 'cash',
          notes = CASE WHEN coalesce(notes, '') = ''
                       THEN 'CP-FIN-004: rectificado zelle → cash (efectivo USD — declaración del propietario)'
                       ELSE notes || ' · CP-FIN-004: rectificado zelle → cash (efectivo USD)' END,
          updated_at = now()
      WHERE ref_type = 'sale' AND ref_id = v_sale.sale_id
        AND payment_method = 'zelle' AND coalesce(direction, 'in') = 'in';

    UPDATE public.transactions
      SET cash_amount = coalesce(cash_amount, 0) + coalesce(zelle_amount, 0),
          zelle_amount = 0,
          updated_at = now()
      WHERE id = v_sale.sale_id;

    SELECT CASE WHEN count(DISTINCT pt.payment_method) = 1 THEN min(pt.payment_method) ELSE 'mixed' END
      INTO v_method
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'sale' AND pt.ref_id = v_sale.sale_id AND coalesce(pt.direction, 'in') = 'in';
    IF v_method IS NOT NULL THEN
      UPDATE public.transactions
        SET payment_method = v_method::public.payment_method_enum, updated_at = now()
      WHERE id = v_sale.sale_id;
    END IF;

    UPDATE public.transaction_items
      SET cash_paid = coalesce(cash_paid, 0) + coalesce(zelle_paid, 0),
          cash_currency = coalesce(cash_currency, zelle_currency),
          zelle_paid = 0, zelle_currency = NULL
    WHERE transaction_id = v_sale.sale_id AND coalesce(zelle_paid, 0) > 0;

    v_n_cash := v_n_cash + 1;
  END LOOP;

  -- ── C. Cobros de trabajos (ref_type='work'): SOLO normalización de
  --      representación zelle → external_transfer (misma cuenta exterior;
  --      los works no generan asientos y están FUERA del alcance declarado,
  --      que cubre ventas). Sin cambio de clasificación contable. ──
  UPDATE public.payment_transactions
    SET payment_method = 'external_transfer',
        notes = CASE WHEN coalesce(notes, '') = ''
                     THEN 'CP-FIN-004: normalización de representación zelle → external_transfer (cobro de trabajo; no es venta)'
                     ELSE notes || ' · CP-FIN-004: representación normalizada a external_transfer' END,
        updated_at = now()
  WHERE store_id = p_store_id AND ref_type = 'work' AND payment_method = 'zelle';
  GET DIAGNOSTICS v_n_works = ROW_COUNT;

  -- ── D. Post-condición fail-closed: cero zelle residual en la tienda ──
  SELECT count(*) INTO v_residual
  FROM public.payment_transactions WHERE store_id = p_store_id AND payment_method = 'zelle';
  SELECT count(*) INTO v_residual_hdr
  FROM public.transactions WHERE store_id = p_store_id AND payment_method = 'zelle';
  IF v_residual > 0 OR v_residual_hdr > 0 THEN
    RAISE EXCEPTION 'ERR_NORMALIZACION_INCOMPLETA: cobros zelle residuales=%, headers residuales=%', v_residual, v_residual_hdr;
  END IF;

  -- ── E. Importes conciliados (nominales USD de la reclasificación) ──
  SELECT coalesce(sum(pt.amount), 0) INTO v_usd_ext
  FROM public.payment_transactions pt
  WHERE pt.store_id = p_store_id AND pt.ref_type = 'sale'
    AND pt.payment_method = 'external_transfer' AND pt.currency = 'USD'
    AND coalesce(pt.direction, 'in') = 'in';

  -- ── F. Auditoría ──
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CP_FIN004_NORMALIZE', 'payment_transactions', p_store_id, p_store_id, p_actor,
    jsonb_build_object(
      'mision', 'CP-FIN-004 (anexo vinculante POS-backend)',
      'evidencia', 'Declaración del propietario: las únicas 3 ventas Zelle identificadas; demás ventas USD en efectivo',
      'exterior_sales', p_exterior_sales,
      'n_ventas_exterior', v_n_ext,
      'n_ventas_efectivo', v_n_cash,
      'n_works_representacion', v_n_works,
      'usd_exterior_final', round(v_usd_ext, 2),
      'usd_reclasificados_efectivo', round(v_usd_cash, 2),
      'residual_zelle', v_residual));

  RETURN jsonb_build_object(
    'status', 'OK', 'store_id', p_store_id,
    'n_ventas_exterior', v_n_ext,
    'n_ventas_efectivo', v_n_cash,
    'n_works_representacion', v_n_works,
    'usd_exterior_final', round(v_usd_ext, 2),
    'usd_reclasificados_efectivo', round(v_usd_cash, 2),
    'residual_zelle', v_residual);
END $function$;

REVOKE ALL ON FUNCTION public.cp_fin004_normalize_enervida_payments(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_fin004_normalize_enervida_payments(uuid, uuid[], uuid) TO service_role;
