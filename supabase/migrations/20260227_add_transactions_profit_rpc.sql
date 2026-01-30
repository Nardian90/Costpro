-- Migration: Add get_transactions_with_profit RPC
-- Date: 2026-02-27

BEGIN;

CREATE OR REPLACE FUNCTION public.get_transactions_with_profit(
    p_store_id uuid DEFAULT NULL,
    p_search_term text DEFAULT NULL,
    p_date_from timestamp DEFAULT NULL,
    p_date_to timestamp DEFAULT NULL,
    p_limit integer DEFAULT 1000
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    total_amount numeric,
    status text,
    payment_method text,
    subtotal numeric,
    discount_value numeric,
    store_id uuid,
    seller_id uuid,
    seller_name text,
    total_cost numeric,
    profit numeric,
    margin_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_is_admin boolean;
BEGIN
    v_user_id := auth.uid();
    v_is_admin := public.is_admin();

    IF p_limit IS NULL THEN
        p_limit := 1000;
    END IF;

    RETURN QUERY
    WITH filtered_tx AS (
        SELECT
            t.id,
            t.created_at,
            t.total_amount,
            t.status::text,
            t.payment_method::text,
            t.subtotal,
            t.discount_value,
            t.store_id,
            t.seller_id,
            p.full_name as seller_name
        FROM public.transactions t
        LEFT JOIN public.profiles p ON t.seller_id = p.id
        WHERE
            (v_is_admin OR public.has_store_access(t.store_id))
            AND (p_store_id IS NULL OR t.store_id = p_store_id)
            AND (p_date_from IS NULL OR t.created_at >= p_date_from)
            AND (p_date_to IS NULL OR t.created_at <= p_date_to)
            AND (
                p_search_term IS NULL OR p_search_term = ''
                OR p.full_name ILIKE ('%' || p_search_term || '%')
                OR t.id::text ILIKE ('%' || p_search_term || '%')
            )
        ORDER BY t.created_at DESC
        LIMIT p_limit
    ),
    tx_costs AS (
        SELECT
            ti.transaction_id,
            SUM(ti.quantity * COALESCE(NULLIF(ti.cost_at_sale, 0), pr.cost_price, 0)) as transaction_cost
        FROM public.transaction_items ti
        JOIN public.products pr ON ti.product_id = pr.id
        WHERE ti.transaction_id IN (SELECT f.id FROM filtered_tx f)
        GROUP BY ti.transaction_id
    )
    SELECT
        ft.id,
        ft.created_at,
        ft.total_amount,
        ft.status,
        ft.payment_method,
        ft.subtotal,
        ft.discount_value,
        ft.store_id,
        ft.seller_id,
        ft.seller_name,
        COALESCE(tc.transaction_cost, 0)::numeric as total_cost,
        (ft.total_amount - COALESCE(tc.transaction_cost, 0))::numeric as profit,
        (CASE
            WHEN ft.total_amount > 0 THEN ((ft.total_amount - COALESCE(tc.transaction_cost, 0)) / ft.total_amount) * 100
            ELSE 0
        END)::numeric as margin_percentage
    FROM filtered_tx ft
    LEFT JOIN tx_costs tc ON ft.id = tc.transaction_id
    ORDER BY ft.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transactions_with_profit TO authenticated;

COMMIT;
