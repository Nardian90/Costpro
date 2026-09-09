-- ============================================================================
-- 20260909000003_rem_f4_06b_audit_fiscal_closing_record_id_uuid.sql
-- REM-F4-06b — Corrección quirúrgica del defecto UUID→TEXT en
--              audit_fiscal_closings_changes()
--
-- Defecto (gate 20260909-rem-f4-06b, ver audit-evidence/20260909-rem-f4-06b):
--   D2: record_id = NEW.id::text  contra audit_logs.record_id (uuid)
--       → SQLSTATE 42804 (uuid → text → uuid, contrario al contrato canónico)
--   D1 (intra-objeto, enmascaraba a D2): metadata NEW.year/NEW.month no
--       existen en fiscal_closings (columnas reales: period_year/period_month)
--       → SQLSTATE 42703.
--   Ambos dentro del MISMO objeto. Cualquier INSERT/UPDATE sobre
--   fiscal_closings abortaba (tabla con 0 filas desde 20260809).
--
-- Cambio exacto (3 líneas, misma declaración INSERT; todo lo demás
-- byte-idéntico a la definición PRE):
--   CASE WHEN TG_OP='INSERT' THEN NEW.id::text ELSE NEW.id::text END → NEW.id
--   'year',  ... NEW.year  ... → 'year',  ... NEW.period_year  ...
--   'month', ... NEW.month ... → 'month', ... NEW.period_month ...
--
-- Preserva: owner (CREATE OR REPLACE conserva el existente), SECURITY
-- DEFINER, SET search_path TO 'public','pg_temp', firma (), trigger
-- trg_audit_fiscal_closings (AFTER INSERT OR UPDATE), eventos, semántica de
-- auditoría (acciones, columnas audit_logs, claves de metadata).
--
-- NO modifica: audit_logs (record_id sigue uuid), fiscal_closings, RLS, ACL,
-- prevent_fiscal_closing_edit, otras audit_*, RPCs fiscales, src/.
--
-- Rollback: re-aplicar la definición PRE (raw/pre_function_definition.sql)
-- con CREATE OR REPLACE FUNCTION. Transaccional: si algún guard POST falla,
-- RAISE hace rollback del CREATE OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- GUARD PRE — precondiciones, objetos, tipos, estado esperado
-- ---------------------------------------------------------------------------
DO $f406b_pre$
DECLARE
  v_id_type        text;
  v_rec_type       text;
  v_period_year    boolean;
  v_period_month   boolean;
  v_fn_exists      boolean;
  v_fn_def         text;
  v_trigger_ok     bigint;
  v_fn_owner       text;
BEGIN
  -- 1) Tipos esperados
  SELECT data_type INTO v_id_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='fiscal_closings' AND column_name='id';
  IF v_id_type IS NULL THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: fiscal_closings.id no existe';
  END IF;
  IF v_id_type <> 'uuid' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: fiscal_closings.id esperado uuid, encontrado %', v_id_type;
  END IF;

  SELECT data_type INTO v_rec_type
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='audit_logs' AND column_name='record_id';
  IF v_rec_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: audit_logs.record_id esperado uuid, encontrado %', COALESCE(v_rec_type,'NULL');
  END IF;

  -- 2) Columnas reales requeridas por la corrección de metadata (D1)
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='fiscal_closings'
                    AND column_name='period_year') INTO v_period_year;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='fiscal_closings'
                    AND column_name='period_month') INTO v_period_month;
  IF NOT v_period_year OR NOT v_period_month THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: fiscal_closings.period_year/period_month no encontradas';
  END IF;

  -- 3) Función objetivo existe, en estado defectuoso esperado o ya remediada
  SELECT EXISTS (SELECT 1 FROM pg_proc
                  WHERE proname='audit_fiscal_closings_changes'
                    AND pronamespace='public'::regnamespace) INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: audit_fiscal_closings_changes() no existe';
  END IF;

  SELECT pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner)
    INTO v_fn_def, v_fn_owner
    FROM pg_proc p
   WHERE p.proname='audit_fiscal_closings_changes'
     AND p.pronamespace='public'::regnamespace;

  IF v_fn_owner <> 'postgres' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: owner inesperado % (esperado postgres)', v_fn_owner;
  END IF;

  IF v_fn_def LIKE '%NEW.id::text%' THEN
    RAISE NOTICE 'F4-06B: estado defectuoso detectado (NEW.id::text presente) — aplicando corrección';
  ELSIF v_fn_def LIKE '%period_year%' AND v_fn_def NOT LIKE '%::text%' THEN
    RAISE NOTICE 'F4-06B: función ya remediada (re-ejecución idempotente) — se re-aplica cuerpo idéntico';
  ELSE
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: definición PRE inesperada — ABORT (revisar 01_OBJECT_FORENSICS)';
  END IF;

  -- 4) Trigger asociado presente y habilitado
  SELECT count(*) INTO v_trigger_ok
    FROM pg_trigger
   WHERE tgname='trg_audit_fiscal_closings'
     AND tgrelid='public.fiscal_closings'::regclass
     AND NOT tgisinternal
     AND tgenabled='O';
  IF v_trigger_ok <> 1 THEN
    RAISE EXCEPTION 'F4-06B-GUARD-PRE: trigger trg_audit_fiscal_closings ausente o no habilitado';
  END IF;
