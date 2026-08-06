-- ============================================================================
-- Migration: 20260807000006_v2_21_0_rls_insert_with_check.sql
-- Iteración RLS Multi-Tenant — Fase B.2: Policies INSERT con WITH CHECK
-- ============================================================================
-- Crea policies INSERT nuevas (sufijo _tenant_insert_with_check) para 7 tablas
-- que tenían INSERT sin with_check (cualquiera podía insertar con store_id arbitrario).
-- audit_logs ya se cubrió en migración 20260807000005 (no tiene tenant_id).
--
-- Cuando flag=true: WITH CHECK verifica store_id + tenant_id.
-- Cuando flag=false: WITH CHECK = true (comportamiento viejo permisivo).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. transactions
CREATE POLICY transactions_tenant_insert_with_check
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
      AND tenant_id = public.current_user_tenant_id()
    ELSE
      true
    END
  );

-- 2. cash_closures
CREATE POLICY cash_closures_tenant_insert_with_check
  ON public.cash_closures FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

-- 3. devolutions
CREATE POLICY devolutions_tenant_insert_with_check
  ON public.devolutions FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

-- 4. inventory_adjustments
CREATE POLICY inventory_adjustments_tenant_insert_with_check
  ON public.inventory_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

-- 5. kardex_entries
CREATE POLICY kardex_entries_tenant_insert_with_check
  ON public.kardex_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

-- 6. payment_transactions
CREATE POLICY payment_transactions_tenant_insert_with_check
  ON public.payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
    ELSE
      true
    END
  );

-- 7. price_change_history
CREATE POLICY price_change_history_tenant_insert_with_check
  ON public.price_change_history FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
      store_id = ANY(public.current_user_store_ids())
      AND tenant_id = public.current_user_tenant_id()
    ELSE
      true
    END
  );

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS transactions_tenant_insert_with_check ON public.transactions;
-- DROP POLICY IF EXISTS cash_closures_tenant_insert_with_check ON public.cash_closures;
-- DROP POLICY IF EXISTS devolutions_tenant_insert_with_check ON public.devolutions;
-- DROP POLICY IF EXISTS inventory_adjustments_tenant_insert_with_check ON public.inventory_adjustments;
-- DROP POLICY IF EXISTS kardex_entries_tenant_insert_with_check ON public.kardex_entries;
-- DROP POLICY IF EXISTS payment_transactions_tenant_insert_with_check ON public.payment_transactions;
-- DROP POLICY IF EXISTS price_change_history_tenant_insert_with_check ON public.price_change_history;
-- ============================================================================
