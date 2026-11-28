-- ============================================================================
-- Rollback: 20261128153000_rollback_cp_fin_f2.sql
-- Restaura SELECT amplio (has_store_access) en fin_entries/fin_movements/fin_opening_balances y fin_posting_errors
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================
BEGIN;


DROP POLICY IF EXISTS fin_entries_select ON public.fin_entries;
CREATE POLICY fin_entries_select ON public.fin_entries
  FOR SELECT TO authenticated USING (is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_movements_select ON public.fin_movements;
CREATE POLICY fin_movements_select ON public.fin_movements
  FOR SELECT TO authenticated USING (is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_opening_select ON public.fin_opening_balances;
CREATE POLICY fin_opening_select ON public.fin_opening_balances
  FOR SELECT TO authenticated USING (is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_post_err_select ON public.fin_posting_errors;
CREATE POLICY fin_post_err_select ON public.fin_posting_errors
  FOR SELECT TO authenticated USING ((store_id IS NULL) OR is_admin() OR has_store_access(store_id));

DROP POLICY IF EXISTS fin_post_err_update ON public.fin_posting_errors;
CREATE POLICY fin_post_err_update ON public.fin_posting_errors
  FOR UPDATE TO authenticated
  USING ((store_id IS NULL) OR is_admin() OR has_store_role(store_id, ARRAY['admin']))
  WITH CHECK ((store_id IS NULL) OR is_admin() OR has_store_role(store_id, ARRAY['admin']));

COMMIT;
