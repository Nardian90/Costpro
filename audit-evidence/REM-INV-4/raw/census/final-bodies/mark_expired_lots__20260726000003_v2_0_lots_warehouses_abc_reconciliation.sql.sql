-- DECLARED FINAL STATE (Git) de mark_expired_lots
-- fuente: 20260726000003_v2_0_lots_warehouses_abc_reconciliation.sql stmt#55

CREATE OR REPLACE FUNCTION public.mark_expired_lots(p_store_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.product_lots
    SET status = 'expired', updated_at = now()
    WHERE expiration_date IS NOT NULL
      AND expiration_date < CURRENT_DATE
      AND status = 'active'
      AND (p_store_id IS NULL OR store_id = p_store_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$
