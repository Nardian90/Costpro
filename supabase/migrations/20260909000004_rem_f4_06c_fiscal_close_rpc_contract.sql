-- ============================================================================
-- Migration: 20260909000004_rem_f4_06c_fiscal_close_rpc_contract.sql
-- Gate: REM-F4-06c — repair OF-1 (lock wiring) + OF-3 (close phantom table)
-- ----------------------------------------------------------------------------
-- OF-1: lock_fiscal_period no aceptaba la identidad del actor (p_user_id) que el
--       único consumidor autorizado (service_role vía route.ts, identidad NextAuth
--       server-side) le pasa; auth.uid() es NULL bajo service_role desde el
--       endurecimiento w9_f06_c2 → añade p_user_id DEFAULT NULL con el patrón
--       canónico anti-spoofing v2_12_9 (idéntico al de close_fiscal_period).
-- OF-3: close_fiscal_period fue regredido por 20260727000012_v2_12_18 a escribir en
--       fiscal_period_closures, tabla que NUNCA existió en la cadena de migraciones.
--       Se restaura el cuerpo canónico v2_12_9 que escribe el modelo único
--       fiscal_closings (UPDATE open→closed o INSERT con totales).
-- Preserva: firmas compatibles, SECDEF, search_path, owner, ACL (solo
-- postgres/service_role), triggers (audit F4-06b + prevent_fiscal_closing_edit),
-- tipos uuid, errores canónicos (ERR_UNAUTHORIZED/ERR_PERIOD_LOCKED/ERR_ADMIN_ONLY/
-- ERR_NOT_CLOSED), retorno jsonb. DDL transaccional: cualquier guard fallido ⇒ ROLLBACK.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- GUARDS PRE — abortar (rollback total) ante cualquier estado inesperado
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cols TEXT; v_rec TEXT;
  v_lock_sig TEXT; v_lock_body TEXT;
  v_close_sig TEXT; v_close_body TEXT;
  v_exists TEXT;
BEGIN
  -- G1: tipos canónicos intactos (contrato F4-06b)
  SELECT udt_name INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='fiscal_closings' AND column_name='id';
  SELECT udt_name INTO v_rec FROM information_schema.columns
   WHERE table_schema='public' AND table_name='audit_logs' AND column_name='record_id';
  IF v_cols IS DISTINCT FROM 'uuid' OR v_rec IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'GUARD_FAIL: tipos uuid esperados en fiscal_closings.id/audit_logs.record_id (got %/%)', v_cols, v_rec;
  END IF;

  -- G2: fiscal_period_closures NO debe existir en ningún relkind (estado OF-3 conocido)
  SELECT c.relname::text INTO v_exists FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='fiscal_period_closures';
  IF v_exists IS NOT NULL THEN
    RAISE EXCEPTION 'GUARD_FAIL: fiscal_period_closures existe (%); estado inesperado — revisar antes de aplicar', v_exists;
  END IF;

  -- G3: lock_fiscal_period en estado defectuoso conocido (3 args) o ya remediado (4 args)
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_lock_sig FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='lock_fiscal_period';
  SELECT pg_get_functiondef(p.oid) INTO v_lock_body FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='lock_fiscal_period';
  IF v_lock_sig IS NULL THEN
    RAISE EXCEPTION 'GUARD_FAIL: lock_fiscal_period no existe';
  END IF;
  IF v_lock_sig NOT IN ('p_store_id uuid, p_year integer, p_month integer',
                        'p_store_id uuid, p_year integer, p_month integer, p_user_id uuid') THEN
    RAISE EXCEPTION 'GUARD_FAIL: firma inesperada de lock_fiscal_period: %', v_lock_sig;
  END IF;
  IF v_lock_body NOT LIKE '%ERR_ADMIN_ONLY%' OR v_lock_body NOT LIKE '%fiscal_closings%' THEN
    RAISE EXCEPTION 'GUARD_FAIL: cuerpo de lock_fiscal_period no coincide con el contrato conocido';
  END IF;

  -- G4: close_fiscal_period en estado defectuoso conocido (tabla fantasma) o ya remediado
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_close_sig FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='close_fiscal_period';
  SELECT pg_get_functiondef(p.oid) INTO v_close_body FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='close_fiscal_period';
  IF v_close_sig IS NULL THEN
    RAISE EXCEPTION 'GUARD_FAIL: close_fiscal_period no existe';
  END IF;
  IF v_close_sig NOT IN ('p_store_id uuid, p_year integer, p_month integer, p_user_id uuid') THEN
    RAISE EXCEPTION 'GUARD_FAIL: firma inesperada de close_fiscal_period: %', v_close_sig;
  END IF;
  IF (v_close_body NOT LIKE '%fiscal_period_closures%')
     AND (v_close_body NOT LIKE '%closing_id%') THEN
    RAISE EXCEPTION 'GUARD_FAIL: cuerpo de close_fiscal_period no coincide con ningún contrato conocido';
  END IF;

  -- G5: triggers protectores habilitados
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='fiscal_closings'::regclass
                 AND tgname='trg_audit_fiscal_closings' AND tgenabled='O') THEN
    RAISE EXCEPTION 'GUARD_FAIL: trg_audit_fiscal_closings no está habilitado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='fiscal_closings'::regclass
                 AND tgname='prevent_fiscal_closing_edit' AND tgenabled='O') THEN
    RAISE EXCEPTION 'GUARD_FAIL: prevent_fiscal_closing_edit no está habilitado';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- REMEDIACIÓN OF-1 — lock_fiscal_period: identidad server-side canónica (v2_12_9)
