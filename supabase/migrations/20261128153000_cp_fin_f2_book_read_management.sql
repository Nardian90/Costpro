-- ============================================================================
-- Migration: 20261128153000_cp_fin_f2_book_read_management.sql
-- Misión:    CP-FIN-REM-001 — PR-A F2 (lectura del libro solo para gestión)
-- Fecha:     2026-11-28
-- ============================================================================
-- F2 — SELECT SOLO PARA GESTIÓN FINANCIERA (fin_entries, fin_movements,
--       fin_opening_balances, fin_posting_errors).
--
-- Estado previo revalidado EN VIVO 2026-11-28 (audit-evidence/CP-FIN-REVIEW-001/
-- revalida-20261128-policies.json):
--   fin_entries/fin_movements/fin_opening_balances SELECT:
--     USING (is_admin() OR has_store_access(store_id))  → cualquier miembro
--     activo (clerk incluido) lee el libro contable de su tienda.
--   fin_posting_errors SELECT/UPDATE:
--     USING ((store_id IS NULL) OR is_admin() OR has_store_access(...)) →
--     cualquier miembro ve y actualiza incluso errores GLOBALES.
--
-- Semántica NUEVA (espejo de can_manage_store_as — la misma que usa la app):
--   Permitido: admin global/superadmin (is_admin()), admin de tienda, manager
--   de tienda, encargado de tienda. Backend privilegiado (service_role) no
--   pasa por RLS (bypassrls de plataforma).
--   Denegado: clerk, usuario operativo, almacenero, costo, sin membresía,
--   otro tenant, anon.
--   fin_posting_errors con store_id NULL: SOLO is_admin() (globales).
--
-- No se modifica: políticas INSERT (motor), UPDATE de fin_opening_balances
-- (ya admin de tienda), ni ninguna política de fin_categories /
-- fin_document_types / fin_metric_catalog / fin_reconciliation_config /
-- fin_account_mapping / fin_posting_generations / fin_reconciliation_snapshots
-- (hallazgos N2/N3 reportados, fuera del alcance enumerado por la misión).
--
-- Idempotente: DROP+CREATE de las 5 políticas. Fail-closed: aborta si faltan
-- tablas/helpers o si el estado previo no es el esperado.
-- Rollback: supabase/rollbacks/20261128153000_rollback_cp_fin_f2.sql
-- ============================================================================

BEGIN;

do $$
declare
  v_tablas text[];
  v_faltan text[];
  v_qual_previo text;
begin
  v_tablas := array['fin_entries','fin_movements','fin_opening_balances','fin_posting_errors'];
  select array_agg(t) into v_faltan
    from unnest(v_tablas) t
   where to_regclass('public.' || t) is null;
  if coalesce(array_length(v_faltan, 1), 0) > 0 then
    raise exception 'CP-FIN-F2 PRECOND: tablas ausentes: %', array_to_string(v_faltan, ', ')
      using errcode = 'P0001';
  end if;
  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.has_store_role(uuid, text[])') is null then
    raise exception 'CP-FIN-F2 PRECOND: helpers is_admin()/has_store_role() ausentes'
      using errcode = 'P0001';
  end if;
  -- Fail-closed contra deriva: el estado previo debe ser el descrito arriba.
  select qual into v_qual_previo from pg_policies
   where schemaname='public' and tablename='fin_entries' and policyname='fin_entries_select';
  if v_qual_previo is null or position('has_store_access' in v_qual_previo) = 0 then
    raise exception 'CP-FIN-F2 PRECOND: fin_entries_select no tiene el predicado amplio esperado (¿deriva?): %', coalesce(v_qual_previo, 'POLICY AUSENTE')
      using errcode = 'P0001';
  end if;
end $$;

-- ── fin_entries: SELECT solo gestión ────────────────────────────────────────
DROP POLICY IF EXISTS fin_entries_select ON public.fin_entries;
CREATE POLICY fin_entries_select ON public.fin_entries
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_movements: SELECT solo gestión ──────────────────────────────────────
DROP POLICY IF EXISTS fin_movements_select ON public.fin_movements;
CREATE POLICY fin_movements_select ON public.fin_movements
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_opening_balances: SELECT solo gestión ───────────────────────────────
DROP POLICY IF EXISTS fin_opening_select ON public.fin_opening_balances;
CREATE POLICY fin_opening_select ON public.fin_opening_balances
  FOR SELECT TO authenticated
  USING (is_admin() OR has_store_role(store_id, ARRAY['admin','manager','encargado']));

-- ── fin_posting_errors: SELECT — globales SOLO admin; tienda solo gestión ──
DROP POLICY IF EXISTS fin_post_err_select ON public.fin_posting_errors;
CREATE POLICY fin_post_err_select ON public.fin_posting_errors
  FOR SELECT TO authenticated
  USING (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND (is_admin()
        OR has_store_role(store_id, ARRAY['admin','manager','encargado'])))
  );

-- ── fin_posting_errors: UPDATE — globales SOLO admin; tienda solo admin ────
DROP POLICY IF EXISTS fin_post_err_update ON public.fin_posting_errors;
CREATE POLICY fin_post_err_update ON public.fin_posting_errors
  FOR UPDATE TO authenticated
  USING (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND (is_admin()
        OR has_store_role(store_id, ARRAY['admin'])))
  )
  WITH CHECK (
    (store_id IS NULL AND is_admin())
    OR (store_id IS NOT NULL AND (is_admin()
        OR has_store_role(store_id, ARRAY['admin'])))
  );

COMMENT ON TABLE public.fin_entries IS
  'CP-FIN: asientos económicos (una fila por documento+evento+pago). anulacion = asiento compensatorio enlazado vía reversal_of (nunca UPDATE del importe). [CP-FIN-REM-001 F2 2026-11-28: SELECT solo roles de gestión (admin/manager/encargado de la tienda o admin global); clerk/usuario operativo ya no leen el libro.]';
COMMENT ON TABLE public.fin_movements IS
  'CP-FIN: líneas de partida doble. Inmutables una vez emitidas (las correcciones son asientos compensatorios). [CP-FIN-REM-001 F2 2026-11-28: SELECT solo roles de gestión.]';

-- Verificación post (fail-closed): 5 políticas con predicado de gestión.
do $$
declare
  v_n int;
begin
  select count(*) into v_n from pg_policies
   where schemaname='public' and policyname in
     ('fin_entries_select','fin_movements_select','fin_opening_select',
      'fin_post_err_select','fin_post_err_update')
     and (qual like '%has_store_role%' or qual like '%is_admin()%');
  if v_n <> 5 then
    raise exception 'CP-FIN-F2 POSTCHECK: esperadas 5 políticas endurecidas, encontradas %', v_n
      using errcode = 'P0001';
  end if;
end $$;

COMMIT;