END
$f406b_pre$;

-- ---------------------------------------------------------------------------
-- CORRECCIÓN — único objeto modificado, cuerpo idéntico excepto 3 líneas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_fiscal_closings_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'FISCAL_CLOSING_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'FISCAL_CLOSING_UPDATED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'fiscal_closings',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.store_id ELSE NEW.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'year', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_year ELSE NULL END,
      'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_month ELSE NULL END,
      'status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
    ));

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- GUARD POST — postcondiciones (fallo ⇒ rollback transaccional total)
-- ---------------------------------------------------------------------------
DO $f406b_post$
DECLARE
  v_fn_def   text;
  v_secdef   boolean;
  v_cfg      text;
  v_owner    text;
  v_trigger_ok bigint;
  v_ret_type text;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef,
         COALESCE(array_to_string(p.proconfig, ','), ''),
         pg_get_userbyid(p.proowner)
    INTO v_fn_def, v_secdef, v_cfg, v_owner
    FROM pg_proc p
   WHERE p.proname='audit_fiscal_closings_changes'
     AND p.pronamespace='public'::regnamespace;

  -- Integridad uuid: sin casts ::text y sin referencias a columnas inexistentes
  IF v_fn_def LIKE '%::text%' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: la función aún contiene casts ::text';
  END IF;
  IF v_fn_def LIKE '%NEW.year%' OR v_fn_def LIKE '%NEW.month%' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: la función aún referencia NEW.year/NEW.month';
  END IF;
  IF v_fn_def NOT LIKE '%NEW.period_year%' OR v_fn_def NOT LIKE '%NEW.period_month%' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: faltan referencias period_year/period_month';
  END IF;
  IF v_fn_def !~ 'NEW\.id,\s*$' AND v_fn_def NOT LIKE '%NEW.id,%' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: asignación record_id = NEW.id no encontrada';
  END IF;

  -- Propiedades preservadas (PRE == POST)
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: SECURITY DEFINER perdido';
  END IF;
  IF v_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: search_path alterado (%)', v_cfg;
  END IF;
  IF v_owner <> 'postgres' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: owner alterado (%)', v_owner;
  END IF;

  SELECT count(*) INTO v_trigger_ok
    FROM pg_trigger
   WHERE tgname='trg_audit_fiscal_closings'
     AND tgrelid='public.fiscal_closings'::regclass
     AND NOT tgisinternal
     AND tgenabled='O';
  IF v_trigger_ok <> 1 THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: trigger trg_audit_fiscal_closings alterado';
  END IF;

  -- Tipo de retorno y firma intactos
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_ret_type
    FROM pg_proc p
   WHERE p.proname='audit_fiscal_closings_changes'
     AND p.pronamespace='public'::regnamespace;
  IF v_ret_type IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'F4-06B-GUARD-POST: firma alterada (%)', v_ret_type;
  END IF;

  RAISE NOTICE 'F4-06B: corrección aplicada y verificada (uuid=uuid, propiedades preservadas)';
END
$f406b_post$;
