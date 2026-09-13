-- DECLARED FINAL STATE (Git) de has_store_access_as
-- fuente: 20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql stmt#48

CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id UUID, p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role TEXT;
BEGIN
    IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    IF v_role = 'admin' THEN RETURN true; END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
    );
END;
$$
