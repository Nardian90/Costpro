-- DECLARED FINAL STATE (Git) de get_users_for_encargado
-- fuente: 20260223_harden_user_management.sql stmt#1

CREATE OR REPLACE FUNCTION public.get_users_for_encargado(p_user_id uuid)
RETURNS TABLE(user_id uuid) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT usm.user_id
    FROM public.user_store_memberships usm
    WHERE usm.store_id IN (
        SELECT store_id
        FROM public.user_store_memberships
        WHERE user_id = p_user_id
          AND role IN ('encargado', 'manager')
          AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
