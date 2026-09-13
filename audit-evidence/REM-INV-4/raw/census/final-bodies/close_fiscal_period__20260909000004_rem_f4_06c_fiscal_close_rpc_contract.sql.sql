-- DECLARED FINAL STATE (Git) de close_fiscal_period
-- fuente: 20260909000004_rem_f4_06c_fiscal_close_rpc_contract.sql stmt#10

CREATE OR REPLACE FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_closing_id UUID; v_total_sales NUMERIC := 0; v_total_devolutions NUMERIC := 0;
    v_total_purchases NUMERIC := 0; v_total_commissions NUMERIC := 0;
    v_date_from TIMESTAMPTZ; v_date_to TIMESTAMPTZ;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional (actor real en auditoría
    -- por trigger en la vía HTTP service_role). Aditivo; no altera lógica de negocio.
    IF v_uid IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    END IF;
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_date_from := make_date(p_year, p_month, 1);
    v_date_to := make_date(p_year, p_month, 1) + INTERVAL '1 month';
    SELECT id INTO v_closing_id FROM public.fiscal_closings WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;
    IF v_closing_id IS NOT NULL THEN
        UPDATE public.fiscal_closings SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now()
        WHERE id = v_closing_id AND status = 'open';
        IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PERIOD_LOCKED'; END IF;
    ELSE
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales FROM public.transactions WHERE store_id = p_store_id AND status = 'completed' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_devolutions FROM public.devolutions WHERE store_id = p_store_id AND status = 'completed' AND processed_at >= v_date_from AND processed_at < v_date_to;
        SELECT COALESCE(SUM(total_cost), 0) INTO v_total_purchases FROM public.receipts WHERE store_id = p_store_id AND status = 'active' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(final_amount), 0) INTO v_total_commissions FROM public.commission_payments WHERE store_id = p_store_id AND status = 'paid' AND paid_at >= v_date_from AND paid_at < v_date_to;
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, total_sales, total_devolutions, total_purchases, total_commissions, total_cash_balance, closed_by, closed_at)
        VALUES (p_store_id, p_year, p_month, 'closed', v_total_sales, v_total_devolutions, v_total_purchases, v_total_commissions, v_total_sales - v_total_devolutions - v_total_commissions, v_uid, now())
        RETURNING id INTO v_closing_id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'closing_id', v_closing_id, 'total_sales', v_total_sales, 'total_devolutions', v_total_devolutions, 'total_purchases', v_total_purchases, 'total_commissions', v_total_commissions);
END;
$function$
