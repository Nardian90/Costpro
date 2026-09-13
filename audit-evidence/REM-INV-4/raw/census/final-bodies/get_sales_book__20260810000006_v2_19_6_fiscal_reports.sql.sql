-- DECLARED FINAL STATE (Git) de get_sales_book
-- fuente: 20260810000006_v2_19_6_fiscal_reports.sql stmt#1

CREATE OR REPLACE FUNCTION public.get_sales_book(
  p_store_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE(
  invoice_number text,
  transaction_date timestamptz,
  customer_name text,
  total_amount numeric,
  taxable_base numeric,
  tax_amount numeric,
  payment_method text,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    t.invoice_number,
    t.created_at,
    COALESCE(t.customer_name, ''),
    t.total_amount,
    t.subtotal - t.discount_value,
    t.tax_amount,
    t.payment_method::text,
    t.status
  FROM public.transactions t
  WHERE t.store_id = p_store_id
    AND EXTRACT(YEAR FROM t.created_at)::int = p_year
    AND EXTRACT(MONTH FROM t.created_at)::int = p_month
    AND t.status IN ('completed', 'voided', 'reversed')
  ORDER BY t.created_at;
END;
$function$
