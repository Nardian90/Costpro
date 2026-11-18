-- ═══════════════════════════════════════════════════════════════════════════
-- 20261118130000_cp_fin_fs_origin_traceability.sql
-- MISIÓN CP-FIN-FINANCIAL-STATEMENTS-SOURCE-AND-CURRENCY-ACCURACY-001 (2026-11-18)
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (expediente docs/audits/cp-fin-financial-statements-accuracy-001/):
--   · La columna «Moneda origen» del drilldown de Estados Financieros presentaba
--     el importe CONTABLE (amount, siempre CUP en el motor de reconocimiento)
--     etiquetado con currency_origin del documento → «125,550.00 USD» cuando
--     125,550 es el equivalente CUP de una venta original de 135.00 USD
--     (tasa registrada 930, venta e2614f36 del 2026-11-07, ENERVIDA-VITALLCONS).
--   · fin_movements.amount_origin (adicionado por la migración motor
--     20261113120100) NUNCA fue escrito por el motor: 538 movimientos con
--     currency_origin='USD' y amount_origin NULL (verificación producción
--     2026-11-18). El original quedaba exclusivamente en el documento fuente.
--   · La descripción «Venta » (espacio final) proviene de
--     'Venta ' || coalesce(invoice_number, '') con invoice_number NULL
--     (233/233 ventas del sistema desde octubre) → Documento = '—' sin
--     identificador visible.
--
-- CONTENIDO (mecanismo estándar del repo: CREATE OR REPLACE, cuerpos BASE =
-- definiciones LIVE verificadas byte-a-byte el 2026-11-18 via
-- pg_get_functiondef; sin firmas nuevas, sin cambios de ACL):
--   1. fin_compute_metrics: VENTA expone métricas ADITIVAS de origen —
--      total_origin (nominal del documento en su moneda, desde
--      transaction_items.price_at_sale con price_currency = moneda del doc),
--      tasa_documento (tasa REGISTRADA, nunca reconstruida) y
--      cob_<metodo>_<moneda>_origin (nominal cobrado por método en su moneda,
--      desde payment_transactions.amount). Descripción con fallback al ID real
--      del documento ('Venta <id8>') cuando no hay invoice_number. CUP intacto.
--   2. fin_apply_templates: cada movimiento recibe amount_origin desde
--      la métrica <metrica>_origin (NULL cuando no existe — sin invención).
--   3. fin_post_document: escribe amount_origin en fin_movements.
--   4. fin_post_document_annulment (versión T12 vigente): el asiento
--      compensatorio copia amount_origin (el original no se pierde al anular).
--   5. fin_get_category_detail: expone amount_origin al drilldown.
--   6. fin_metric_catalog: métricas de origen visibles al constructor (Vista A).
--
-- NO toca asientos, movimientos ni saldos históricos (§11 de la misión):
-- los registros existentes conservan amount_origin NULL y la UI presenta esa
-- deficiencia de trazabilidad de forma explícita («No registrado») hasta que
-- el propietario autorice la rectificación histórica documentada.
-- IDEMPOTENTE (CREATE OR REPLACE + ON CONFLICT DO NOTHING + guardas de cuerpo).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. fin_compute_metrics — BASE = cuerpo LIVE de producción verificado
--    (fixes 20261113120400/20261113120500/20261114120000/20261114140000 + M-015
--    20261118120000). Cambios SOLO en la rama VENTA: total_origin /
--    tasa_documento / cob_*_origin / descripcion con ID real como fallback.
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
      'total_origin', v_total_origin,
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
      -- Solo para cobros en moneda distinta de CUP; sin datos → sin métrica.
      IF lower(coalesce(r.moneda, 'cup')) <> 'cup' AND coalesce(r.origin, 0) > 0 THEN
        v := jsonb_set(v, ARRAY['cob_' || r.metodo || '_' || lower(r.moneda) || '_origin'],
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

COMMENT ON FUNCTION public.fin_compute_metrics(text, uuid, text, uuid) IS
  'CP-FIN §2: métricas por documento. CP-FIN-001 (2026-11-18): VENTA expone ADITIVAMENTE total_origin (nominal del documento en su moneda, desde transaction_items), tasa_documento (registrada, nunca reconstruida) y cob_<metodo>_<moneda>_origin (nominal cobrado por método); descripción con fallback al ID real cuando no hay invoice_number. Sin cambios CUP.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fin_apply_templates — cada movimiento recibe amount_origin desde la
--    métrica <metrica>_origin (NULL cuando no existe: sin invención).
--    BASE = cuerpo LIVE verificado (migración motor 20261113120100).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_apply_templates(p_templates jsonb, p_event text, p_metrics jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
      -- CP-FIN-001: importe ORIGINAL del documento/medio si la métrica de
      -- origen tiene contraparte <metrica>_origin; NULL → no se inventa.
      'amount_origin', p_metrics ->> ((v_origen ->> 'metrica') || '_origin'),
      'traza', jsonb_build_object(
        'template', t ->> 'id',
        'metrica', v_origen ->> 'metrica',
        'regla', 'motor-cp-fin'));
  END LOOP;
  RETURN v_out;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. fin_post_document — escribe amount_origin en fin_movements.
--    BASE = cuerpo LIVE verificado (migración motor 20261113120100).
-- ═══════════════════════════════════════════════════════════════════════════
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
      economic_date, document_number, description, currency_origin, amount_origin, traza)
    VALUES (
      v_entry_id, v_store, t ->> 'categoria', t ->> 'sentido', (t ->> 'amount')::numeric,
      'CUP', 1, v_date, v_docnum, v_metrics ->> 'descripcion_documento',
      t ->> 'currency_origin', (t ->> 'amount_origin')::numeric, t -> 'traza');
  END LOOP;

  RETURN v_entry_id;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. fin_post_document_annulment — el asiento compensatorio copia
