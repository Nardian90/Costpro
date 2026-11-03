-- ═══════════════════════════════════════════════════════════════════════════
-- CP-SEC-026 — Auditoría de membresías: trigger de base de datos
-- T1 de la misión SEC-025/026/003/005/006/UI-001 · 2026-11-03
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA: las altas, cambios y bajas en public.user_store_memberships no
--   dejaban registro en public.audit_logs: nadie puede responder "¿quién
--   otorgó o revocó un acceso a tienda?". Las RPC managed_* escriben en
--   public.user_audit_log (tabla de aplicación), pero el INSERT/UPDATE/DELETE
--   directo, las vías service_role y los borrados en cascada no dejaban rastro.
--
-- DECISIÓN (D1.1): trigger AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW que
--   escribe en public.audit_logs. Atrapa TODAS las vías (RPC, SQL directo,
--   service_role, cascadas de FK) porque vive en la propia tabla.
--
-- ACCIONES (D1.2):
--   membership_grant  — INSERT.
--   membership_update — UPDATE que cambia realmente user_id/store_id/role/
--                       status. Los UPDATE sin cambio real no generan evento
--                       (updated_at no cuenta: lo toca el trigger updated_at).
--   membership_revoke — DELETE real, o borrado LÓGICO detectado como UPDATE
--                       cuyo status pasa a 'revoked' (membership_status =
--                       {active, revoked}; managed_revoke_membership y
--                       manage_user_memberships revocan así).
--
-- CONTENIDO DEL EVENTO (D1.3, mapeado al esquema REAL de audit_logs):
--   user_id     = actor (auth.uid()); si es NULL, el evento lleva en metadata
--                 actor_kind = 'service_role' | 'sql_directo' (nunca vacío).
--   table_name  = 'user_store_memberships'
--   record_id   = id de la membresía
--   store_id    = tienda de la membresía
--   old_data    = fila previa (to_jsonb) en UPDATE/DELETE
--   new_data    = fila nueva (to_jsonb) en INSERT/UPDATE
--   metadata    = actor_kind, db_role (current_user), target_user_id,
--                 changed_fields (UPDATE), source='cp_sec_026_trigger'
--   Sin PII adicional: la tabla no guarda emails ni nombres.
--
-- FAIL-CLOSED (D1.4): la función NO captura excepciones: si el INSERT en
--   audit_logs falla, la operación sobre la membresía falla con él (mismo
--   hilo transaccional). El camino normal no puede fallar por permisos/RLS:
--   la función es SECURITY DEFINER (dueño postgres, dueño de audit_logs,
--   FORCE RLS verificado off en el guard), de modo que el INSERT de auditoría
--   no depende de los grants ni de las policies del rol invocante.
--
-- SEGURIDAD DE LA FUNCIÓN (D1.5):
--   · SECURITY DEFINER es imprescindible aquí: la policy INSERT de audit_logs
--     exige user_id = auth.uid(), y en contexto service_role / SQL directo el
--     actor es NULL (la operación legítima fallaría sin definer).
--   · SET search_path = public, pg_temp (anti search-path injection).
--   · REVOKE EXECUTE FROM PUBLIC, anon, authenticated: una función de trigger
--     NO es invocable por clientes (PostgreSQL solo la ejecuta vía trigger;
--     el EXECUTE se comprueba al crear el trigger). Los checks del CI gate
--     (scripts/ci-gate-sql-checks.js Check 1 y Check 2) ya excluyen funciones
--     disparadoras por esa misma razón (nota CP-ORG-001 c5) y el cuerpo usa
--     auth.uid() — no se requiere entrada en ci-gate-allowlist.json (regla 7).
--   · Sin recursión: audit_logs solo tiene triggers BEFORE (trace_id,
--     updated_at) que no escriben en user_store_memberships.
--
-- INTERACCIONES VERIFICADAS (D1.6): manage_user_memberships (DELETE+INSERT/
--   UPSERT → revoke + grant/update), managed_update_membership (UPDATE →
--   update/revoke lógico), managed_revoke_membership (UPDATE status='revoked'
--   → revoke), e2e_hard_delete_user (borrado de usuario → cascada FK
--   ON DELETE CASCADE → DELETE → revoke con actor etiquetado). Pruebas:
--   supabase/tests/membership_audit_test.sql.
--
-- IDEMPOTENTE: re-ejecutable (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_sec026_membership_audit
--     ON public.user_store_memberships;
--   DROP FUNCTION IF EXISTS public.sec026_membership_audit_fn();
--   (audit_logs no se toca: sus filas del trigger son datos históricos que se
--    conservan; si se quiere purgar, filtrar por metadata->>'source' =
--    'cp_sec_026_trigger').
-- ═══════════════════════════════════════════════════════════════════════════

-- ── GUARD fail-closed (patrón PR #1444): aborta si el entorno no es el
--    esperado. Sin tabla/columnas requeridas, sin enum con 'revoked', o con
--    FORCE RLS en audit_logs (el definer quedaría sujeto a RLS sin policy y
--    TODO alta/cambio/baja de membresía fallaría), la migración NO aplica. ──
DO $cp_sec_026_guard$
DECLARE
    v_missing text;
BEGIN
    IF to_regclass('public.user_store_memberships') IS NULL THEN
        v_missing := 'public.user_store_memberships';
    ELSIF to_regclass('public.audit_logs') IS NULL THEN
        v_missing := 'public.audit_logs';
    END IF;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION
            'CP-SEC-026 GUARD FAIL-CLOSED: no existe la tabla esperada %.',
            v_missing
            USING HINT = 'Aplica primero el baseline del esquema; aborta sin cambios.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_store_memberships'
          AND column_name IN ('id', 'user_id', 'store_id', 'role', 'status')
        HAVING count(*) = 5
    ) THEN
        RAISE EXCEPTION
            'CP-SEC-026 GUARD FAIL-CLOSED: user_store_memberships no tiene las columnas esperadas (id, user_id, store_id, role, status).'
            USING HINT = 'Revisa el esquema real antes de auditar sus filas.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_logs'
          AND column_name IN ('id', 'user_id', 'table_name', 'record_id',
                              'action', 'old_data', 'new_data', 'metadata', 'store_id')
        HAVING count(*) = 9
    ) THEN
        RAISE EXCEPTION
            'CP-SEC-026 GUARD FAIL-CLOSED: audit_logs no admite el formato de evento esperado (columnas id, user_id, table_name, record_id, action, old_data, new_data, metadata, store_id).'
            USING HINT = 'El formato del evento debe adaptarse al esquema REAL de audit_logs.';
    END IF;

    IF (SELECT count(*)
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'membership_status'
          AND e.enumlabel IN ('active', 'revoked')) < 2 THEN
        RAISE EXCEPTION
            'CP-SEC-026 GUARD FAIL-CLOSED: el enum membership_status no distingue active/revoked; la clasificación de borrado lógico no es fiable.'
            USING HINT = 'Sin active/revoked no se puede clasificar membership_revoke lógico.';
    END IF;

    IF (SELECT relforcerowsecurity
        FROM pg_class WHERE oid = 'public.audit_logs'::regclass) THEN
        RAISE EXCEPTION
            'CP-SEC-026 GUARD FAIL-CLOSED: audit_logs tiene FORCE ROW LEVEL SECURITY; el INSERT del trigger (definer postgres, sin policy) fallaría y bloquearía toda operación sobre membresías.'
            USING HINT = 'Retira FORCE RLS de audit_logs o dota una policy al dueño antes de activar el trigger.';
    END IF;
