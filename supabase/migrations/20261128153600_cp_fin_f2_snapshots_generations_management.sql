-- ============================================================================
-- Migration: 20261128153600_cp_fin_f2_snapshots_generations_management.sql
-- Misión:    CP-FIN-REM-001 — PR-A F2 (ampliación post-rebase 44b2ff27b)
-- Fecha:     2026-11-29
-- ============================================================================
-- F2 (ampliación de alcance, misma regla de F2) — SELECT SOLO GESTIÓN en
--       fin_reconciliation_snapshots y fin_posting_generations.
--
-- Estado previo revalidado (definiciones vigentes del stream):
--   fin_reconciliation_snapshots_select (20261121230000 §8):
--     FOR SELECT TO authenticated
--     USING (is_admin_check(auth.uid()) OR has_store_access_as(auth.uid(), store_id))
--     → cualquier miembro activo (clerk incluido) lee los snapshots.
--   fin_posting_generations_select (20261120120000):
--     FOR SELECT USING (is_admin_check(auth.uid()) OR has_store_access_as(...))
--     → SIN cláusula TO = rol {public} en el alcance de la política
--       (pg_policies.roles = {public}); el ACL de tabla la restringe a
--       authenticated, pero el contrato de seguridad exige eliminar el rol
--       {public} del alcance de la política misma.
--
-- Semántica NUEVA (espejo de can_manage_store_as / F2 20261128153000):
--   Permitido: admin global/superadmin (is_admin()), admin de tienda, manager
--   de tienda, encargado de tienda (has_store_role con roles verificados:
--   ARRAY['admin','manager','encargado']). service_role no pasa por RLS.
--   Denegado: clerk, usuario operativo, sin membresía, otro tenant, anon,
--   y el rol {public} como alcance de la política (ambas pasan a
--   TO authenticated).
--
-- No se modifica: ACL de tablas (grants existentes), políticas de escritura
-- (no existen por diseño: canal canónico service_role), ni ninguna otra
-- política/configuración.
--
-- Idempotente: DROP+CREATE de las 2 políticas. Fail-closed: aborta si faltan
-- tablas/helpers o si el estado previo no es el esperado (deriva).
-- Rollback: supabase/rollbacks/20261128153600_rollback_cp_fin_f2_snapshots_generations.sql
-- ============================================================================

BEGIN;

do $$
declare
  v_tablas text[];
  v_faltan text[];
  v_qual_previo text;
  v_roles_previo text;
begin
  v_tablas := array['fin_reconciliation_snapshots','fin_posting_generations'];
  select array_agg(t) into v_faltan
    from unnest(v_tablas) t
   where to_regclass('public.' || t) is null;
  if coalesce(array_length(v_faltan, 1), 0) > 0 then
    raise exception 'CP-FIN-F2-EXT PRECOND: tablas ausentes: %', array_to_string(v_faltan, ', ')
      using errcode = 'P0001';
  end if;
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.has_store_role(uuid, text[])') is null then
    raise exception 'CP-FIN-F2-EXT PRECOND: helpers is_admin()/has_store_role() ausentes'
      using errcode = 'P0001';
  end if;
  -- Fail-closed contra deriva: el estado previo debe ser el descrito arriba.
  select qual into v_qual_previo from pg_policies
   where schemaname='public' and tablename='fin_reconciliation_snapshots'
     and policyname='fin_reconciliation_snapshots_select';
  if v_qual_previo is null or position('has_store_access_as' in v_qual_previo) = 0 then
    raise exception 'CP-FIN-F2-EXT PRECOND: fin_reconciliation_snapshots_select no tiene el predicado amplio esperado (¿deriva?): %', coalesce(v_qual_previo, 'POLICY AUSENTE')
      using errcode = 'P0001';
  end if;
  select qual, roles::text into v_qual_previo, v_roles_previo from pg_policies
   where schemaname='public' and tablename='fin_posting_generations'
     and policyname='fin_posting_generations_select';
  if v_qual_previo is null or position('has_store_access_as' in v_qual_previo) = 0 then
    raise exception 'CP-FIN-F2-EXT PRECOND: fin_posting_generations_select no tiene el predicado amplio esperado (¿deriva?): %', coalesce(v_qual_previo, 'POLICY AUSENTE')
      using errcode = 'P0001';
  end if;
  if v_roles_previo is null or position('public' in v_roles_previo) = 0 then
    raise exception 'CP-FIN-F2-EXT PRECOND: fin_posting_generations_select no tenía el rol {public} en su alcance (¿ya endurecida?): %', coalesce(v_roles_previo, 'ROLES AUSENTE')
      using errcode = 'P0001';
  end if;
end $$;

-- ── fin_reconciliation_snapshots: SELECT solo gestión ───────────────────────
DROP POLICY IF EXISTS fin_reconciliation_snapshots_select ON public.fin_reconciliation_snapshots;
CREATE POLICY fin_reconciliation_snapshots_select ON public.fin_reconciliation_snapshots
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_posting_generations: SELECT solo gestión (y SIN rol {public}) ──────
DROP POLICY IF EXISTS fin_posting_generations_select ON public.fin_posting_generations;
CREATE POLICY fin_posting_generations_select ON public.fin_posting_generations
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

COMMENT ON TABLE public.fin_reconciliation_snapshots IS
  'CP-FIN: evidencia histórica de ejecuciones de conciliación (escritura exclusiva del canal service_role vía RPC fin_reconciliation_snapshot_save). [CP-FIN-REM-001 F2-ext 2026-11-29: SELECT solo roles de gestión (admin/manager/encargado de la tienda o admin global); clerk/usuario operativo ya no leen los snapshots.]';
COMMENT ON TABLE public.fin_posting_generations IS
  'CP-FIN: generaciones del motor de contabilización (ciclo de vida building→candidate→active→superseded; escritura solo canal service_role/postgres). [CP-FIN-REM-001 F2-ext 2026-11-29: SELECT solo roles de gestión (admin/manager/encargado de la tienda o admin global) y el alcance de la política ya NO incluye el rol {public}: TO authenticated.]';

-- Verificación post (fail-closed): 2 políticas con predicado de gestión y
-- alcance TO authenticated (rol {public} eliminado).
do $$
declare
  v_n int;
  v_roles text;
begin
  select count(*) into v_n from pg_policies
   where schemaname='public' and policyname in
     ('fin_reconciliation_snapshots_select','fin_posting_generations_select')
     and (qual like '%has_store_role%' or qual like '%is_admin()%');
  if v_n <> 2 then
    raise exception 'CP-FIN-F2-EXT POSTCHECK: esperadas 2 políticas endurecidas, encontradas %', v_n
      using errcode = 'P0001';
  end if;
  select roles::text into v_roles from pg_policies
   where schemaname='public' and tablename='fin_posting_generations'
     and policyname='fin_posting_generations_select';
  if v_roles is null or position('authenticated' in v_roles) = 0 or position('public' in v_roles) <> 0 then
    raise exception 'CP-FIN-F2-EXT POSTCHECK: fin_posting_generations_select debe ser TO authenticated sin {public}, roles=%', coalesce(v_roles, 'AUSENTE')
      using errcode = 'P0001';
  end if;
end $$;

COMMIT;
