-- ============================================================================
-- Rollback: 20261128153600_rollback_cp_fin_f2_snapshots_generations.sql
-- Restaura el SELECT amplio (has_store_access_as) en
-- fin_reconciliation_snapshots y fin_posting_generations, y el alcance con rol
-- {public} (sin TO) de fin_posting_generations_select — estado previo definido
-- por 20261121230000 §8 y 20261120120000 respectivamente.
-- NO borra datos; NO toca tablas comerciales. Solo restaura las 2 políticas.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS fin_reconciliation_snapshots_select ON public.fin_reconciliation_snapshots;
CREATE POLICY fin_reconciliation_snapshots_select ON public.fin_reconciliation_snapshots
  FOR SELECT TO authenticated
  USING (public.is_admin_check(auth.uid()) OR public.has_store_access_as(auth.uid(), store_id));

DROP POLICY IF EXISTS fin_posting_generations_select ON public.fin_posting_generations;
CREATE POLICY fin_posting_generations_select ON public.fin_posting_generations
  FOR SELECT USING (
    public.is_admin_check(auth.uid())
    OR public.has_store_access_as(auth.uid(), store_id));

COMMIT;
