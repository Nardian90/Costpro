-- DECLARED FINAL STATE (Git) de calculate_abc
-- fuente: 20260727000006_v2_12_9_spoofing_p_user_id.sql stmt#4

CREATE OR REPLACE FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
    v_total_revenue NUMERIC := 0;
    v_count INTEGER := 0;
    v_product_id UUID;
    v_qty NUMERIC;
    v_revenue NUMERIC;
    v_cumulative NUMERIC := 0;
    v_pct NUMERIC;
    v_class TEXT;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    DELETE FROM public.abc_classifications
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    -- Get total revenue
    SELECT COALESCE(SUM(ti.price_at_sale_cup * ti.quantity), 0) INTO v_total_revenue
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month;

    -- Loop through products sorted by revenue desc
    FOR v_product_id, v_qty, v_revenue IN
        SELECT ti.product_id, SUM(ti.quantity), SUM(ti.price_at_sale_cup * ti.quantity)
        FROM public.transaction_items ti
        JOIN public.transactions t ON t.id = ti.transaction_id
        WHERE t.store_id = p_store_id AND t.status = 'completed'
          AND EXTRACT(YEAR FROM t.created_at) = p_year
          AND EXTRACT(MONTH FROM t.created_at) = p_month
        GROUP BY ti.product_id
        ORDER BY SUM(ti.price_at_sale_cup * ti.quantity) DESC
    LOOP
        v_cumulative := v_cumulative + v_revenue;
        v_pct := CASE WHEN v_total_revenue > 0 THEN v_cumulative / v_total_revenue * 100 ELSE 0 END;
        v_class := CASE WHEN v_pct <= 80 THEN 'A' WHEN v_pct <= 95 THEN 'B' ELSE 'C' END;

        INSERT INTO public.abc_classifications (store_id, product_id, classification, period_year, period_month, total_quantity_sold, total_revenue, annual_consumption_value, cumulative_percentage, calculated_at)
        VALUES (p_store_id, v_product_id, v_class, p_year, p_month, v_qty, v_revenue, v_revenue, v_pct, now());
    END LOOP;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('status', 'success', 'products_classified', v_count, 'total_revenue', v_total_revenue);
END;
$function$
