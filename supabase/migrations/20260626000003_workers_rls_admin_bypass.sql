-- ════════════════════════════════════════════════════════════════════
-- FIX C4: Agregar bypass admin global en RLS de workers_commissions
-- ════════════════════════════════════════════════════════════════════
-- Problema: las policies actuales SÓLO verifican user_store_memberships.
-- Un admin con profiles.role='admin' pero sin membership explícita en la tienda
-- no puede ver ni editar nada.
--
-- Solución: añadir OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
-- a todas las policies SELECT/INSERT/UPDATE/DELETE.
-- ════════════════════════════════════════════════════════════════════

-- ── workers: drop y recreate policies con bypass admin ──
DROP POLICY IF EXISTS "workers_select_authenticated" ON public.workers;
DROP POLICY IF EXISTS "workers_insert_admin_manager" ON public.workers;
DROP POLICY IF EXISTS "workers_update_admin_manager" ON public.workers;
DROP POLICY IF EXISTS "workers_delete_admin" ON public.workers;

CREATE POLICY "workers_select_authenticated" ON public.workers
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM user_store_memberships m
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
    )
  );
CREATE POLICY "workers_insert_admin_manager" ON public.workers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role IN ('admin', 'manager')
    )
  );
CREATE POLICY "workers_update_admin_manager" ON public.workers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role IN ('admin', 'manager')
    )
  );
CREATE POLICY "workers_delete_admin" ON public.workers
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── commission_rules ──
DROP POLICY IF EXISTS "commission_rules_select" ON public.commission_rules;
DROP POLICY IF EXISTS "commission_rules_insert" ON public.commission_rules;
DROP POLICY IF EXISTS "commission_rules_update" ON public.commission_rules;
DROP POLICY IF EXISTS "commission_rules_delete" ON public.commission_rules;

CREATE POLICY "commission_rules_select" ON public.commission_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active')
  );
CREATE POLICY "commission_rules_insert" ON public.commission_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );
CREATE POLICY "commission_rules_update" ON public.commission_rules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );
CREATE POLICY "commission_rules_delete" ON public.commission_rules
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── sales_transactions ──
DROP POLICY IF EXISTS "sales_transactions_select" ON public.sales_transactions;
DROP POLICY IF EXISTS "sales_transactions_insert" ON public.sales_transactions;
DROP POLICY IF EXISTS "sales_transactions_update" ON public.sales_transactions;
DROP POLICY IF EXISTS "sales_transactions_delete" ON public.sales_transactions;

CREATE POLICY "sales_transactions_select" ON public.sales_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active')
  );
CREATE POLICY "sales_transactions_insert" ON public.sales_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );
CREATE POLICY "sales_transactions_update" ON public.sales_transactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );
CREATE POLICY "sales_transactions_delete" ON public.sales_transactions
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── commission_payments ──
DROP POLICY IF EXISTS "commission_payments_select" ON public.commission_payments;
DROP POLICY IF EXISTS "commission_payments_insert" ON public.commission_payments;
DROP POLICY IF EXISTS "commission_payments_update" ON public.commission_payments;
DROP POLICY IF EXISTS "commission_payments_delete" ON public.commission_payments;

CREATE POLICY "commission_payments_select" ON public.commission_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active')
  );
CREATE POLICY "commission_payments_insert" ON public.commission_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );
CREATE POLICY "commission_payments_update" ON public.commission_payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );
CREATE POLICY "commission_payments_delete" ON public.commission_payments
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── commission_rule_versions (read-only, admin bypass) ──
DROP POLICY IF EXISTS "commission_rule_versions_select" ON public.commission_rule_versions;
CREATE POLICY "commission_rule_versions_select" ON public.commission_rule_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM commission_rules r
      JOIN user_store_memberships m ON m.store_id = r.store_id
      WHERE r.id = commission_rule_versions.rule_id
        AND m.user_id = auth.uid() AND m.status = 'active'
    )
  );
