-- Migration: Fix Cash Closure RPC baseline
-- Date: 2026-02-13
-- Author: Jules

BEGIN;

-- Update the RPC to use closed_at instead of created_at for finalized closures
CREATE OR REPLACE FUNCTION public.get_sales_since_last_closure(p_store_id uuid)
RETURNS TABLE(
    total_sales numeric,
    total_cash numeric,
    total_transfer numeric,
    last_closure_at timestamptz
) AS $$
DECLARE
    v_last_closure_at timestamptz;
BEGIN
    -- Find the last CLOSED closure for this store, using closed_at as the period marker
    SELECT closed_at INTO v_last_closure_at
    FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'cerrado'
    ORDER BY closed_at DESC
    LIMIT 1;

    -- Fallback: If no closed closure exists, default to start of current day
    IF v_last_closure_at IS NULL THEN
        v_last_closure_at := date_trunc('day', now());
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::numeric AS total_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::numeric AS total_transfer,
        v_last_closure_at AS last_closure_at
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_last_closure_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMIT;
