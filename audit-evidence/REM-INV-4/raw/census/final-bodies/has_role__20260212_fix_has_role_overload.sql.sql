-- DECLARED FINAL STATE (Git) de has_role
-- fuente: 20260212_fix_has_role_overload.sql stmt#1

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_required_role public.user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
DECLARE
    v_actual_role public.user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = p_user_id;

    IF v_actual_role IS NULL THEN
        RETURN false;
    END IF;

    -- Compatibility mapping (mirroring the 1-arg version)
    IF v_actual_role = 'encargado' AND p_required_role = 'manager' THEN RETURN true; END IF;
    IF v_actual_role = 'usuario' AND (p_required_role = 'clerk' OR p_required_role = 'warehouse') THEN RETURN true; END IF;

    RETURN v_actual_role = p_required_role;
END;
$$