-- NOTA: CREATE OR REPLACE no puede cambiar la firma → DROP+CREATE. El objeto no
-- tiene comment ni dependientes; ACL se reconstruye EXACTA (sin PUBLIC: las
-- funciones nuevas conceden EXECUTE a PUBLIC por defecto — debe revocarse).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.lock_fiscal_period(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.lock_fiscal_period(
    p_store_id UUID,
    p_year INTEGER,
    p_month INTEGER,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    -- Patrón canónico anti-spoofing v2_12_9: bajo service_role la identidad la
    -- provee el código servidor (route.ts ← sesión NextAuth); bajo authenticated,
    -- el JWT del propio usuario. Nunca confianza en identidad enviada por cliente.
    v_admin_id UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional para que la auditoría
    -- por trigger (audit_fiscal_closings_changes → auth.uid()) registre el ACTOR
    -- real también en la vía HTTP service_role (canónico del codebase:
    -- CREATE_SALE_V2 audit 100% con actor). Valor SOLO server-side; local a la txn.
    IF v_admin_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_ADMIN_ONLY: Solo admin puede bloquear periodos fiscales';
    END IF;

    UPDATE public.fiscal_closings
    SET status = 'locked', locked_by = v_admin_id, locked_at = now(), updated_at = now()
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month AND status = 'closed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_CLOSED: El periodo debe estar cerrado antes de bloquearse';
    END IF;

    RETURN jsonb_build_object('status', 'success', 'message', 'Periodo bloqueado');
END;
$function$;

-- Reconstrucción EXACTA de ACL (estado w9_f06_c2: solo postgres/service_role, sin PUBLIC)
REVOKE ALL ON FUNCTION public.lock_fiscal_period(uuid, integer, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_fiscal_period(uuid, integer, integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lock_fiscal_period(uuid, integer, integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lock_fiscal_period(uuid, integer, integer, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.lock_fiscal_period(uuid, integer, integer, uuid) TO service_role;

COMMENT ON FUNCTION public.lock_fiscal_period(uuid, integer, integer, uuid) IS
  'REM-F4-06c (OF-1): p_user_id opcional con patrón canónico anti-spoofing V2.12.9 (service_role ← identidad server-side de route.ts; authenticated ← auth.uid()). locked_by = admin resuelto.';

-- ----------------------------------------------------------------------------
-- REMEDIACIÓN OF-3 — close_fiscal_period: restauración del cuerpo canónico
-- v2_12_9 (escribe el modelo único fiscal_closings; sin tabla fantasma).
-- Auditoría: automática vía trg_audit_fiscal_closings (record_id = id uuid).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_closing_id UUID; v_total_sales NUMERIC := 0; v_total_devolutions NUMERIC := 0;
    v_total_purchases NUMERIC := 0; v_total_commissions NUMERIC := 0;
    v_date_from TIMESTAMPTZ; v_date_to TIMESTAMPTZ;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional (actor real en auditoría
    -- por trigger en la vía HTTP service_role). Aditivo; no altera lógica de negocio.
    IF v_uid IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    END IF;
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_date_from := make_date(p_year, p_month, 1);
    v_date_to := make_date(p_year, p_month, 1) + INTERVAL '1 month';
    SELECT id INTO v_closing_id FROM public.fiscal_closings WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;
    IF v_closing_id IS NOT NULL THEN
        UPDATE public.fiscal_closings SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now()
        WHERE id = v_closing_id AND status = 'open';
        IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PERIOD_LOCKED'; END IF;
    ELSE
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales FROM public.transactions WHERE store_id = p_store_id AND status = 'completed' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_devolutions FROM public.devolutions WHERE store_id = p_store_id AND status = 'completed' AND processed_at >= v_date_from AND processed_at < v_date_to;
        SELECT COALESCE(SUM(total_cost), 0) INTO v_total_purchases FROM public.receipts WHERE store_id = p_store_id AND status = 'active' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(final_amount), 0) INTO v_total_commissions FROM public.commission_payments WHERE store_id = p_store_id AND status = 'paid' AND paid_at >= v_date_from AND paid_at < v_date_to;
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, total_sales, total_devolutions, total_purchases, total_commissions, total_cash_balance, closed_by, closed_at)
        VALUES (p_store_id, p_year, p_month, 'closed', v_total_sales, v_total_devolutions, v_total_purchases, v_total_commissions, v_total_sales - v_total_devolutions - v_total_commissions, v_uid, now())
        RETURNING id INTO v_closing_id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'closing_id', v_closing_id, 'total_sales', v_total_sales, 'total_devolutions', v_total_devolutions, 'total_purchases', v_total_purchases, 'total_commissions', v_total_commissions);
END;
$function$;

COMMENT ON FUNCTION public.close_fiscal_period(uuid, integer, integer, uuid) IS
  'V2.12.18: patrón IS NULL OR NOT explícito (consistencia V2.12.12). V2.12.9: anti-spoofing. REM-F4-06c (OF-3): restaurado cuerpo canónico V2.12.9 — escribe el modelo único fiscal_closings (la referencia a fiscal_period_closures era regresión de V2.12.18); auditoría vía trigger (record_id uuid).';

-- ----------------------------------------------------------------------------
-- GUARDS POST — estado final exigido (fallo ⇒ ROLLBACK total)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_lock_sig TEXT; v_lock_body TEXT; v_lock_owner TEXT; v_lock_secdef BOOL; v_lock_cfg TEXT[]; v_lock_acl TEXT;
  v_close_body TEXT; v_close_owner TEXT; v_close_secdef BOOL; v_close_cfg TEXT[]; v_close_acl TEXT;
  v_exists TEXT;
BEGIN
  SELECT pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid),
         pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         coalesce(array_to_string(p.proacl, ','), 'NULL')
    INTO v_lock_sig, v_lock_body, v_lock_owner, v_lock_secdef, v_lock_cfg, v_lock_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='lock_fiscal_period';

  IF v_lock_sig IS DISTINCT FROM 'p_store_id uuid, p_year integer, p_month integer, p_user_id uuid' THEN
    RAISE EXCEPTION 'POST_FAIL: firma lock %', v_lock_sig;
  END IF;
  IF v_lock_body NOT LIKE '%v_admin_id%' OR v_lock_body NOT LIKE '%locked_by = v_admin_id%'
     OR v_lock_body NOT LIKE '%ERR_ADMIN_ONLY%' OR v_lock_body NOT LIKE '%ERR_NOT_CLOSED%'
     OR v_lock_body NOT LIKE '%set_config(''request.jwt.claims''%'
     OR v_lock_body LIKE '%auth.uid(), locked_at%' THEN
    RAISE EXCEPTION 'POST_FAIL: cuerpo lock inesperado';
  END IF;
  IF NOT v_lock_secdef OR v_lock_owner IS DISTINCT FROM 'postgres'
     OR v_lock_cfg IS DISTINCT FROM ARRAY['search_path=public']
     OR v_lock_acl IS DISTINCT FROM 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'POST_FAIL: propiedades lock alteradas (owner=%, secdef=%, cfg=%, acl=%)', v_lock_owner, v_lock_secdef, v_lock_cfg, v_lock_acl;
  END IF;

  SELECT pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         coalesce(array_to_string(p.proacl, ','), 'NULL')
    INTO v_close_body, v_close_owner, v_close_secdef, v_close_cfg, v_close_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='close_fiscal_period';

  IF v_close_body LIKE '%fiscal_period_closures%' THEN
    RAISE EXCEPTION 'POST_FAIL: close aún referencia la tabla fantasma';
  END IF;
  IF v_close_body NOT LIKE '%INSERT INTO public.fiscal_closings%'
     OR v_close_body NOT LIKE '%closing_id%'
     OR v_close_body NOT LIKE '%has_store_access_as%'
     OR v_close_body NOT LIKE '%set_config(''request.jwt.claims''%'
     OR v_close_body NOT LIKE '%ERR_UNAUTHORIZED%'
     OR v_close_body NOT LIKE '%ERR_PERIOD_LOCKED%' THEN
    RAISE EXCEPTION 'POST_FAIL: cuerpo close inesperado';
  END IF;
  IF NOT v_close_secdef OR v_close_owner IS DISTINCT FROM 'postgres'
     OR v_close_cfg IS DISTINCT FROM ARRAY['search_path=public, pg_temp']
     OR v_close_acl IS DISTINCT FROM 'postgres=X/postgres,service_role=X/postgres' THEN
    RAISE EXCEPTION 'POST_FAIL: propiedades close alteradas (owner=%, secdef=%, cfg=%, acl=%)', v_close_owner, v_close_secdef, v_close_cfg, v_close_acl;
  END IF;

  SELECT c.relname::text INTO v_exists FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname='public' AND c.relname='fiscal_period_closures';
  IF v_exists IS NOT NULL THEN
    RAISE EXCEPTION 'POST_FAIL: fiscal_period_closures no debe existir';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='fiscal_closings'::regclass
                 AND tgname='trg_audit_fiscal_closings' AND tgenabled='O')
  OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='fiscal_closings'::regclass
                 AND tgname='prevent_fiscal_closing_edit' AND tgenabled='O') THEN
    RAISE EXCEPTION 'POST_FAIL: triggers de fiscal_closings alterados';
  END IF;
END $$;

COMMIT;