--    amount_origin (versión T12 vigente: guard de reversión parcial).
--    BASE = cuerpo LIVE verificado (migración 20261115100000).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fin_post_document_annulment(
  p_doctype text, p_document_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  e record; m record; v_new uuid; v_count integer := 0;
  v_residual numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fin:' || p_doctype || ':' || p_document_id::text));
  FOR e IN
    SELECT * FROM public.fin_entries
    WHERE document_type = p_doctype AND document_id = p_document_id
      AND status = 'posted' AND event IN ('reconocimiento', 'pago')
    ORDER BY posted_at
  LOOP
    -- ¿ya tiene anulación? (idempotencia)
    IF EXISTS (SELECT 1 FROM public.fin_entries x
               WHERE x.reversal_of = e.id) THEN
      -- T12 (CP-FIN-FINAL-CLOSE-005): distinguir cobertura TOTAL de PARCIAL.
      -- · Reversión completa ordinaria → idempotencia intacta (se respeta el
      --   «ya revertido» y NO se crea una segunda compensación).
      -- · Reversión parcial/en exceso → residual contable pendiente: la
      --   anulación automática NO puede saltar el asiento en silencio.
      v_residual := public.fin_entry_reversal_residual(e.id);
      IF v_residual <= 0.01 THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING: el asiento % (doc % %) tiene reversiones parciales enlazadas y un residual de % CUP sin compensar. Regularice primero el residual contable (asiento explícito documentado, p. ej. runbook RECT004 §regularización); después la anulación funcionará por el cauce ordinario. El canal _safe registra este intento en fin_posting_errors.',
        e.id, p_doctype, p_document_id, v_residual;
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
        economic_date, document_number, description, currency_origin, amount_origin, traza)
      VALUES (
        v_new, m.store_id, m.category_code,
        CASE WHEN m.sense = 'debito' THEN 'credito' ELSE 'debito' END,
        m.amount, m.currency, m.exchange_rate, m.economic_date, m.document_number,
        'Anulación: ' || coalesce(m.description, ''), m.currency_origin,
        m.amount_origin,
        m.traza || jsonb_build_object('anulacion_de', m.id));
    END LOOP;
    UPDATE public.fin_entries SET status = 'reversed' WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. fin_get_category_detail — expone amount_origin al drilldown.
--    BASE = cuerpo LIVE verificado (migración motor 20261113120100).
-- ═══════════════════════════════════════════════════════════════════════════
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
           m.currency, m.currency_origin, m.amount_origin, m.description, e.posted_at
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Catálogo de métricas de origen (constructor Vista A) — ADITIVO.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event) VALUES
  ('VENTA', 'total_origin', 'Importe original de la venta (moneda del documento)', 'origen', 'reconocimiento'),
  ('VENTA', 'cob_cash_usd_origin', 'Nominal USD cobrado en efectivo', 'USD', 'reconocimiento'),
  ('VENTA', 'cob_transfer_usd_origin', 'Nominal USD cobrado por transferencia', 'USD', 'reconocimiento'),
  ('VENTA', 'cob_zelle_usd_origin', 'Nominal USD cobrado por Zelle', 'USD', 'reconocimiento')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Guardas de cuerpo (fail-closed al aplicar): las 5 funciones deben llevar
--    la marca de la misión antes del COMMIT — impide un apply parcial/mudo.
-- ═══════════════════════════════════════════════════════════════════════════
DO $guard$
DECLARE
  v_n int := 0;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_compute_metrics'
    AND pg_get_functiondef(p.oid) LIKE '%total_origin%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-GUARD: fin_compute_metrics sin métricas de origen'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_apply_templates'
    AND pg_get_functiondef(p.oid) LIKE '%amount_origin%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-GUARD: fin_apply_templates sin amount_origin'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_post_document'
    AND pg_get_functiondef(p.oid) LIKE '%amount_origin%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-GUARD: fin_post_document sin amount_origin'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_post_document_annulment'
    AND pg_get_functiondef(p.oid) LIKE '%amount_origin%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-GUARD: fin_post_document_annulment sin amount_origin'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_get_category_detail'
    AND pg_get_functiondef(p.oid) LIKE '%amount_origin%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-GUARD: fin_get_category_detail sin amount_origin'; END IF;
END $guard$;

COMMIT;

COMMENT ON COLUMN public.fin_movements.amount_origin IS
  'CP-FIN-001 (2026-11-18): importe ORIGINAL del documento en currency_origin (nominal documentado/cobrado). NULL = dato no registrado (deficiencia de trazabilidad visible en la UI); la aritmética contable permanece en CUP (amount/amount_cup). NUNCA se reconstruye ni inventa.';
