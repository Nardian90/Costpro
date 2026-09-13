-- DECLARED FINAL STATE (Git) de get_purchases_book
-- fuente: 20260810000006_v2_19_6_fiscal_reports.sql stmt#6

CREATE OR REPLACE FUNCTION public.get_purchases_book(
  p_store_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE(
  receipt_number text,
  receipt_date timestamptz,
  supplier text,
  total_cost numeric,
  paid_amount numeric,
  payment_status text
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
    COALESCE(r.invoice_number, r.id::text),
    r.created_at,
    COALESCE(r.supplier, ''),
    COALESCE(r.total_cost, 0),
    COALESCE(r.paid_amount, 0),
    COALESCE(r.payment_status, '')
  FROM public.receipts r
  WHERE r.store_id = p_store_id
    AND EXTRACT(YEAR FROM r.created_at)::int = p_year
    AND EXTRACT(MONTH FROM r.created_at)::int = p_month
    AND r.status = 'active'
  ORDER BY r.created_at;
END;
$function$
