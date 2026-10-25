-- ═══════════════════════════════════════════════════════════════════════════
-- CP-ORG-001 ciclo 5 (2026-10-25) — validate_active_store: nivel administrativo
-- transversal (incidente P0 admin@demo.com)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO: la cuenta de plataforma superadmin NO lleva membresías de tienda
-- (§6 de 20260826120000; el SuperAdmin «debería poder ver todo, acceder a
-- todo» — directiva del propietario 2026-10-25). El trigger exigía membresía
-- activa para fijar active_store_id TAMBIÉN para 'admin' y 'superadmin', por
-- lo que la escritura fallaba con ERR_INVALID_ACTIVE_STORE aunque la app
-- (userService.setActiveStore, ciclo 4/5) y la RLS (profiles_tenant_update:
-- id = auth.uid() OR is_admin()) la autorizaran. El listado funcionaba pero
-- la SELECCIÓN de tienda quedaba bloqueada en la última capa.
--
-- REGLA: para el NIVEL ADMINISTRATIVO (admin|superadmin — espejo exacto de
-- public.is_admin()) se sustituye la exigencia de membresía por la validación
-- de que la tienda EXISTA y esté ACTIVA (mismo contrato server-side que la
-- app en userService.setActiveStore). El rol 'costo' y los roles operativos
-- (encargado/clerk/warehouse/manager/usuario) conservan la membresía activa
-- obligatoria — CERO cambios de aislamiento para ellos.
--
-- Idempotente: CREATE OR REPLACE del cuerpo de la función; el trigger
-- trigger_validate_active_store sigue apuntando a la misma función.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_active_store()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := NEW.role;

    -- CP-ORG-001 ciclo 5: NIVEL ADMINISTRATIVO (admin|superadmin) transversal.
    -- active_store_id es opcional; si se fija, la tienda debe existir y estar
    -- activa. NO se exige membresía: la cuenta de plataforma no la lleva y
    -- no debe necesitar membresías ficticias (causa raíz del incidente).
    IF v_role = 'admin'::user_role
       OR v_role = 'superadmin'::user_role THEN
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.stores
                    WHERE id = NEW.active_store_id
                      AND is_active = true
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: la tienda no existe o no está activa.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- rol 'costo': semántica PREVIA intacta (membresía activa obligatoria en UPDATE)
    IF v_role = 'costo'::user_role THEN
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
$function$;

COMMENT ON FUNCTION public.validate_active_store() IS
  'CP-ORG-001 c5: nivel administrativo (admin|superadmin) fija active_store_id sin membresía (valida tienda existente+activa); costo y roles operativos conservan la membresía activa obligatoria.';

-- Verificación no destructiva: el trigger debe seguir activo sobre la función.
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_validate_active_store'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'verify_20261026170000: trigger_validate_active_store ausente';
  END IF;
END
$verify$;
