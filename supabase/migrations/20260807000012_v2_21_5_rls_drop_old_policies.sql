-- ============================================================================
-- Migration: 20260807000012_v2_21_5_rls_drop_old_policies.sql
-- Iteración RLS Multi-Tenant — Fase E: Eliminar policies viejas con bypass
-- ============================================================================
-- Elimina 21 policies viejas que tenían is_admin() bypass o has_store_access()
-- (que internamente llama is_admin()). Estas policies coexistían con las nuevas
-- _tenant policies (sufijo _tenant_) desde la iteración v2.21.0.
--
-- Solo se eliminan policies donde existe un reemplazo _tenant para el mismo
-- comando (SELECT/INSERT/UPDATE/DELETE). Las policies viejas sin reemplazo
-- se conservan para no bloquear operaciones.
--
-- Después de esta migración, el aislamiento RLS es 100% por tenant_id cuando
-- el feature flag app.use_tenant_rls = 'true'.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. transactions (4 policies viejas → _tenant reemplazos existen para SELECT/UPDATE/DELETE/INSERT)
DROP POLICY IF EXISTS "Transactions select" ON public.transactions;
DROP POLICY IF EXISTS "Transactions update status" ON public.transactions;
DROP POLICY IF EXISTS "Transactions insert" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_rls" ON public.transactions;

-- 2. stock_movements (2 SELECT viejas → _tenant SELECT existe)
DROP POLICY IF EXISTS "Stock movements select" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_select_rls" ON public.stock_movements;

-- 3. inventory (1 SELECT vieja → _tenant SELECT existe)
DROP POLICY IF EXISTS "inventory_select_isolated" ON public.inventory;

-- 4. profiles (2 viejas: SELECT + UPDATE → _tenant SELECT + UPDATE existen)
DROP POLICY IF EXISTS "profiles_select_v2" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_v2" ON public.profiles;
-- NOTA: profiles_delete_admin y profiles_insert_admin se CONSERVAN
-- (no hay _tenant DELETE/INSERT para profiles)

-- 5. receipts (2 viejas: SELECT + UPDATE → _tenant SELECT + UPDATE existen)
DROP POLICY IF EXISTS "receipts_select_isolated" ON public.receipts;
DROP POLICY IF EXISTS "Receipts update status" ON public.receipts;

-- 6. production_orders (1 SELECT vieja → _tenant SELECT existe)
DROP POLICY IF EXISTS "po_select_has_store_access" ON public.production_orders;
-- NOTA: po_delete/insert/update se CONSERVAN (no hay _tenant reemplazo)

-- 7. products (5 viejas: SELECT/INSERT/UPDATE/DELETE → _tenant cubre todos)
DROP POLICY IF EXISTS "products_select_store_access" ON public.products;
DROP POLICY IF EXISTS "products_insert_store_access" ON public.products;
DROP POLICY IF EXISTS "products_update_store_access" ON public.products;
DROP POLICY IF EXISTS "products_delete_store_access" ON public.products;
DROP POLICY IF EXISTS "products_insert_rls" ON public.products;
-- NOTA: products_public_read_anon se CONSERVAN (es para anon/public, no is_admin)

-- 8. price_change_history (2 viejas: SELECT + INSERT → _tenant SELECT + INSERT existen)
DROP POLICY IF EXISTS "Users can read their store history" ON public.price_change_history;
DROP POLICY IF EXISTS "Users can insert their store history" ON public.price_change_history;

-- 9. transfer_approval_rules (1 ALL vieja → _tenant SELECT existe)
DROP POLICY IF EXISTS "transfer_approval_rules_admin_only" ON public.transfer_approval_rules;
-- NOTA: Después de drop, INSERT/UPDATE/DELETE solo service_role (RPCs bypass RLS)

-- 10. transfers (1 SELECT vieja → _tenant SELECT existe)
DROP POLICY IF EXISTS "Transfers access" ON public.transfers;

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar las 21 policies viejas (requiere backup de cada CREATE POLICY)
-- Se incluye en el archivo DOWN.sql de respaldo
-- ============================================================================

COMMENT ON SCHEMA public IS
  'Iteración RLS (v2.21.5): Fase E — 21 policies viejas con is_admin/has_store_access bypass eliminadas. RLS ahora 100% por tenant_id cuando flag=true.';
