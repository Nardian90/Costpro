-- DECLARED FINAL STATE (Git) de has_any_role
-- fuente: 20260118_multi_store_rls.sql stmt#4

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles user_role[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $$
DECLARE
    v_actual_role user_role;
    r user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = auth.uid();

    FOREACH r IN ARRAY required_roles
    LOOP
        IF v_actual_role = r THEN RETURN true; END IF;
        IF v_actual_role = 'encargado' AND r = 'manager' THEN RETURN true; END IF;
        IF v_actual_role = 'usuario' AND (r = 'clerk' OR r = 'warehouse') THEN RETURN true; END IF;
    END LOOP;

    RETURN false;
END;
$$
