-- Phase 3: Business Logic (Triggers and Functions) - FIXED

-- 1. Validate that active_store_id is one of the assigned stores
CREATE OR REPLACE FUNCTION public.validate_active_store()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.active_store_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_store_access
            WHERE user_id = NEW.id AND store_id = NEW.active_store_id
        ) THEN
            RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: The user does not have access to the selected store.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- We make this an AFTER trigger to avoid circular dependency during user creation
-- (Inserting profile first with active_store_id, then access record would fail in BEFORE)
-- Actually, a better way is to keep it BEFORE but handle the creation flow correctly.
-- But for simplicity and robustness against different creation flows:
DROP TRIGGER IF EXISTS trigger_validate_active_store ON public.profiles;
CREATE CONSTRAINT TRIGGER trigger_validate_active_store
AFTER INSERT OR UPDATE OF active_store_id ON public.profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_active_store();

-- 2. Enforce limits for 'encargado' role when creating stores
CREATE OR REPLACE FUNCTION public.enforce_encargado_store_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_creator_role user_role;
    v_limit integer;
    v_current_count integer;
BEGIN
    IF NEW.created_by IS NULL THEN RETURN NEW; END IF;

    SELECT role, max_stores_limit INTO v_creator_role, v_limit
    FROM public.profiles WHERE id = NEW.created_by;

    IF v_creator_role = 'encargado' THEN
        SELECT COUNT(*) INTO v_current_count FROM public.stores WHERE created_by = NEW.created_by;
        IF v_current_count >= v_limit THEN
            RAISE EXCEPTION 'ERR_STORE_LIMIT_EXCEEDED: Maximum number of stores reached for this manager (%/%)', v_current_count, v_limit;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_encargado_store_limit ON public.stores;
CREATE TRIGGER trigger_enforce_encargado_store_limit
BEFORE INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.enforce_encargado_store_limit();

-- 3. Enforce limits for 'encargado' role when creating users (profiles)
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_encargado_user_limit ON public.profiles;
CREATE TRIGGER trigger_enforce_encargado_user_limit
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_encargado_user_limit();

-- 4. Auto-assign store to creator if created_by is set
CREATE OR REPLACE FUNCTION public.auto_assign_store_to_creator()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO public.user_store_access (user_id, store_id, assigned_by)
        VALUES (NEW.created_by, NEW.id, NEW.created_by)
        ON CONFLICT DO NOTHING;

        -- If the creator has no active store, set this as active
        UPDATE public.profiles
        SET active_store_id = NEW.id
        WHERE id = NEW.created_by AND active_store_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_assign_store_to_creator ON public.stores;
CREATE TRIGGER trigger_auto_assign_store_to_creator
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_store_to_creator();
