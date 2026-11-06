-- =====================================================================
-- 20261106130000_production_migration_ledger.sql — T2 D2.1 (COSTPRO)
-- Libro de migraciones de producción: SOLO-ADICIÓN, honesto, auditable.
-- ----------------------------------------------------------------------------
-- PROBLEMA: supabase_migrations.schema_migrations de producción tiene 12 filas
-- frente a 534+ archivos; la BD no sabe qué se le aplicó. NO se toca
-- schema_migrations ni se hace backfill masivo (anti-patrón explícito).
-- Esta tabla registra A partir de ahora cada aplicación con: versión, archivo,
-- sha256, mecanismo, evidencia, autor y estado. La siembra (baseline + filas
-- con evidencia directa) es un script SEPARADO (scripts/ops/
-- production_migration_ledger_seed.sql) que SOLO se ejecuta en producción con
-- la compuerta literal `AUTORIZO LEDGER PROD`.
-- ----------------------------------------------------------------------------
-- Diseño:
--  - RLS habilitado SIN políticas: anon/authenticated no ven NI pueden hacer
--    nada (deny-all); el acceso de escritura es exclusivamente
--    service_role/postgres (BYPASSRLS). Sin SECURITY DEFINER innecesario.
--  - Trigger SOLO-ADICIÓN: bloquea UPDATE y DELETE. Una reversión es una fila
--    NUEVA con status='rolled_back' (historial inmutable).
--  - search_path fijo en la función de trigger (patrón del repo).
--  - Índice único parcial: una sola fila 'applied' por versión (una reversión
--    libera la versión y permite re-aplicarla como fila nueva).
--  - Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE + DROP
--    TRIGGER IF EXISTS + guardas de integridad de columnas.
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.production_migration_ledger (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version     text        NOT NULL,
  file        text        NOT NULL,
  sha256      text        NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  mechanism   text        NOT NULL, -- 'management_api' | 'sql_editor' | 'cli' | 'owner_manual'
  evidence    text        NOT NULL, -- ruta de evidencia en audit-evidence/ (obligatoria)
  applied_by  text        NOT NULL, -- ETIQUETA DE ROL (p. ej. 'owner', 'agent-session'); nunca emails ni nombres
  status      text        NOT NULL DEFAULT 'applied'
              CHECK (status IN ('applied', 'baseline', 'rolled_back')),
  notes       text
);

COMMENT ON TABLE public.production_migration_ledger IS
  'Libro de migraciones de producción (T2): SOLO-ADICIÓN. Registro de cada aplicación con evidencia. RLS sin políticas (solo service_role/postgres). UPDATE/DELETE bloqueados por trigger.';

-- Idempotencia estricta: si la tabla ya existía con otro shape, las columnas
-- obligatorias deben existir (guard fail-closed, no migración silenciosa).
DO $ledger$
DECLARE
  v_faltan text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'production_migration_ledger') THEN
    SELECT string_agg(c, ', ') INTO v_faltan
      FROM unnest(ARRAY['id','version','file','sha256','applied_at','mechanism','evidence','applied_by','status','notes']) AS c
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'production_migration_ledger' AND column_name = c);
    IF v_faltan IS NOT NULL THEN
      RAISE EXCEPTION 'LEDGER-GUARD: la tabla existente carece de columnas obligatorias (%): revisar drift antes de re-aplicar', v_faltan;
    END IF;
  END IF;
END
$ledger$;

ALTER TABLE public.production_migration_ledger ENABLE ROW LEVEL SECURITY;

-- Índice único parcial: una sola fila 'applied' por versión (idempotencia lógica)
CREATE UNIQUE INDEX IF NOT EXISTS production_migration_ledger_version_applied_uidx
  ON public.production_migration_ledger (version) WHERE status = 'applied';
CREATE INDEX IF NOT EXISTS production_migration_ledger_file_idx
  ON public.production_migration_ledger (file);

-- Función de trigger SOLO-ADICIÓN (SECURITY INVOKER — no necesita definer)
CREATE OR REPLACE FUNCTION public.production_migration_ledger_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'production_migration_ledger es SOLO-ADICIÓN: % bloqueado. Una reversión se registra como fila NUEVA con status=''rolled_back''.', TG_OP
    USING ERRCODE = '55006';
END;
$function$;

DROP TRIGGER IF EXISTS trg_production_migration_ledger_append_only ON public.production_migration_ledger;
CREATE TRIGGER trg_production_migration_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.production_migration_ledger
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.production_migration_ledger_append_only();

-- Verificación posterior fail-closed
DO $ledger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
                 WHERE c.relname = 'production_migration_ledger' AND t.tgname = 'trg_production_migration_ledger_append_only' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'LEDGER-VERIFY: el trigger SOLO-ADICIÓN no quedó instalado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = 'production_migration_ledger' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'LEDGER-VERIFY: RLS no quedó habilitado';
  END IF;
END
$ledger$;

COMMIT;