END
$cp_sec_026_guard$;

-- ── Función del trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sec026_membership_audit_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $cp_sec_026_fn$
DECLARE
    v_actor      uuid;
    v_actor_kind text;
    v_claims     jsonb;
    v_action     text;
    v_old        jsonb;
    v_new        jsonb;
    v_changed    jsonb := '{}'::jsonb;
    v_record_id  uuid;
    v_store_id   uuid;
    v_target     uuid;
BEGIN
    -- Actor (D1.3): auth.uid() o etiqueta explícita, nunca vacío.
    v_actor := auth.uid();
    IF v_actor IS NOT NULL THEN
        v_actor_kind := 'authenticated';
    ELSE
        v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
        IF v_claims IS NOT NULL AND v_claims ->> 'role' = 'service_role' THEN
            v_actor_kind := 'service_role';
        ELSE
            v_actor_kind := 'sql_directo';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_action    := 'membership_grant';
        v_record_id := NEW.id;
        v_store_id  := NEW.store_id;
        v_target    := NEW.user_id;
        v_new       := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action    := 'membership_revoke';
        v_record_id := OLD.id;
        v_store_id  := OLD.store_id;
        v_target    := OLD.user_id;
        v_old       := to_jsonb(OLD);
    ELSE
        -- UPDATE: clasificar. Solo importan los campos relevantes; los UPDATE
        -- sin cambio real no generan evento (D1.2).
        v_record_id := NEW.id;
        v_store_id  := NEW.store_id;
        v_target    := NEW.user_id;
        v_old       := to_jsonb(OLD);
        v_new       := to_jsonb(NEW);

        IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            v_changed := v_changed || jsonb_build_object(
                'user_id', jsonb_build_object('old', OLD.user_id, 'new', NEW.user_id));
        END IF;
        IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
            v_changed := v_changed || jsonb_build_object(
                'store_id', jsonb_build_object('old', OLD.store_id, 'new', NEW.store_id));
        END IF;
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            v_changed := v_changed || jsonb_build_object(
                'role', jsonb_build_object('old', OLD.role::text, 'new', NEW.role::text));
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            v_changed := v_changed || jsonb_build_object(
                'status', jsonb_build_object('old', OLD.status::text, 'new', NEW.status::text));
        END IF;

        IF NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN
            -- Borrado LÓGICO: cuenta como revoke (D1.2).
            v_action := 'membership_revoke';
        ELSIF v_changed <> '{}'::jsonb THEN
            v_action := 'membership_update';
        ELSE
            RETURN NULL; -- UPDATE sin cambio real: 0 eventos.
        END IF;
    END IF;

    -- INSERT de auditoría (sin handler de excepciones: si falla, la operación
    -- sobre la membresía falla con él — D1.4 fail-closed).
    INSERT INTO public.audit_logs
        (user_id, table_name, record_id, action, old_data, new_data, metadata, store_id)
    VALUES
        (v_actor,
         'user_store_memberships',
         v_record_id,
         v_action,
         v_old,
         v_new,
         jsonb_build_object(
             'actor_kind',      v_actor_kind,
             'db_role',         current_user,
             'target_user_id',  v_target,
             'changed_fields',  v_changed,
             'source',          'cp_sec_026_trigger'
         ),
         v_store_id);

    RETURN NULL; -- AFTER trigger: no altera la fila.
