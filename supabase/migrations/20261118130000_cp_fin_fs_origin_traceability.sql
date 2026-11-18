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
--      total_cup_origin (nominal del documento en su moneda, desde
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
--   5b. create_sale_v2: guard NOT v_components_ok en el bloque legacy de
--       transferencia — elimina el DUPLICADO del ledger de pagos con
--       payment_components (defecto preexistente 2026-10-24 demostrado en la
--       aislada; bloqueaba ventas con componente transferencia y el escenario
--       §10.4 de esta misión).
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
--    20261118120000). Cambios SOLO en la rama VENTA: total_cup_origin /
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
  'CP-FIN §2: métricas por documento. CP-FIN-001 (2026-11-18): VENTA expone ADITIVAMENTE total_cup_origin (nominal del documento en su moneda, desde transaction_items), tasa_documento (registrada, nunca reconstruida) y cob_<metodo>_<moneda>_cup_origin (nominal cobrado por método) — contrapartes _origin de las métricas CUP; descripción con fallback al ID real cuando no hay invoice_number. Sin cambios CUP.';

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
-- 5b. create_sale_v2 — guard NOT v_components_ok en el bloque legacy de
--     TRANSFERENCIA. Cuerpo BASE = LIVE de producción verificada byte-a-byte
--     el 2026-11-18 (pg_get_functiondef; 60,128 bytes; idéntica en la aislada).
--     CAMBIO: UNA línea (el mismo guard que el bloque zelle ya usa).
--     Defecto preexistente (MISIÓN PAGOS MIXTOS 2026-10-24): con
--     payment_components el bloque legacy insertaba una SEGUNDA fila de
--     transferencia (duplicado del ledger de pagos) y el invariante I1b §18
--     reventaba ERR_PAYMENT_INVARIANT_VIOLATED — demostrado en la aislada por
--     ablación (con y sin los cuerpos CP-FIN-001) y por SQL directo:
--     SUM(amount_cup)=8370.00 != total=4185.00. Las ventas con componentes de
--     transferencia (CUP o USD) eran IMPOSSIBLES desde el riel canónico;
--     la mixta legacy (pools del cliente, sin componentes) no se veía afectada.
--     Esto BLOQUEABA el escenario §10.4 (venta USD por transferencia) de la
--     propia misión y la clasificación ACT_BANCOS con importe original.
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
      IF v_comp_method NOT IN ('cash', 'transfer', 'zelle')
         OR v_comp_cur NOT IN ('CUP', 'USD')
         OR v_comp_amt IS NULL OR v_comp_amt <= 0 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componente inválido (method=%, currency=%, amount=%)',
          v_comp_method, v_comp_cur, COALESCE(v_comp->>'amount', 'NULL');
      END IF;
      IF v_comp_method = 'zelle' AND v_comp_cur <> 'USD' THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: zelle es un riel USD (currency=%)', v_comp_cur;
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
    cash_amount, transfer_amount, zelle_amount,
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
      IF v_comp_method = 'zelle' THEN
        -- Zelle: mismas reglas canónicas del flujo previo (riel USD, tasa > 1,
        -- moneda de venta USD/EUR/MLC).
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
END $function$;


COMMENT ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid,text,jsonb,text,text,jsonb,numeric,numeric,numeric,numeric,text,jsonb,text,text) IS
  'Escritor canónico del checkout POS (SEC-002). CP-FIN-001 (2026-11-18): guard NOT v_components_ok en el bloque legacy de transferencia — elimina el duplicado del ledger de pagos cuando el cliente declara payment_components (defecto desde 2026-10-24). Sin cambios de firmas ni de pools derivados.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Catálogo de métricas de origen (constructor Vista A) — ADITIVO.
--    Nombres = contraparte _origin de la métrica CUP correspondiente.
-- ═══════════════════════════════════════════════════════════════════════════
-- (Sin DELETE: los nombres definitivos se insertan con ON CONFLICT DO NOTHING;
--  la producción nunca ha tenido los nombres provisionales del diseño, por lo
--  que no hay nada que borrar y la migración queda sin patrones destructivos.)
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event) VALUES
  ('VENTA', 'total_cup_origin', 'Importe original de la venta (moneda del documento)', 'origen', 'reconocimiento'),
  ('VENTA', 'cob_cash_usd_cup_origin', 'Nominal USD cobrado en efectivo', 'USD', 'reconocimiento'),
  ('VENTA', 'cob_transfer_usd_cup_origin', 'Nominal USD cobrado por transferencia', 'USD', 'reconocimiento'),
  ('VENTA', 'cob_zelle_usd_cup_origin', 'Nominal USD cobrado por Zelle', 'USD', 'reconocimiento')
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
    AND pg_get_functiondef(p.oid) LIKE '%total_cup_origin%';
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

  SELECT count(*) INTO v_n FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_sale_v2'
    AND pg_get_functiondef(p.oid) LIKE '%v_transfer_amt > 0 AND NOT v_components_ok%';
  IF v_n < 1 THEN RAISE EXCEPTION 'CP-FIN-001-GUARD: create_sale_v2 sin guard de duplicación de transferencia'; END IF;
END $guard$;

COMMIT;

COMMENT ON COLUMN public.fin_movements.amount_origin IS
  'CP-FIN-001 (2026-11-18): importe ORIGINAL del documento en currency_origin (nominal documentado/cobrado). NULL = dato no registrado (deficiencia de trazabilidad visible en la UI); la aritmética contable permanece en CUP (amount/amount_cup). NUNCA se reconstruye ni inventa.';
