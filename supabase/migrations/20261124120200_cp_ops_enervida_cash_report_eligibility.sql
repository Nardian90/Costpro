-- ============================================================================
-- CP-OPS-ENERVIDA — Migración 3/4: Elegibilidad contable del Reporte Entrega.
--
-- Regla (misión §2.7): un pago realmente ejecutado NO se excluye por un
-- cambio administrativo posterior del PAGO (la fila original permanece y su
-- reversión es otra fila con su propia fecha); pero un documento ANULADO
-- (servicio voided/cancelled · recepción voided/reversed) no genera efectos
-- económicos ACTIVOS: sus pagos dejan de ser salidas y sus contra-filas no
-- son entradas (el par original+reversa de un documento anulado netea a
-- cero en el período en que ocurrieron). Las reversaciones sobre documentos
-- VÁLIDOS sí son entradas de efectivo (el dinero volvió al cajón).
--
-- Caso corregido: SRV-20261123-00146 (Aduana, voided, pago 1.800 del
-- 23/11 16:34) deja de restar en «Servicios recibidos pagados en efectivo»
-- y desaparece del desglose por concepto; su reemplazo activo
-- SRV-20261123-00147 sigue restando exactamente una vez.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1. get_cash_report — reemisión íntegra de la versión vigente
--    (20261120210000 §17) con:
--      · payments: excluye direction='reversal' y documentos anulados.
--      · payment_reversals (NUEVO): contra-filas sobre documentos válidos.
--      · totals/balance_cup: netea las reversaciones.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_cash_report(p_store_id uuid, p_start_date timestamp with time zone DEFAULT (now() - '1 day'::interval), p_end_date timestamp with time zone DEFAULT now(), p_include_all_dates boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_payment_reversals JSON;
  v_commissions JSON;
  v_production JSON;
  v_cash_flow_groups JSON;
  v_refunds JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_payment_reversals_total_cup NUMERIC := 0;
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

  -- Pagos a Proveedores (SALIDAS).
  -- CP-OPS-ENERVIDA: solo filas originales (direction='in') de documentos
  -- VÁLIDOS — un documento anulado no genera salidas activas de efectivo.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions pt
    WHERE pt.store_id = p_store_id
      AND pt.ref_type IN ('receipt', 'service')
      AND COALESCE(pt.direction, 'in') = 'in'
      AND (
        (pt.ref_type = 'service' AND EXISTS (
           SELECT 1 FROM received_services rs
           WHERE rs.id = pt.ref_id AND rs.status NOT IN ('voided', 'cancelled')))
        OR
        (pt.ref_type = 'receipt' AND EXISTS (
           SELECT 1 FROM receipts r
           WHERE r.id = pt.ref_id AND r.status NOT IN ('voided', 'reversed')))
      )
      AND (p_include_all_dates OR (pt.payment_date >= p_start_date AND pt.payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- CP-OPS-ENERVIDA (NUEVO): Reversiones de pagos a proveedores (ENTRADAS).
  -- Contra-filas (direction='reversal') sobre documentos VÁLIDOS: el dinero
  -- volvió físicamente al cajón/banco. Las contra-filas de documentos
  -- anulados quedan fuera (el par original+contra del documento anulado no
  -- genera efecto activo neto).
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payment_reversals
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS reversal_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions pt
    WHERE pt.store_id = p_store_id
      AND pt.ref_type IN ('receipt', 'service')
      AND COALESCE(pt.direction, 'in') = 'reversal'
      AND (
        (pt.ref_type = 'service' AND EXISTS (
           SELECT 1 FROM received_services rs
           WHERE rs.id = pt.ref_id AND rs.status NOT IN ('voided', 'cancelled')))
        OR
        (pt.ref_type = 'receipt' AND EXISTS (
           SELECT 1 FROM receipts r
           WHERE r.id = pt.ref_id AND r.status NOT IN ('voided', 'reversed')))
      )
      AND (p_include_all_dates OR (pt.payment_date >= p_start_date AND pt.payment_date <= p_end_date))
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

  -- REEMBOLSOS de devoluciones comerciales
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

  -- RECUPERACIONES de reembolsos revertidos
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

  SELECT COALESCE(SUM(pt.amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions pt
  WHERE pt.store_id = p_store_id
  AND pt.ref_type IN ('receipt', 'service')
  AND COALESCE(pt.direction, 'in') = 'in'
  AND (
    (pt.ref_type = 'service' AND EXISTS (
       SELECT 1 FROM received_services rs
       WHERE rs.id = pt.ref_id AND rs.status NOT IN ('voided', 'cancelled')))
    OR
    (pt.ref_type = 'receipt' AND EXISTS (
       SELECT 1 FROM receipts r
       WHERE r.id = pt.ref_id AND r.status NOT IN ('voided', 'reversed')))
  )
  AND (p_include_all_dates OR (pt.payment_date >= p_start_date AND pt.payment_date <= p_end_date));

  SELECT COALESCE(SUM(pt.amount_cup), 0) INTO v_payment_reversals_total_cup
  FROM payment_transactions pt
  WHERE pt.store_id = p_store_id
  AND pt.ref_type IN ('receipt', 'service')
  AND COALESCE(pt.direction, 'in') = 'reversal'
  AND (
    (pt.ref_type = 'service' AND EXISTS (
       SELECT 1 FROM received_services rs
       WHERE rs.id = pt.ref_id AND rs.status NOT IN ('voided', 'cancelled')))
    OR
    (pt.ref_type = 'receipt' AND EXISTS (
       SELECT 1 FROM receipts r
       WHERE r.id = pt.ref_id AND r.status NOT IN ('voided', 'reversed')))
  )
  AND (p_include_all_dates OR (pt.payment_date >= p_start_date AND pt.payment_date <= p_end_date));

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

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_refunds_cash_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'devolution' AND direction = 'refund' AND payment_method = 'cash'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

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
    'payment_reversals_total_cup', v_payment_reversals_total_cup,
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
                   - v_payments_total_cup + v_payment_reversals_total_cup
                   - v_commissions_total_cup - v_cash_flow_out_total_cup
                   - v_refunds_cash_total_cup
                   + v_recoveries_cash_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'payment_reversals', v_payment_reversals,
    'commissions', v_commissions,
    'production', v_production, 'cash_flow_groups', v_cash_flow_groups,
    'refunds', v_refunds, 'recoveries', v_recoveries, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date,
    'include_all_dates', p_include_all_dates
  );
  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- §2. get_cash_currency_summary — reemisión íntegra de la versión vigente
--    (20261024400000) con la misma elegibilidad en el término de proveedores
--    (salidas) + término NUEVO de reversaciones (entradas). Esta función
--    alimenta el SALDO INICIAL: sin el neteo, un pago fantasma de un
--    documento anulado contaminaría el efectivo esperado de todos los
--    períodos posteriores.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_cash_currency_summary(p_store_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_from timestamptz := COALESCE(p_from, '1970-01-01 00:00:00+00'::timestamptz);
  v_to   timestamptz := COALESCE(p_to, now());
  v_settle_cup numeric := 0;
  v_settle_usd numeric := 0;
  v_legacy_cup numeric := 0;
  v_legacy_usd numeric := 0;
  v_legacy_usd_carve_cup numeric := 0;
  v_prod_cup numeric := 0;   v_prod_usd numeric := 0;
  v_supp_cup numeric := 0;   v_supp_usd numeric := 0;
  v_supprev_cup numeric := 0; v_supprev_usd numeric := 0;
  v_comm_cup numeric := 0;   v_comm_usd numeric := 0;
  v_cfi_cup  numeric := 0;   v_cfi_usd  numeric := 0;
  v_cfo_cup  numeric := 0;   v_cfo_usd  numeric := 0;
  v_ref_cup  numeric := 0;   v_ref_usd  numeric := 0;
  v_rec_cup  numeric := 0;   v_rec_usd  numeric := 0;
  v_adj_cup  numeric := 0;   v_adj_usd  numeric := 0;
  v_adjout_cup numeric := 0; v_adjout_usd numeric := 0;
  v_sales_cup numeric := 0;
  v_sales_usd numeric := 0;
  v_net_cup numeric := 0;
  v_net_usd numeric := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

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

  SELECT COALESCE(SUM(cash_amount), 0) INTO v_legacy_cup
  FROM public.transactions
  WHERE store_id = p_store_id
    AND status = 'completed'
    AND COALESCE(cash_amount, 0) > 0
    AND created_at > v_from AND created_at <= v_to
    AND cash_received_cup IS NULL AND cash_received_usd IS NULL
    AND change_given_cup IS NULL AND change_given_usd IS NULL;

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

  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount ELSE 0 END), 0)
    INTO v_prod_cup, v_prod_usd
  FROM public.payment_transactions
  WHERE store_id = p_store_id
    AND payment_method = 'cash'
    AND ref_type IN ('production_order', 'work')
    AND payment_date > v_from AND payment_date <= v_to;

  -- 4) Pagos a proveedores en EFECTIVO (salidas). CP-OPS-ENERVIDA: solo
  --    filas originales de documentos VÁLIDOS (elegibilidad idéntica a
  --    get_cash_report §1) — un documento anulado no genera salidas.
  SELECT
    COALESCE(SUM(CASE WHEN pt.currency = 'CUP' THEN pt.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pt.currency = 'USD' THEN pt.amount ELSE 0 END), 0)
    INTO v_supp_cup, v_supp_usd
  FROM public.payment_transactions pt
  WHERE pt.store_id = p_store_id
    AND pt.payment_method = 'cash'
    AND pt.ref_type IN ('receipt', 'service')
    AND COALESCE(pt.direction, 'in') = 'in'
    AND (
      (pt.ref_type = 'service' AND EXISTS (
         SELECT 1 FROM received_services rs
         WHERE rs.id = pt.ref_id AND rs.status NOT IN ('voided', 'cancelled')))
      OR
      (pt.ref_type = 'receipt' AND EXISTS (
         SELECT 1 FROM receipts r
         WHERE r.id = pt.ref_id AND r.status NOT IN ('voided', 'reversed')))
    )
    AND pt.payment_date > v_from AND pt.payment_date <= v_to;

  -- 4b) CP-OPS-ENERVIDA (NUEVO): reversaciones de pagos en EFECTIVO sobre
  --     documentos VÁLIDOS (entradas — el dinero volvió al cajón).
  SELECT
    COALESCE(SUM(CASE WHEN pt.currency = 'CUP' THEN pt.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pt.currency = 'USD' THEN pt.amount ELSE 0 END), 0)
    INTO v_supprev_cup, v_supprev_usd
  FROM public.payment_transactions pt
  WHERE pt.store_id = p_store_id
    AND pt.payment_method = 'cash'
    AND pt.ref_type IN ('receipt', 'service')
    AND COALESCE(pt.direction, 'in') = 'reversal'
    AND (
      (pt.ref_type = 'service' AND EXISTS (
         SELECT 1 FROM received_services rs
         WHERE rs.id = pt.ref_id AND rs.status NOT IN ('voided', 'cancelled')))
      OR
      (pt.ref_type = 'receipt' AND EXISTS (
         SELECT 1 FROM receipts r
         WHERE r.id = pt.ref_id AND r.status NOT IN ('voided', 'reversed')))
    )
    AND pt.payment_date > v_from AND pt.payment_date <= v_to;

  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' THEN amount_cup / NULLIF(exchange_rate, 0) ELSE 0 END), 0)
    INTO v_comm_cup, v_comm_usd
  FROM public.commission_payments
  WHERE store_id = p_store_id
    AND status = 'paid'
    AND payment_method = 'cash'
    AND paid_at > v_from AND paid_at <= v_to;

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

  v_net_cup := v_sales_cup + v_prod_cup - v_supp_cup + v_supprev_cup - v_comm_cup
             + v_cfi_cup - v_cfo_cup - v_ref_cup + v_rec_cup + v_adj_cup - v_adjout_cup;
  v_net_usd := v_sales_usd + v_prod_usd - v_supp_usd + v_supprev_usd - v_comm_usd
             + v_cfi_usd - v_cfo_usd - v_ref_usd + v_rec_usd + v_adj_usd - v_adjout_usd;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('from', v_from, 'to', v_to),
    'terms', jsonb_build_object(
      'sales_cash',        jsonb_build_object('CUP', round(v_sales_cup, 2), 'USD', round(v_sales_usd, 2)),
      'production_cash',   jsonb_build_object('CUP', round(v_prod_cup, 2),  'USD', round(v_prod_usd, 2)),
      'supplier_cash',     jsonb_build_object('CUP', round(v_supp_cup, 2),  'USD', round(v_supp_usd, 2)),
      'supplier_reversals_cash', jsonb_build_object('CUP', round(v_supprev_cup, 2), 'USD', round(v_supprev_usd, 2)),
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
