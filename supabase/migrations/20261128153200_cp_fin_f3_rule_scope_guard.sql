-- ============================================================================
-- Migration: 20261128153200_cp_fin_f3_rule_scope_guard.sql
-- Misión:    CP-FIN-REM-001 — PR-A F3 (ámbito de fin_rule_versions)
-- Fecha:     2026-11-28
-- ============================================================================
-- F3 — REGLAS GLOBALES. Estado previo (revalidado en vivo 2026-11-28):
--   fin_rules_update: USING (store_id IS NULL OR has_store_access(store_id))
--   → un admin de tienda puede TOMAR una regla GLOBAL (USING pasa por NULL)
--   y reasignarla a su tienda (WITH CHECK pasa por su membresía): la altera
--   para TODOS. Sin trigger que impida cambiar store_id.
--
-- Cambio:
--   1) Política UPDATE: USING = WITH CHECK idénticos y estrictos:
--      global (store_id NULL) → is_admin(); tienda → has_store_role(admin).
--      Managers y encargados NO modifican reglas.
--   2) Trigger BEFORE UPDATE fin_rule_scope_guard: si NEW.store_id IS DISTINCT
--      FROM OLD.store_id → ERR_FIN_RULE_SCOPE_IMMUTABLE. El ámbito nunca se
--      reasigna (ni global→tienda ni tienda→tienda ni tienda→global).
--      Compatibilidad verificada en vivo: fin_activate_rule_version /
--      fin_deactivate_rule_version solo tocan status/deactivated_at.
--
-- Idempotente: DROP+CREATE policy; DROP+CREATE trigger.
-- Rollback: supabase/rollbacks/20261128153200_rollback_cp_fin_f3.sql
-- ============================================================================

BEGIN;

do $$
declare
  v_qual text;
begin
  if to_regclass('public.fin_rule_versions') is null then
    raise exception 'CP-FIN-F3 PRECOND: fin_rule_versions ausente' using errcode = 'P0001';
  end if;
  if to_regprocedure('public.has_store_role(uuid, text[])') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'CP-FIN-F3 PRECOND: helpers ausentes' using errcode = 'P0001';
  end if;
  select qual into v_qual from pg_policies
   where schemaname='public' and tablename='fin_rule_versions' and policyname='fin_rules_update';
  if v_qual is null or position('has_store_access' in v_qual) = 0 then
    raise exception 'CP-FIN-F3 PRECOND: fin_rules_update no tiene el USING amplio esperado (¿deriva?): %', coalesce(v_qual, 'POLICY AUSENTE')
      using errcode = 'P0001';
  end if;
end $$;

-- 1) Política UPDATE estricta y simétrica
DROP POLICY IF EXISTS fin_rules_update ON public.fin_rule_versions;
CREATE POLICY fin_rules_update ON public.fin_rule_versions
  FOR UPDATE TO authenticated
  USING (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND has_store_role(store_id, ARRAY['admin']))
  )
  WITH CHECK (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND has_store_role(store_id, ARRAY['admin']))
  );

-- 2) Trigger: el ámbito de una versión de regla es inmutable
CREATE OR REPLACE FUNCTION public.fin_rule_scope_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'ERR_FIN_RULE_SCOPE_IMMUTABLE: el ámbito (store_id) de una versión de regla es inmutable; no se puede reasignar entre global y tienda (registro %)', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fin_rule_scope_immutable ON public.fin_rule_versions;
CREATE TRIGGER fin_rule_scope_immutable
  BEFORE UPDATE ON public.fin_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.fin_rule_scope_guard();
ALTER TABLE public.fin_rule_versions ENABLE ALWAYS TRIGGER fin_rule_scope_immutable;

COMMENT ON FUNCTION public.fin_rule_scope_guard() IS
  'CP-FIN-REM-001 F3: impide reasignar el ámbito (store_id) de una versión de regla financiera. Global y tienda son ámbitos cerrados; la alteración de reglas globales es exclusiva del admin global.';

-- Postcheck fail-closed
do $$
declare
  v_qual text; v_trig int;
begin
  select qual into v_qual from pg_policies
   where schemaname='public' and tablename='fin_rule_versions' and policyname='fin_rules_update';
  select count(*) into v_trig from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_proc p on p.oid = t.tgfoid
  where c.relname = 'fin_rule_versions' and p.proname = 'fin_rule_scope_guard' and t.tgenabled = 'A';
  if v_qual not like '%has_store_role%' or v_trig <> 1 then
    raise exception 'CP-FIN-F3 POSTCHECK: política o trigger mal instalados (qual=%, triggers=%)', coalesce(v_qual,'NULL'), v_trig
      using errcode = 'P0001';
  end if;
end $$;

COMMIT;
