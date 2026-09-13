-- DECLARED FINAL STATE (Git) de get_cash_report
-- fuente: 20260904030000_w9_obs1_fix_cash_report_double_conversion.sql stmt#0

CREATE OR REPLACE FUNCTION public.get_cash_report(
  p_store_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '1 day',
  p_end_date TIMESTAMPTZ DEFAULT now(),
  p_include_all_dates BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_commissions JSON;
  v_production JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
  v_production_total_cup NUMERIC := 0;
  v_date_filter TEXT := '';
BEGIN
  -- V2.12.37: si p_include_all_dates es TRUE, no filtrar por fecha
  IF NOT p_include_all_dates THEN
    v_date_filter := 'AND payment_date >= ''' || p_start_date || ''' AND payment_date <= ''' || p_end_date || '''';
  END IF;

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

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'production_total_cup', v_production_total_cup,
    'balance_cup', v_sales_total_cup + v_production_total_cup - v_payments_total_cup - v_commissions_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'commissions', v_commissions,
    'production', v_production, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date,
    'include_all_dates', p_include_all_dates
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql
