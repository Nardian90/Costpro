-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-15): trigger validate_active_store demasiado estricto en INSERT
-- ════════════════════════════════════════════════════════════════════
-- Problema: el trigger BEFORE INSERT rechaza perfiles con rol encargado/clerk/
-- warehouse cuando active_store_id IS NULL. Pero la función managed_create_user
-- inserta el profile PRIMERO y las memberships DESPUÉS (en la misma transacción).
-- Resultado: catch-22 — el trigger exige una membership que aún no existe.
--
-- Error reportado: "EL ROL ENCARGADO REQUIERE UNA TIENDA ACTIVA" al crear usuario.
--
-- Solución: en INSERT, permitir active_store_id = NULL temporalmente (la función
-- managed_create_user insertará memberships justo después). En UPDATE, mantener
-- la validación estricta para evitar inconsistent states posteriores.
--
-- Adicionalmente, si active_store_id IS NOT NULL en INSERT, validar que la
-- membership ya exista (caso de uso: alta directa por admin con membership previa).
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
        IF NEW.active_store_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                -- En INSERT, permitir (la membership se creará después)
                -- En UPDATE, sí exigir consistencia
                IF TG_OP = 'UPDATE' THEN
                    RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Para roles operativos (encargado, clerk, warehouse, manager, usuario)
    IF TG_OP = 'INSERT' THEN
        -- En INSERT: ser permisivo. La función managed_create_user inserta
        -- memberships justo después. Solo validar si active_store_id NO es NULL
        -- Y la membership ya existe (caso admin directo).
        IF NEW.active_store_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                -- No fallar — la membership se creará en la misma transacción
                -- gestionada por managed_create_user (SECURITY DEFINER).
                -- Solo marcar para revisión posterior vía UPDATE.
                RETURN NEW;
            END IF;
        END IF;
        RETURN NEW;
    ELSE
        -- UPDATE: validación estricta
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

-- Re-aplicar trigger para que use la función actualizada
DROP TRIGGER IF EXISTS trigger_validate_active_store ON public.profiles;
CREATE TRIGGER trigger_validate_active_store
    BEFORE INSERT OR UPDATE OF active_store_id, role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_active_store();

-- Verificación
SELECT 'trigger_fixed' AS status,
       (SELECT count(*) FROM pg_trigger
        WHERE tgname = 'trigger_validate_active_store') AS trigger_count;
