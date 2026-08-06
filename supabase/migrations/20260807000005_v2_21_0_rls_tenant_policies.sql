-- ============================================================================
-- Migration: 20260807000005_v2_21_0_rls_tenant_policies.sql
-- Iteración RLS Multi-Tenant — Fase B.1: Policies RLS por tenant_id
-- ============================================================================
-- Crea policies NUEVAS (sufijo _tenant) para las 17 tablas con tenant_id.
-- Las policies viejas NO se eliminan (coexisten hasta Fase E post-validación).
--
-- Cada policy usa CASE WHEN current_setting('app.use_tenant_rls', true) = 'true'
-- para activar el comportamiento nuevo solo cuando el feature flag está activo.
-- Cuando flag=false/NULL, usa el comportamiento viejo (is_admin bypass, etc.).
--
-- Patrón para tablas con tenant_id + store_id (14 tablas):
--   SELECT/UPDATE/DELETE: tenant_id = current_user_tenant_id() AND (is_admin OR store_access)
--   INSERT: tenant_id = current_user_tenant_id() AND store_id IN current_user_store_ids()
--
-- Patrón para tablas con tenant_id sin store_id (3 tablas: stores, transfers, bulk_ops_log):
--   SELECT: tenant_id = current_user_tenant_id()
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- ============================================================================
-- 1. products (tenant_id + store_id)
-- ============================================================================
CREATE POLICY products_tenant_select
  ON public.products FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

CREATE POLICY products_tenant_insert
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

CREATE POLICY products_tenant_update
  ON public.products FOR UPDATE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  )
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

CREATE POLICY products_tenant_delete
  ON public.products FOR DELETE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND public.is_admin()
    ELSE
      public.is_admin()
    END
  );

-- ============================================================================
-- 2. transactions (tenant_id + store_id)
-- ============================================================================
CREATE POLICY transactions_tenant_select
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

CREATE POLICY transactions_tenant_update
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

CREATE POLICY transactions_tenant_delete
  ON public.transactions FOR DELETE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND public.is_admin()
    ELSE
      public.is_admin()
    END
  );

-- ============================================================================
-- 3. stock_movements (tenant_id + store_id)
-- ============================================================================
CREATE POLICY stock_movements_tenant_select
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

CREATE POLICY stock_movements_tenant_delete
  ON public.stock_movements FOR DELETE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND public.is_admin()
    ELSE
      false
    END
  );

-- ============================================================================
-- 4. inventory (tenant_id + store_id)
-- ============================================================================
CREATE POLICY inventory_tenant_select
  ON public.inventory FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

-- ============================================================================
-- 5. profiles (tenant_id + store_id nullable)
-- ============================================================================
CREATE POLICY profiles_tenant_select
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      id = auth.uid()
      OR public.is_admin_with_access(active_store_id)
      OR (
        public.is_admin()
        AND tenant_id = public.current_user_tenant_id()
      )
    ELSE
      id = auth.uid() OR public.is_admin() OR created_by = auth.uid() OR public.is_managed_user(id)
    END
  );

CREATE POLICY profiles_tenant_update
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      id = auth.uid()
      OR (
        public.is_admin()
        AND tenant_id = public.current_user_tenant_id()
      )
    ELSE
      id = auth.uid() OR public.is_admin()
    END
  )
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      id = auth.uid()
      OR (
        public.is_admin()
        AND tenant_id = public.current_user_tenant_id()
      )
    ELSE
      id = auth.uid() OR public.is_admin()
    END
  );

-- ============================================================================
-- 6. commission_payments (tenant_id + store_id)
-- ============================================================================
CREATE POLICY commission_payments_tenant_select
  ON public.commission_payments FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 7. commission_rules (tenant_id + store_id)
-- ============================================================================
CREATE POLICY commission_rules_tenant_select
  ON public.commission_rules FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 8. receipts (tenant_id + store_id)
-- ============================================================================
CREATE POLICY receipts_tenant_select
  ON public.receipts FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

CREATE POLICY receipts_tenant_update
  ON public.receipts FOR UPDATE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR public.has_store_access(store_id)
    END
  );

-- ============================================================================
-- 9. workers (tenant_id + store_id)
-- ============================================================================
CREATE POLICY workers_tenant_select
  ON public.workers FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 10. sales_transactions (tenant_id + store_id)
-- ============================================================================
CREATE POLICY sales_transactions_tenant_select
  ON public.sales_transactions FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 11. production_orders (tenant_id + store_id)
-- ============================================================================
CREATE POLICY production_orders_tenant_select
  ON public.production_orders FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 12. audit_events (tenant_id + store_id nullable)
