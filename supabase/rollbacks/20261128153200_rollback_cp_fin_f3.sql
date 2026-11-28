-- ============================================================================
-- Rollback: 20261128153200_rollback_cp_fin_f3.sql
-- Restaura fin_rules_update amplio y retira fin_rule_scope_guard
-- NO borra asientos ni movimientos; NO toca tablas comerciales. Solo restaura
-- políticas, funciones, privilegios y triggers al estado previo del 2026-11-28.
-- ============================================================================
BEGIN;


DROP POLICY IF EXISTS fin_rules_update ON public.fin_rule_versions;
CREATE POLICY fin_rules_update ON public.fin_rule_versions
  FOR UPDATE TO authenticated
  USING (store_id IS NULL OR has_store_access(store_id))
  WITH CHECK ((store_id IS NULL AND is_admin()) OR (store_id IS NOT NULL AND has_store_role(store_id, ARRAY['admin'])));

DROP TRIGGER IF EXISTS fin_rule_scope_immutable ON public.fin_rule_versions;
DROP FUNCTION IF EXISTS public.fin_rule_scope_guard();

COMMIT;
