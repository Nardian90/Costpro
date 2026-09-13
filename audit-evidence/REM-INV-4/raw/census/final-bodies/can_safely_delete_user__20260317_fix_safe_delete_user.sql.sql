-- DECLARED FINAL STATE (Git) de can_safely_delete_user
-- fuente: 20260317_fix_safe_delete_user.sql stmt#3

CREATE OR REPLACE FUNCTION public.can_safely_delete_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_records BOOLEAN;
BEGIN
    -- Check Sales (as cashier)
    SELECT EXISTS (SELECT 1 FROM public.sales WHERE cashier_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Receipts/Receptions
    SELECT EXISTS (SELECT 1 FROM public.receipts WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Transfers
    SELECT EXISTS (SELECT 1 FROM public.transfers WHERE created_by = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Inventory Adjustments
    SELECT EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE created_by = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Cash Closures
    SELECT EXISTS (SELECT 1 FROM public.cash_closures WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Inventory Movements
    SELECT EXISTS (SELECT 1 FROM public.inventory_movements WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
