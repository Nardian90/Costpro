-- Migration: Fix dashboard KPIs to use real cost from transaction items with fallback and optional date range
-- Date: 2026-01-16

BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
    p_store_id uuid DEFAULT NULL,
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL
)
RETURNS TABLE(
    total_sales numeric,
    total_cost numeric,
    total_profit numeric,
    transaction_count bigint,
    avg_ticket numeric,
    total_cash numeric,
    total_card numeric
) AS $$
DECLARE
    v_date_from timestamptz := COALESCE(p_date_from, date_trunc('day', now() AT TIME ZONE 'UTC'));
    v_date_to timestamptz := COALESCE(p_date_to, v_date_from + interval '1 day');
BEGIN
  RETURN QUERY
  WITH filtered_tx AS (
    SELECT id, total_amount, payment_method
    FROM public.transactions
    WHERE (p_store_id IS NULL OR store_id = p_store_id)
      AND status = 'completed'
      AND created_at >= v_date_from
      AND created_at < v_date_to
  ),
  tx_costs AS (
    SELECT
      ti.transaction_id,
      -- Fallback chain: recorded cost_at_sale -> current product cost_price -> 0
      SUM(ti.quantity * COALESCE(NULLIF(ti.cost_at_sale, 0), p.cost_price, 0)) as transaction_cost,
      -- Count as missing if neither historical nor current cost is available (> 0)
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(ti.cost_at_sale, 0), p.cost_price, 0) = 0) as missing_costs
    FROM public.transaction_items ti
    JOIN public.products p ON ti.product_id = p.id
    WHERE ti.transaction_id IN (SELECT id FROM filtered_tx)
    GROUP BY ti.transaction_id
  )
  SELECT
    COALESCE(SUM(ft.total_amount), 0)::numeric AS total_sales,
    CASE
      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL
      ELSE SUM(tc.transaction_cost)
    END::numeric AS total_cost,
    CASE
      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL
      ELSE SUM(ft.total_amount - COALESCE(tc.transaction_cost, 0))
    END::numeric AS total_profit,
    COUNT(ft.id)::bigint AS transaction_count,
    COALESCE(AVG(ft.total_amount), 0)::numeric AS avg_ticket,
    COALESCE(SUM(CASE WHEN ft.payment_method = 'cash' THEN ft.total_amount ELSE 0 END), 0)::numeric AS total_cash,
    COALESCE(SUM(CASE WHEN ft.payment_method = 'transfer' THEN ft.total_amount ELSE 0 END), 0)::numeric AS total_card
  FROM filtered_tx ft
  LEFT JOIN tx_costs tc ON ft.id = tc.transaction_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