-- ============================================================================
CREATE POLICY audit_events_tenant_select
  ON public.audit_events FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
    ELSE
      false -- policy vieja bloquea (Deny modifications)
    END
  );

-- ============================================================================
-- 13. price_change_history (tenant_id + store_id)
-- ============================================================================
CREATE POLICY price_change_history_tenant_select
  ON public.price_change_history FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND (public.is_admin() OR store_id = ANY(public.current_user_store_ids()))
    ELSE
      public.is_admin() OR store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 14. transfer_approval_rules (tenant_id + store_id nullable)
-- ============================================================================
CREATE POLICY transfer_approval_rules_tenant_select
  ON public.transfer_approval_rules FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND public.is_admin()
    ELSE
      public.is_admin() OR public.is_global_admin()
    END
  );

-- ============================================================================
-- 15. stores (tenant_id, sin store_id)
-- ============================================================================
CREATE POLICY stores_tenant_select
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
    ELSE
      public.is_admin() OR id = ANY(public.current_user_store_ids())
    END
  );

CREATE POLICY stores_tenant_update
  ON public.stores FOR UPDATE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND public.is_admin()
    ELSE
      public.is_admin() OR public.has_store_access(id)
    END
  );

CREATE POLICY stores_tenant_delete
  ON public.stores FOR DELETE
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
      AND public.is_admin()
    ELSE
      public.is_admin()
    END
  );

-- ============================================================================
-- 16. transfers (tenant_id, sin store_id)
-- ============================================================================
CREATE POLICY transfers_tenant_select
  ON public.transfers FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
    ELSE
      public.is_admin()
      OR origin_store_id = ANY(public.current_user_store_ids())
      OR destination_store_id = ANY(public.current_user_store_ids())
    END
  );

-- ============================================================================
-- 17. bulk_ops_log (tenant_id, sin store_id)
-- ============================================================================
CREATE POLICY bulk_ops_log_tenant_select
  ON public.bulk_ops_log FOR SELECT
  TO authenticated
  USING (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      tenant_id = public.current_user_tenant_id()
    ELSE
      public.is_admin()
    END
  );

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS products_tenant_select ON public.products;
-- DROP POLICY IF EXISTS products_tenant_insert ON public.products;
-- DROP POLICY IF EXISTS products_tenant_update ON public.products;
-- DROP POLICY IF EXISTS products_tenant_delete ON public.products;
-- DROP POLICY IF EXISTS transactions_tenant_select ON public.transactions;
-- DROP POLICY IF EXISTS transactions_tenant_update ON public.transactions;
-- DROP POLICY IF EXISTS transactions_tenant_delete ON public.transactions;
-- DROP POLICY IF EXISTS stock_movements_tenant_select ON public.stock_movements;
-- DROP POLICY IF EXISTS stock_movements_tenant_delete ON public.stock_movements;
-- DROP POLICY IF EXISTS inventory_tenant_select ON public.inventory;
-- DROP POLICY IF EXISTS profiles_tenant_select ON public.profiles;
-- DROP POLICY IF EXISTS profiles_tenant_update ON public.profiles;
-- DROP POLICY IF EXISTS commission_payments_tenant_select ON public.commission_payments;
-- DROP POLICY IF EXISTS commission_rules_tenant_select ON public.commission_rules;
-- DROP POLICY IF EXISTS receipts_tenant_select ON public.receipts;
-- DROP POLICY IF EXISTS receipts_tenant_update ON public.receipts;
-- DROP POLICY IF EXISTS workers_tenant_select ON public.workers;
-- DROP POLICY IF EXISTS sales_transactions_tenant_select ON public.sales_transactions;
-- DROP POLICY IF EXISTS production_orders_tenant_select ON public.production_orders;
-- DROP POLICY IF EXISTS audit_events_tenant_select ON public.audit_events;
-- DROP POLICY IF EXISTS price_change_history_tenant_select ON public.price_change_history;
-- DROP POLICY IF EXISTS transfer_approval_rules_tenant_select ON public.transfer_approval_rules;
-- DROP POLICY IF EXISTS stores_tenant_select ON public.stores;
-- DROP POLICY IF EXISTS stores_tenant_update ON public.stores;
-- DROP POLICY IF EXISTS stores_tenant_delete ON public.stores;
-- DROP POLICY IF EXISTS transfers_tenant_select ON public.transfers;
-- DROP POLICY IF EXISTS bulk_ops_log_tenant_select ON public.bulk_ops_log;
-- ============================================================================
