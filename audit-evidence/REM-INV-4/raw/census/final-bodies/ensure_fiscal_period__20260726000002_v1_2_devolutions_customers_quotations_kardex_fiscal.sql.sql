-- DECLARED FINAL STATE (Git) de ensure_fiscal_period
-- fuente: 20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql stmt#66

CREATE OR REPLACE FUNCTION public.ensure_fiscal_period(p_store_id UUID, p_year INTEGER, p_month INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.fiscal_closings
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    IF v_id IS NULL THEN
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status)
        VALUES (p_store_id, p_year, p_month, 'open')
        ON CONFLICT (store_id, period_year, period_month) DO NOTHING
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$
