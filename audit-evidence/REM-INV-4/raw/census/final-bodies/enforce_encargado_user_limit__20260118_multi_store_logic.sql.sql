-- DECLARED FINAL STATE (Git) de enforce_encargado_user_limit
-- fuente: 20260118_multi_store_logic.sql stmt#6

CREATE OR REPLACE FUNCTION public.enforce_encargado_user_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_creator_role user_role;
    v_limit integer;
    v_current_count integer;
BEGIN
    IF NEW.created_by IS NULL THEN RETURN NEW; END IF;

    SELECT role, max_users_limit INTO v_creator_role, v_limit
    FROM public.profiles WHERE id = NEW.created_by;

    IF v_creator_role = 'encargado' THEN
        SELECT COUNT(*) INTO v_current_count FROM public.profiles WHERE created_by = NEW.created_by;
        IF v_current_count >= v_limit THEN
            RAISE EXCEPTION 'ERR_USER_LIMIT_EXCEEDED: Maximum number of users reached for this manager (%/%)', v_current_count, v_limit;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
