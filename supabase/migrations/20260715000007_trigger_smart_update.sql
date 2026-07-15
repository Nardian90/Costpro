-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-15): trigger validate_active_store demasiado estricto en UPDATE
-- ════════════════════════════════════════════════════════════════════
-- Problema: el trigger BEFORE UPDATE OF active_store_id, role se dispara
-- para cualquier UPDATE que toque role o active_store_id, incluso si
-- active_store_id no cambia. Si el perfil tiene role='encargado' y
-- active_store_id=NULL (porque está en proceso de creación), el trigger
-- falla con "El rol encargado requiere una tienda activa asignada."
--
-- Esto bloquea la actualización de OTROS campos (full_name, max_stores, etc.)
-- en perfiles que están en estado intermedio.
--
-- Solución: en UPDATE, solo validar si active_store_id cambia realmente
-- (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id).
-- Si no cambia, permitir el UPDATE sin validar.
-- ════════════════════════════════════════════════════════════════════

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-aplicar trigger
DROP TRIGGER IF EXISTS trigger_validate_active_store ON public.profiles;
CREATE TRIGGER trigger_validate_active_store
    BEFORE INSERT OR UPDATE OF active_store_id, role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_active_store();

-- Verificación
SELECT 'trigger_smart_update' AS status,
       (SELECT count(*) FROM pg_trigger
        WHERE tgname = 'trigger_validate_active_store'
          AND NOT tgisinternal) AS trigger_count;