END
$cp_sec_026_fn$;

-- ── Trigger (re)creación idempotente ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sec026_membership_audit ON public.user_store_memberships;
CREATE TRIGGER trg_sec026_membership_audit
    AFTER INSERT OR UPDATE OR DELETE
    ON public.user_store_memberships
    FOR EACH ROW
    EXECUTE FUNCTION public.sec026_membership_audit_fn();

-- ── D1.5: cerrar la invocación directa desde clientes. La función solo la
--    ejecuta el trigger (el EXECUTE se comprueba al crear el trigger, no en
--    cada disparo), así que el REVOKE no afecta al camino normal. ───────────
REVOKE EXECUTE ON FUNCTION public.sec026_membership_audit_fn()
    FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sec026_membership_audit_fn() IS
    'CP-SEC-026: audita INSERT/UPDATE/DELETE de user_store_memberships hacia audit_logs (membership_grant/update/revoke). SECURITY DEFINER porque la policy INSERT de audit_logs exige auth.uid() y en service_role/SQL directo el actor es NULL. Fail-closed: fallo del INSERT = fallo de la operación. Rollback: DROP TRIGGER trg_sec026_membership_audit + DROP FUNCTION.';

COMMENT ON TRIGGER trg_sec026_membership_audit ON public.user_store_memberships IS
    'CP-SEC-026: auditoría de altas/cambios/bajas de membresías (quién otorgó o revocó acceso a tienda).';
