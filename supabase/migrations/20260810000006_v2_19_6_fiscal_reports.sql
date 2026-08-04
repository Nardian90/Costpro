-- ============================================================================
-- Migration: 20260810000006_v2_19_6_fiscal_reports.sql
-- Iteración Fiscal — Fix F-H3, F-H4
-- ============================================================================
-- RPCs: get_sales_book, get_purchases_book, get_tax_report
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. get_sales_book
DROP FUNCTION IF EXISTS public.get_sales_book;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_sales_book FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sales_book TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_book TO service_role;

-- 2. get_purchases_book
DROP FUNCTION IF EXISTS public.get_purchases_book;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_purchases_book FROM anon;
GRANT EXECUTE ON FUNCTION public.get_purchases_book TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchases_book TO service_role;

-- 3. get_tax_report
DROP FUNCTION IF EXISTS public.get_tax_report;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tax_report FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tax_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_report TO service_role;

COMMENT ON FUNCTION public.get_sales_book IS 'Iteración Fiscal (F-H3): Sales book for tax declaration.';
COMMENT ON FUNCTION public.get_purchases_book IS 'Iteración Fiscal (F-H3): Purchases book for tax declaration.';
COMMENT ON FUNCTION public.get_tax_report IS 'Iteración Fiscal (F-H4): Tax report with net_tax_payable.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_sales_book;
-- DROP FUNCTION IF EXISTS public.get_purchases_book;
-- DROP FUNCTION IF EXISTS public.get_tax_report;
-- ============================================================================
