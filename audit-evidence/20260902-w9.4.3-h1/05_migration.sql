-- ============================================================================
-- W9.4.3 — H-1 :: SECURITY DEFINER search_path hardening
-- Migration : 20260902205210_w9_f06_h1_security_definer_search_path.sql
-- Scope     : EXACTAMENTE 18 funciones SECURITY DEFINER en public sin
--             search_path explícito (inventario: evidence 01_function_inventory.txt,
--             clasificación: evidence 02_risk_classification.md).
-- Método    : ALTER FUNCTION ... SET search_path  → cambio EXCLUSIVO de proconfig.
--             Preserva OID, firma, owner, SECURITY DEFINER, ACL, cuerpo (prosrc),
--             dependencias, triggers y grants. Idempotente.
-- NO toca   : RLS, ACL, GRANT/REVOKE, roles, policies, tablas, índices, triggers,
--             datos, firmas, cuerpos.
-- ============================================================================
--
-- Decisiones de search_path (FASE 4, justificación completa en
-- evidence 04_search_path_decision.md):
--
--  · Grupo B (14 funciones): cuerpo 100% cualificado (public.*, auth.*,
--    builtins pg_catalog; 0 SQL dinámico; 0 refs sin cualificar; 0 objetos de
--    extensions) → mínimo seguro = 'pg_catalog, public' (preferencia del PAT).
--    pg_catalog explícito primero congela la resolución de builtins.
--
--  · Grupo C (4 funciones): cuerpo con referencias de RELACIÓN o TIPO sin
--    cualificar. PostgreSQL busca pg_temp ANTES que pg_catalog para relaciones
--    y tipos cuando pg_temp no está listado en el path → 'pg_catalog, public'
--    NO basta. Se fija pg_temp al final ('pg_catalog, public, pg_temp') —
--    patrón oficial de los docs PG (CREATE FUNCTION: SET search_path = trusted,
--    pg_temp) con precedente en este repositorio (migraciones iteration-11-2/12).
--    · calculate_service_distribution: FROM/INTO received_services,
--      service_reception_links, receipt_items + %ROWTYPE de las 3.
--    · get_product_cost_analysis: JOIN receipt_items, receipts,
--      service_cost_distributions, received_services, service_types.
--    · get_products_for_reception: FROM products.
--    · validate_active_store: tipo enum user_role (DECLARE + casts ::user_role).

-- ============================================================================
-- GUARD 1 — estado exacto de las 18 firmas
--   · existencia por firma exacta (to_regprocedure)
--   · prosecdef = true (SECURITY DEFINER)
--   · owner = postgres
--   · proconfig sin search_path previo distinto del objetivo
--     (si ya está en el objetivo → idempotente, sin re-ALTER necesario)
-- ============================================================================
DO $$
DECLARE
  v_sig text;
  v_target text;
  v_oid oid;
  v_owner text;
  v_secdef boolean;
  v_current text;
  v_row record;
  v_sig_bad text := NULL;
  v_msg text := NULL;
