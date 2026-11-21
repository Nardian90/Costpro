-- ============================================================================
-- 20261121240000 — CP-NOMINA-SUPERADMIN-TRANSVERSAL
-- Fix RLS: el SuperAdmin de plataforma no podía crear trabajadores
-- ("new row violates row-level security policy for table 'workers'").
-- ============================================================================
-- MISIÓN: Vista Inicio → RECURSOS HUMANOS → Trabajadores y Comisiones
--   (tienda Ferrocarril, admin@demo.com). El POST /api/workers usa el
--   cliente autenticado del usuario (getSupabaseForSession → JWT real,
--   respeta RLS) y la política workers_insert_admin_manager RECHAZA al
--   superadmin porque compara estrictamente profiles.role = 'admin'.
--
-- DIAGNÓSTICO (estado LIVE producción, 2026-11-21):
--   profiles de admin@demo.com → role = 'superadmin' (rol de PLATAFORMA,
--   sin membresías de tienda, migración 20260826120000 §6).
--   Las policies del dominio trabajadores/comisiones creadas por
--   20260626000003 (FIX C4) usan la comparación ESTRICTA
--     EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
--             AND p.role = 'admin')
--   → el superadmin NO pasa. Las tablas de nómina (payrolls, payroll_items,
--     payroll_item_concepts, worker_salary_rates) ya están cubiertas por
--     can_read_payroll_store() (20261114180000), que abre con
--     is_superadmin() → RETURN true. Quedaron atrás SOLO estas 6 tablas:
--       workers, commission_rules, commission_payments, sales_transactions,
--       commission_rule_versions (SELECT) y commission_rule_products
--       (membership-only, sin bypass global alguno).
--
-- REGLA ESTABLECIDA (expediente CP-ORG-001 §16/§17 + 20261026160000):
--   el rol 'superadmin' es de PLATAFORMA y es TRANSVERSAL a tiendas y
--   tenants («debo tener acceso a todo» — directiva del propietario).
--   Espejo canónico: public.is_admin() cubre ('admin','superadmin') — misma
--   semántica que is_global_admin() y que el primer tramo de
--   can_read_payroll_store(). Cambios ÚNICAMENTE aditivos: el admin
--   ordinario y los roles de tienda conservan EXACTAMENTE su alcance actual.
--
-- SOLUCIÓN: recrear las policies (mismos nombres, idempotente) sustituyendo
--   la comparación estricta por public.is_admin() y añadiendo el bypass a
--   commission_rule_products. Los roles de membresía (admin/manager/
--   encargado/...) NO cambian: sus ramas EXISTS se copian tal cual.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────
-- 1. workers
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "workers_select_authenticated" ON public.workers;
CREATE POLICY "workers_select_authenticated" ON public.workers
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM user_store_memberships m
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "workers_insert_admin_manager" ON public.workers;
CREATE POLICY "workers_insert_admin_manager" ON public.workers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "workers_update_admin_manager" ON public.workers;
CREATE POLICY "workers_update_admin_manager" ON public.workers
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "workers_delete_admin" ON public.workers;
CREATE POLICY "workers_delete_admin" ON public.workers
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────────────
-- 2. commission_rules
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "commission_rules_select" ON public.commission_rules;
CREATE POLICY "commission_rules_select" ON public.commission_rules
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active')
  );

DROP POLICY IF EXISTS "commission_rules_insert" ON public.commission_rules;
CREATE POLICY "commission_rules_insert" ON public.commission_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "commission_rules_update" ON public.commission_rules;
CREATE POLICY "commission_rules_update" ON public.commission_rules
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "commission_rules_delete" ON public.commission_rules;
CREATE POLICY "commission_rules_delete" ON public.commission_rules
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────────────
-- 3. commission_payments
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "commission_payments_select" ON public.commission_payments;
CREATE POLICY "commission_payments_select" ON public.commission_payments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active')
  );

DROP POLICY IF EXISTS "commission_payments_insert" ON public.commission_payments;
CREATE POLICY "commission_payments_insert" ON public.commission_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "commission_payments_update" ON public.commission_payments;
CREATE POLICY "commission_payments_update" ON public.commission_payments
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "commission_payments_delete" ON public.commission_payments;
CREATE POLICY "commission_payments_delete" ON public.commission_payments
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────────────
-- 4. sales_transactions
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sales_transactions_select" ON public.sales_transactions;
CREATE POLICY "sales_transactions_select" ON public.sales_transactions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active')
  );

DROP POLICY IF EXISTS "sales_transactions_insert" ON public.sales_transactions;
CREATE POLICY "sales_transactions_insert" ON public.sales_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "sales_transactions_update" ON public.sales_transactions;
CREATE POLICY "sales_transactions_update" ON public.sales_transactions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager'))
  );

DROP POLICY IF EXISTS "sales_transactions_delete" ON public.sales_transactions;
CREATE POLICY "sales_transactions_delete" ON public.sales_transactions
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
  );

-- ──────────────────────────────────────────────────────────────────────
-- 5. commission_rule_versions (read-only, admin bypass)
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "commission_rule_versions_select" ON public.commission_rule_versions;
CREATE POLICY "commission_rule_versions_select" ON public.commission_rule_versions
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM commission_rules r
      JOIN user_store_memberships m ON m.store_id = r.store_id
      WHERE r.id = commission_rule_versions.rule_id
        AND m.user_id = auth.uid() AND m.status = 'active'
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- 6. commission_rule_products (membership-only → añadir bypass global)
--    Sin esto ni el admin global podía gestionar productos de una regla
--    de comisión (no hay membership de tienda para admin@demo.com).
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "commission_rule_products_select" ON public.commission_rule_products;
CREATE POLICY "commission_rule_products_select" ON public.commission_rule_products
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM commission_rules r
      JOIN user_store_memberships m ON m.store_id = r.store_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid() AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "commission_rule_products_insert" ON public.commission_rule_products;
CREATE POLICY "commission_rule_products_insert" ON public.commission_rule_products
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM commission_rules r
      JOIN user_store_memberships m ON m.store_id = r.store_id
      JOIN profiles p ON p.id = m.user_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid() AND m.status = 'active'
        AND p.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "commission_rule_products_update" ON public.commission_rule_products;
CREATE POLICY "commission_rule_products_update" ON public.commission_rule_products
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM commission_rules r
      JOIN user_store_memberships m ON m.store_id = r.store_id
      JOIN profiles p ON p.id = m.user_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid() AND m.status = 'active'
        AND p.role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "commission_rule_products_delete" ON public.commission_rule_products;
CREATE POLICY "commission_rule_products_delete" ON public.commission_rule_products
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM commission_rules r
      JOIN user_store_memberships m ON m.store_id = r.store_id
      JOIN profiles p ON p.id = m.user_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid() AND m.status = 'active'
        AND p.role IN ('admin', 'manager')
    )
  );
