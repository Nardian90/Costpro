-- Migration: Fix dashboard KPIs to use real cost from transaction items
-- Date: 2026-01-16

BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_store_id uuid DEFAULT NULL)
RETURNS TABLE(
    total_sales numeric,
    total_cost numeric,
    total_profit numeric,
    transaction_count bigint,
    avg_ticket numeric,
    total_cash numeric,
    total_card numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_tx AS (
    SELECT id, total_amount, payment_method
    FROM public.transactions
    WHERE (p_store_id IS NULL OR store_id = p_store_id)
      AND status = 'completed'
  ),
  tx_costs AS (
    SELECT
      ti.transaction_id,
      SUM(ti.quantity * ti.cost_at_sale) as transaction_cost
    FROM public.transaction_items ti
    WHERE ti.transaction_id IN (SELECT id FROM filtered_tx)
    GROUP BY ti.transaction_id
  )
  SELECT
    COALESCE(SUM(ft.total_amount), 0)::numeric AS total_sales,
    COALESCE(SUM(tc.transaction_cost), 0)::numeric AS total_cost,
    COALESCE(SUM(ft.total_amount - COALESCE(tc.transaction_cost, 0)), 0)::numeric AS total_profit,
    COUNT(ft.id)::bigint AS transaction_count,
    COALESCE(AVG(ft.total_amount), 0)::numeric AS avg_ticket,
    COALESCE(SUM(CASE WHEN ft.payment_method = 'cash' THEN ft.total_amount ELSE 0 END), 0)::numeric AS total_cash,
    COALESCE(SUM(CASE WHEN ft.payment_method = 'transfer' THEN ft.total_amount ELSE 0 END), 0)::numeric AS total_card
  FROM filtered_tx ft
  LEFT JOIN tx_costs tc ON ft.id = tc.transaction_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
