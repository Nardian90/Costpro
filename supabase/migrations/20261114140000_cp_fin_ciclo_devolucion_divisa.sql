-- ============================================================================
-- CP-FIN · CICLO ECONÓMICO COMPLETO DE LA DEVOLUCIÓN EN DIVISA
-- 20261114140000 · rama fix/ciclo-divisa-devoluciones-20261113 (PROPUESTA —
-- NO aplicar a producción sin autorización expresa del propietario; validado
-- en BD E2E aislada lguovmvrozxgssupkwpf). DEPENDE del PR #1615 (rama
-- fix/semantica-ventas-usd-20261114): apila la semántica VENTA de
-- 20261114120000 y cierra el ciclo de la devolución.
--
-- PROBLEMA (misión final del propietario 2026-11-13, apartado 1):
--   El PR #1615 corrigió fin_compute_metrics('VENTA') (total_amount ya es
--   CUP-equivalente) pero su propia validación reconoció C7: devoluciones en
--   divisa siguen produciendo ERR_UNBALANCED. DOS causas:
--   (a) fin_compute_metrics('DEVOLUCION_VENTA') multiplicaba total_amount por
--       la tasa — total_amount de una devolución YA es canónico CUP
--       (create_devolution_v2: v_total = Σ qty × price_at_sale_cup; el campo
--       currency queda 'CUP' y la divisa real vive en las filas de reembolso).
--   (b) create_devolution_v2 redondeaba el importe USD del reembolso al
--       céntimo (round(v_total/v_rate_sale, 2)) — amount_cup GENERADO
--       (amount×rate) ya no era v_total (deriva de céntimos) y el asiento de
--       DEVOLUCION_VENTA caía en ERR_UNBALANCED aunque el documento fuese CUP.
--       Esto rompía la invariante PROPIA del RPC: «amount = canónico / tasa
--       para USD ⇒ amount_cup generado conserva el total canónico».
--
-- CORRECCIÓN (4 cambios anclados — M1..M4 en el cuerpo):
--   M1  DEVOLUCION_VENTA.total_cup := total_amount (canónico; sin ×tasa).
--   M2  store_credit_cup := Σ store_credit_ledger.amount (canónico CUP).
--   M3  Reembolso USD simple: fila con tasa EFECTIVA exacta
--       v_total/v_refund_amount ⇒ amount_cup = v_total (invariante restaurada).
--       El importe físico sigue en céntimos USD; la tasa histórica de la venta
--       se conserva en v_rate_sale y en audit_logs (rate_sale).
--   M4  Reembolso AS_PAID: componente USD con tasa efectiva
--       (v_total − v_comp_cup)/v_comp_usd ⇒ Σ amount_cup de los componentes =
--       v_total exacto.
--
-- COHERENCIA DEL CICLO (lo que el validador demuestra en BD aislada):
--   · Venta USD cobrada en USD/CUP/mixto → asiento equilibrado (PR #1615).
--   · Devolución TOTAL y PARCIAL en USD → asiento equilibrado: D ING_DEVOLUCIONES
--     v_total / C ACT_EFECTIVO_USD|ACT_BANCOS amount_cup + par de costo
--     (D ACT_INVENTARIO / C GAS_COSTO_VENTAS costo_devuelto = cost_at_sale
--     ORIGINAL de la venta — no cost_average).
--   · Anulación/reversa → asiento espejo invertido (fin_post_annulment_safe),
--     idempotente, sin tocar el asiento de la venta.
--   · Venta CUP + devolución CUP → sin regresión.
--   · Sin doble reconocimiento: re-publicar no duplica; la devolución no
--     re-emite el asiento de la venta.
--
-- SIN CAMBIOS (deliberado):
--   · Reglas (fin_rule_versions): plantilla DEVOLUCION_VENTA v1 intacta — solo
--     cambia el VALOR de las métricas (total_cup/store_credit), igual que el
--     criterio del PR #1615 para VENTA.
--   · VENTA (métricas de 20261114120000): intactas.
--   · direction='refund'/'recovery' ya exentos de PT001/PT006 (trigger vigente
--     20261024400000): la tasa efectiva no rompe invariantes de pago.
--   · create_devolution_v2: topes por moneda, cheques físicos, AS_PAID y
--     store_credit intactos — solo la precisión de la tasa de la fila.
--   · Producción: NO se aplica (rama de propuesta). Los 2 documentos reales de
--     devolución hoy (CUP, canónicos exactos) no cambian de valor con M1/M2
--     (currency='CUP' y sin store_credit en divisa).
--
-- Idempotente: CREATE OR REPLACE de DOS funciones. No toca tablas, reglas ni
-- datos. Reversible: restaurar las definiciones previas (el validador lo
-- demuestra en BD aislada con hash de función idéntico al original).
-- ============================================================================
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
  v_txt text; v_num numeric; -- añadidos por 20261113120400 (tipos texto/numérico para FLUJO_CAJA/NOMINA)
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
END $function$;
