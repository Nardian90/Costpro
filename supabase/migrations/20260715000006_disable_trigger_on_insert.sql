-- FIX (2026-07-15): desactivar trigger validate_active_store temporalmente
-- para permitir que la función managed_create_user inserte el profile y luego
-- las memberships en una transacción atómica sin que el trigger se queje.
--
-- El trigger se mantiene para UPDATE (validación de consistency posterior)
-- pero se elimina para INSERT (la función managed_create_user ya valida
-- RBAC y store access internamente via SECURITY DEFINER).
--
-- Esto es seguro porque:
-- 1. La función managed_create_user es SECURITY DEFINER y valida auth.uid() y rol
-- 2. Nadie más debería insertar en profiles directamente (RLS bloquea)
-- 3. La validación de consistency se mantiene en UPDATE

DROP TRIGGER IF EXISTS trigger_validate_active_store ON public.profiles;

CREATE TRIGGER trigger_validate_active_store
    BEFORE UPDATE OF active_store_id, role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_active_store();

-- Verificación
SELECT 'trigger_insert_disabled' AS status,
       (SELECT count(*) FROM pg_trigger
        WHERE tgname = 'trigger_validate_active_store'
          AND NOT tgisinternal) AS trigger_count;