BEGIN
  FOR v_row IN
    SELECT * FROM (VALUES
      ('public.audit_cash_closures_changes()', 'pg_catalog, public'),
      ('public.calculate_service_distribution(uuid)', 'pg_catalog, public, pg_temp'),
      ('public.cleanup_old_aggregates(integer)', 'pg_catalog, public'),
      ('public.close_cash_shift(uuid,numeric,numeric,text,uuid)', 'pg_catalog, public'),
      ('public.create_store_with_membership(text,text,uuid,integer,text,text,text,text,text,text,text,text,text,text,double precision,double precision,uuid)', 'pg_catalog, public'),
      ('public.ensure_fiscal_period(uuid,integer,integer)', 'pg_catalog, public'),
      ('public.get_product_cost_analysis(uuid,uuid)', 'pg_catalog, public, pg_temp'),
      ('public.get_products_for_reception(uuid,text,integer,integer)', 'pg_catalog, public, pg_temp'),
      ('public.get_usage_forecast()', 'pg_catalog, public'),
      ('public.get_usage_summary(integer)', 'pg_catalog, public'),
      ('public.get_worker_commission_summary(uuid,date,date)', 'pg_catalog, public'),
      ('public.mark_expired_lots(uuid)', 'pg_catalog, public'),
      ('public.purge_old_reset_snapshots(integer)', 'pg_catalog, public'),
      ('public.snapshot_commission_rule()', 'pg_catalog, public'),
      ('public.touch_updated_at()', 'pg_catalog, public'),
      ('public.upsert_usage_aggregate(timestamp with time zone,timestamp with time zone,text,text,text,integer,double precision)', 'pg_catalog, public'),
      ('public.validate_active_store()', 'pg_catalog, public, pg_temp'),
      ('public.void_transaction(uuid,text,timestamp with time zone,uuid)', 'pg_catalog, public')
    ) AS t(sig, target)
  LOOP
    v_sig := v_row.sig;
    v_target := v_row.target;

    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'H1-GUARD1: funcion % no existe con esa firma exacta', v_sig;
    END IF;

    SELECT p.prosecdef, p.proowner::regrole::text,
           (SELECT trim(split_part(cfg, '=', 2)) FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')
      INTO v_secdef, v_owner, v_current
    FROM pg_proc p WHERE p.oid = v_oid;

    IF v_secdef IS NOT TRUE THEN
      RAISE EXCEPTION 'H1-GUARD1: % no es SECURITY DEFINER (deriva de estado)', v_sig;
    END IF;
    IF v_owner <> 'postgres' THEN
      RAISE EXCEPTION 'H1-GUARD1: % owner=% (esperado postgres)', v_sig, v_owner;
    END IF;
    IF v_current IS NOT NULL AND v_current <> v_target THEN
      RAISE EXCEPTION 'H1-GUARD1: % ya tiene search_path=% distinto del objetivo %', v_sig, v_current, v_target;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- GUARD 2 — deriva global mínima
--   · total de funciones en public = 481 y SECURITY DEFINER = 242
--   · SD sin search_path = 18 (o 0 si la migración ya se aplicó → idempotencia)
-- ============================================================================
DO $$
DECLARE
  v_total bigint; v_sd bigint; v_missing bigint; v_h1_target bigint;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE p.prosecdef),
         count(*) FILTER (WHERE p.prosecdef AND (p.proconfig IS NULL OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%')))
    INTO v_total, v_sd, v_missing
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public';

  SELECT count(*) INTO v_h1_target
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.proconfig IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                WHERE cfg LIKE 'search_path=%'
                  AND (trim(split_part(cfg,'=',2)) = 'pg_catalog, public'
                    OR trim(split_part(cfg,'=',2)) = 'pg_catalog, public, pg_temp'))
    AND p.oid IN (138218,132722,132926,138285,138143,136259,132723,132197,132940,
                  132924,135148,136485,135446,133149,133144,132923,38664,138000);

  IF v_total <> 481 THEN
    RAISE EXCEPTION 'H1-GUARD2: total funciones public=% (esperado 481) — deriva de inventario', v_total;
  END IF;
  IF v_sd <> 242 THEN
    RAISE EXCEPTION 'H1-GUARD2: SECURITY DEFINER=% (esperado 242) — deriva de inventario', v_sd;
  END IF;
  IF v_missing <> 18 AND v_h1_target <> 18 THEN
    RAISE EXCEPTION 'H1-GUARD2: SD sin search_path=% y H1 ya aplicadas=% — estado no inventariado', v_missing, v_h1_target;
  END IF;
END $$;

-- ============================================================================
-- ALTERS — 18 correcciones (proconfig-only). Aplicar el mismo valor ya
-- establecido es un no-op (idempotencia estructural de ALTER ... SET).
-- ============================================================================

-- ── Grupo C4: 'pg_catalog, public, pg_temp' (refs sin cualificar en cuerpo) ──

ALTER FUNCTION public.calculate_service_distribution(uuid)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.get_product_cost_analysis(uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.get_products_for_reception(uuid, text, integer, integer)
  SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.validate_active_store()
  SET search_path = pg_catalog, public, pg_temp;

-- ── Grupo B14: 'pg_catalog, public' (cuerpo 100% cualificado) ──

ALTER FUNCTION public.audit_cash_closures_changes()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.cleanup_old_aggregates(integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.create_store_with_membership(text, text, uuid, integer, text, text, text, text, text, text, text, text, text, text, double precision, double precision, uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.ensure_fiscal_period(uuid, integer, integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_usage_forecast()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_usage_summary(integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_worker_commission_summary(uuid, date, date)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.mark_expired_lots(uuid)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.purge_old_reset_snapshots(integer)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.snapshot_commission_rule()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.touch_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.upsert_usage_aggregate(timestamp with time zone, timestamp with time zone, text, text, text, integer, double precision)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid)
  SET search_path = pg_catalog, public;

-- ============================================================================
-- POST-CHECK — la migración se auto-verifica: las 18 deben quedar EXACTAMENTE
-- en su search_path objetivo; cualquier desviación aborta.
-- ============================================================================
DO $$
DECLARE
  v_row record; v_oid oid; v_current text; v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM (VALUES
      ('public.audit_cash_closures_changes()', 'pg_catalog, public'),
      ('public.calculate_service_distribution(uuid)', 'pg_catalog, public, pg_temp'),
      ('public.cleanup_old_aggregates(integer)', 'pg_catalog, public'),
      ('public.close_cash_shift(uuid,numeric,numeric,text,uuid)', 'pg_catalog, public'),
      ('public.create_store_with_membership(text,text,uuid,integer,text,text,text,text,text,text,text,text,text,text,double precision,double precision,uuid)', 'pg_catalog, public'),
      ('public.ensure_fiscal_period(uuid,integer,integer)', 'pg_catalog, public'),
      ('public.get_product_cost_analysis(uuid,uuid)', 'pg_catalog, public, pg_temp'),
      ('public.get_products_for_reception(uuid,text,integer,integer)', 'pg_catalog, public, pg_temp'),
      ('public.get_usage_forecast()', 'pg_catalog, public'),
      ('public.get_usage_summary(integer)', 'pg_catalog, public'),
      ('public.get_worker_commission_summary(uuid,date,date)', 'pg_catalog, public'),
      ('public.mark_expired_lots(uuid)', 'pg_catalog, public'),
      ('public.purge_old_reset_snapshots(integer)', 'pg_catalog, public'),
      ('public.snapshot_commission_rule()', 'pg_catalog, public'),
      ('public.touch_updated_at()', 'pg_catalog, public'),
      ('public.upsert_usage_aggregate(timestamp with time zone,timestamp with time zone,text,text,text,integer,double precision)', 'pg_catalog, public'),
      ('public.validate_active_store()', 'pg_catalog, public, pg_temp'),
      ('public.void_transaction(uuid,text,timestamp with time zone,uuid)', 'pg_catalog, public')
    ) AS t(sig, target)
  LOOP
    v_oid := to_regprocedure(v_row.sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'H1-POSTCHECK: % desapareció durante la migración', v_row.sig;
    END IF;
    SELECT trim(split_part(cfg, '=', 2)) INTO v_current
    FROM unnest((SELECT proconfig FROM pg_proc WHERE oid = v_oid)) cfg
    WHERE cfg LIKE 'search_path=%';
    IF v_current IS NULL OR v_current <> v_row.target THEN
      RAISE EXCEPTION 'H1-POSTCHECK: % search_path=% (esperado %)', v_row.sig, v_current, v_row.target;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> 18 THEN
    RAISE EXCEPTION 'H1-POSTCHECK: verificados % de 18', v_count;
  END IF;
END $$;
