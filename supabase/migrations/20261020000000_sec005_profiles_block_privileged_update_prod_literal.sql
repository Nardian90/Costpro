-- CP-SEC-005 · T1 D1.2 — materializar profiles_block_privileged_update + trigger
-- ============================================================================
-- La función existe SOLO en producción (creada out-of-band el 2026-10-09; ninguna
-- migración la define; el replay la omitía por una transformación documentada que
-- este PR RETIRA de scripts/e2e/build-migrations-replay.mjs).
-- El cuerpo es el LITERAL de producción (pg_get_functiondef, solo lectura,
-- 2026-11-06): NO se cambia su lógica. Guard fail-closed: si el md5 de la
-- función creada difiere del hash medido en producción, ABORTA.
-- Idempotente: CREATE OR REPLACE + creación condicional del trigger.
-- En producción es un no-op semántico (misma definición; sin credenciales en el repo).
-- Superficie certificada: propuesta de alta en supabase/security-contract/contract-surface.sql
-- incluida en este PR (sin aplicar nada en producción).
BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_block_privileged_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.roles IS DISTINCT FROM OLD.roles
     OR NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.max_stores_limit IS DISTINCT FROM OLD.max_stores_limit
     OR NEW.max_users_limit IS DISTINCT FROM OLD.max_users_limit
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'COSTPRO_GUARD: el plan y las columnas de privilegio de un perfil solo puede modificarlas un administrador (FASE 24.6-1)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- GUARD fail-closed: el cuerpo creado debe ser byte-a-byte el de producción
DO $sec005$
DECLARE
  v_hash text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_hash
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'profiles_block_privileged_update';
  IF v_hash IS DISTINCT FROM '421bd3645353d93f518331bbd7b2033a' THEN
    RAISE EXCEPTION 'SEC005-GUARD: el cuerpo de profiles_block_privileged_update (%) no coincide con el hash medido en producción (421bd3645353d93f518331bbd7b2033a): STOP', v_hash;
  END IF;
END
$sec005$;

-- Trigger: creación condicional (idempotente), definición idéntica a producción
DO $sec005$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
                 JOIN pg_namespace n ON c.relnamespace = n.oid
                 WHERE n.nspname = 'public' AND c.relname = 'profiles'
                   AND t.tgname = 'trg_profiles_privileged_cols_guard' AND NOT t.tgisinternal) THEN
    CREATE TRIGGER trg_profiles_privileged_cols_guard
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.profiles_block_privileged_update();
  END IF;
END
$sec005$;
COMMIT;
