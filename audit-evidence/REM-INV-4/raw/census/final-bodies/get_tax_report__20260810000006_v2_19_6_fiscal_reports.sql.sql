-- DECLARED FINAL STATE (Git) de get_tax_report
-- fuente: 20260810000006_v2_19_6_fiscal_reports.sql stmt#11

CREATE OR REPLACE FUNCTION public.get_tax_report(
  p_store_id uuid,
  p_year int,
  p_month int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_total_sales numeric := 0;
  v_total_tax_collected numeric := 0;
  v_total_devolutions numeric := 0;
  v_total_tax_returned numeric := 0;
  v_total_purchases numeric := 0;
  v_net_tax_payable numeric := 0;
BEGIN
  IF NOT public.is_admin() AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(tax_amount), 0)
    INTO v_total_sales, v_total_tax_collected
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND EXTRACT(YEAR FROM created_at)::int = p_year
      AND EXTRACT(MONTH FROM created_at)::int = p_month;

  SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(total_amount * COALESCE(
    (SELECT tax_amount / NULLIF(total_amount, 0) FROM public.transactions t WHERE t.id = d.original_transaction_id LIMIT 1), 0
  )), 0)
    INTO v_total_devolutions, v_total_tax_returned
    FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed'
      AND EXTRACT(YEAR FROM d.created_at)::int = p_year
      AND EXTRACT(MONTH FROM d.created_at)::int = p_month;

  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_total_purchases
    FROM public.receipts
    WHERE store_id = p_store_id AND status = 'active'
      AND EXTRACT(YEAR FROM created_at)::int = p_year
      AND EXTRACT(MONTH FROM created_at)::int = p_month;

  v_net_tax_payable := v_total_tax_collected - v_total_tax_returned;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'year', p_year,
    'month', p_month,
    'total_sales', v_total_sales,
    'total_tax_collected', v_total_tax_collected,
    'total_devolutions', v_total_devolutions,
    'total_tax_returned', v_total_tax_returned,
    'total_purchases', v_total_purchases,
    'net_tax_payable', v_net_tax_payable
  );
END;
$function$
