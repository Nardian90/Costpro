-- Migration: Fix Active Store Logic for Costo and Operational Roles
-- Ensures 'costo' role doesn't require a store, while operational roles do.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_active_store()
RETURNS TRIGGER AS $$
DECLARE
    v_role user_role;
BEGIN
    -- Get user role
    v_role := NEW.role;

    -- If role is 'costo', active_store_id is optional
    IF v_role = 'costo'::user_role THEN
        IF NEW.active_store_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: The user does not have active membership in the selected store.';
            END IF;
        END IF;
    ELSE
        -- For operational roles, ensure active_store_id is NOT NULL and valid
        IF NEW.active_store_id IS NULL THEN
             IF v_role IN ('encargado'::user_role, 'clerk'::user_role, 'warehouse'::user_role) THEN
                RAISE EXCEPTION 'ERR_STORE_REQUIRED: El rol % requiere una tienda activa asignada.', v_role;
             END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: The user does not have active membership in the selected store.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trigger_validate_active_store ON public.profiles;
CREATE TRIGGER trigger_validate_active_store
    BEFORE INSERT OR UPDATE OF active_store_id, role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_active_store();

COMMIT;
