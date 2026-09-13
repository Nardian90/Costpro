-- DECLARED FINAL STATE (Git) de validate_active_store
-- fuente: 20260715000007_trigger_smart_update.sql stmt#0

CREATE OR REPLACE FUNCTION public.validate_active_store()
RETURNS TRIGGER AS $$
DECLARE
    v_role user_role;
BEGIN
    v_role := NEW.role;

    -- Si role es 'costo' o 'admin' o 'superadmin', active_store_id es opcional
    IF v_role = 'costo'::user_role
       OR v_role = 'admin'::user_role
       OR v_role = 'superadmin'::user_role THEN
        -- Solo validar si active_store_id cambió o es INSERT
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_store_memberships
                    WHERE user_id = NEW.id
                      AND store_id = NEW.active_store_id
                      AND status = 'active'
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Para roles operativos (encargado, clerk, warehouse, manager, usuario)
    IF TG_OP = 'INSERT' THEN
        -- En INSERT: ser permisivo. La función managed_create_user inserta
        -- memberships justo después. No validar nada aquí.
        RETURN NEW;
    ELSE
        -- UPDATE: solo validar si active_store_id cambió realmente
        -- (evita bloquear updates de otros campos en perfiles intermedios)
        IF OLD.active_store_id IS NOT DISTINCT FROM NEW.active_store_id THEN
            -- active_store_id no cambió → permitir el UPDATE sin validar
            RETURN NEW;
        END IF;

        -- active_store_id cambió → validar consistencia
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
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
