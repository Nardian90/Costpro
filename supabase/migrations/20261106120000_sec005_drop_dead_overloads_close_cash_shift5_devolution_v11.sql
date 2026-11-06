-- CP-SEC-005 · T1 D1.1 — RETIRAR sobrecargas muertas del replay (paridad con producción)
-- ============================================================================
-- close_cash_shift/5 y create_devolution_v2/11 existen SOLO en CostproE2E:
-- producción las retiró out-of-band sin migración registrada (SEC-005_PARIDAD_REPLAY.md).
-- Esta migración hace que el replay termine IGUAL que producción SIN esas dos
-- aridades. NO toca la lógica de close_cash_shift/6 ni de create_devolution_v2/12.
--
-- En producción es un NO-OP (DROP FUNCTION IF EXISTS con firma exacta; la BD ya
-- no las tiene [MEDIDO 2026-11-06, T0.1]: prod tiene solo close_cash_shift/6 y
-- create_devolution_v2/12). Se aplica SOLO en CostproE2E vía apilador.
--
-- Guards procedurales previos a la aplicación (evidencia):
--  (a) producción todavía tiene esa sobrecarga → NO APLICAR y reportar.
--      [MEDIDO 2026-11-06]: prod sin close_cash_shift/5 y sin create_devolution_v2/11
--      (audit-evidence/T0-DERIVA/huellas-md5-prod.json).
--  (b) call-sites que resuelvan a esa aridad → NINGUNO [MEDIDO 2026-11-06]:
--      * close_cash_shift: todos los call-sites de src/ envían 6 parámetros
--        nombrados incluyendo p_declared_cash_usd → resuelven a la /6.
--      * create_devolution_v2: src/app/api/devolutions/route.ts:161 envía
--        p_refund_currency → resuelve a la /12.
--  (c) dependencias pg_depend (vistas, triggers, otras funciones) → guard
--      fail-closed IN-MIGRACIÓN (abajo); aborta si existe cualquiera.
-- Idempotente: DROP FUNCTION IF EXISTS con firma EXACTA + re-verificación.
BEGIN;

DO $sec005$
DECLARE
  v_deps integer;
  v_cc5 oid;
  v_dv11 oid;
BEGIN
  -- GUARD: las versiones canónicas DEBEN existir antes de retirar las muertas
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                 WHERE n.nspname = 'public' AND p.proname = 'close_cash_shift'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_declared_cash_usd%') THEN
    RAISE EXCEPTION 'SEC005-GUARD: falta close_cash_shift/6 (p_declared_cash_usd): no se retira la /5';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                 WHERE n.nspname = 'public' AND p.proname = 'create_devolution_v2'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_refund_currency%') THEN
    RAISE EXCEPTION 'SEC005-GUARD: falta create_devolution_v2/12 (p_refund_currency): no se retira la /11';
  END IF;

  -- GUARD (c): pg_depend — ninguna vista/trigger/función puede depender de las muertas
  SELECT p.oid INTO v_cc5 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'close_cash_shift'
      AND pg_get_function_identity_arguments(p.oid) = 'p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid';
  IF v_cc5 IS NOT NULL THEN
    SELECT count(*) INTO v_deps FROM pg_depend d
      WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = v_cc5
        AND d.deptype IN ('n', 'i') AND d.objid <> d.refobjid;
    IF v_deps > 0 THEN
      RAISE EXCEPTION 'SEC005-GUARD: close_cash_shift/5 tiene % dependencia(s) en pg_depend: STOP', v_deps;
    END IF;
  END IF;

  SELECT p.oid INTO v_dv11 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_devolution_v2'
      AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text, p_operation_date timestamp with time zone';
  IF v_dv11 IS NOT NULL THEN
    SELECT count(*) INTO v_deps FROM pg_depend d
      WHERE d.refclassid = 'pg_proc'::regclass AND d.refobjid = v_dv11
        AND d.deptype IN ('n', 'i') AND d.objid <> d.refobjid;
    IF v_deps > 0 THEN
      RAISE EXCEPTION 'SEC005-GUARD: create_devolution_v2/11 tiene % dependencia(s) en pg_depend: STOP', v_deps;
    END IF;
  END IF;
END
$sec005$;

DROP FUNCTION IF EXISTS public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid);
DROP FUNCTION IF EXISTS public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text, p_operation_date timestamp with time zone);

-- Verificación posterior fail-closed: canónicas presentes y muertas ausentes
DO $sec005$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                 WHERE n.nspname = 'public' AND p.proname = 'close_cash_shift'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_declared_cash_usd%') THEN
    RAISE EXCEPTION 'SEC005-VERIFY: close_cash_shift/6 desapareció tras el drop';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                 WHERE n.nspname = 'public' AND p.proname = 'create_devolution_v2'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_refund_currency%') THEN
    RAISE EXCEPTION 'SEC005-VERIFY: create_devolution_v2/12 desapareció tras el drop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'close_cash_shift'
               AND pg_get_function_identity_arguments(p.oid) = 'p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid') THEN
    RAISE EXCEPTION 'SEC005-VERIFY: close_cash_shift/5 sigue presente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
             WHERE n.nspname = 'public' AND p.proname = 'create_devolution_v2'
               AND pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text, p_operation_date timestamp with time zone') THEN
    RAISE EXCEPTION 'SEC005-VERIFY: create_devolution_v2/11 sigue presente';
  END IF;
END
$sec005$;
COMMIT;
