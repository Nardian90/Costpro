-- DECLARED FINAL STATE (Git) de can_create_user_with_role
-- fuente: 20260302_0006_fix_hierarchy_and_triggers.sql stmt#0

CREATE OR REPLACE FUNCTION public.can_create_user_with_role(
    p_creator_id UUID,
    p_role_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_creator_role TEXT;
BEGIN
    -- Get creator's role
    SELECT r.name INTO v_creator_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = p_creator_id;

    -- Service role or Admin can create anything
    IF p_creator_id = '00000000-0000-0000-0000-000000000000'::UUID OR v_creator_role = 'Admin' THEN
        RETURN TRUE;
    END IF;

    IF v_creator_role = 'Encargado' THEN
        RETURN p_role_name IN ('Cajero', 'Almacenero', 'clerk', 'warehouse');
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
