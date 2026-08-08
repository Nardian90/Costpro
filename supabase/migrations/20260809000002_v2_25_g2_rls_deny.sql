-- ══════════════════════════════════════════════════════════════════════
-- F-30 G2 — RLS DENY: Inmutabilidad de tablas dependientes
-- Resuelve: Iter 2 #1 (RLS bypass), Iter 7 (4C+7A de inmutabilidad)
-- Patron: receipt_items v2.23.0 + purchase_order_items v2.24.0
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. service_cost_distributions ───
DROP POLICY IF EXISTS scd_write ON public.service_cost_distributions;
DROP POLICY IF EXISTS scd_read ON public.service_cost_distributions;

CREATE POLICY scd_select_authenticated ON public.service_cost_distributions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM received_services rs
    WHERE rs.id = service_cost_distributions.service_id
    AND public.has_store_access(rs.store_id)
  ));

CREATE POLICY scd_insert_authenticated ON public.service_cost_distributions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM received_services rs
    WHERE rs.id = service_cost_distributions.service_id
    AND public.has_store_access(rs.store_id)
  ));

CREATE POLICY scd_update_deny ON public.service_cost_distributions
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY scd_delete_deny ON public.service_cost_distributions
  FOR DELETE TO authenticated
  USING (false);

-- ─── 2. service_reception_links ───
DROP POLICY IF EXISTS srl_write ON public.service_reception_links;
DROP POLICY IF EXISTS srl_read ON public.service_reception_links;

CREATE POLICY srl_select_authenticated ON public.service_reception_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM received_services rs
    WHERE rs.id = service_reception_links.service_id
    AND public.has_store_access(rs.store_id)
  ));

CREATE POLICY srl_insert_authenticated ON public.service_reception_links
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM received_services rs
    WHERE rs.id = service_reception_links.service_id
    AND public.has_store_access(rs.store_id)
  ));

CREATE POLICY srl_update_deny ON public.service_reception_links
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY srl_delete_deny ON public.service_reception_links
  FOR DELETE TO authenticated
  USING (false);

-- ─── 3. received_services — DROP bypass policies ───
DROP POLICY IF EXISTS received_services_write ON public.received_services;
DROP POLICY IF EXISTS received_services_read ON public.received_services;

-- ─── 4. service_audit_log — RLS restrictive + DENY ───
DROP POLICY IF EXISTS sal_write ON public.service_audit_log;
DROP POLICY IF EXISTS sal_read ON public.service_audit_log;

CREATE POLICY sal_select_authenticated ON public.service_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM received_services rs
    WHERE rs.id = service_audit_log.service_id
    AND public.has_store_access(rs.store_id)
  ));

CREATE POLICY sal_update_deny ON public.service_audit_log
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY sal_delete_deny ON public.service_audit_log
  FOR DELETE TO authenticated
  USING (false);
