-- ============================================================================
-- Migration: 20260803000005_v2_13_5_stock_movements_immutable.sql
-- Iteración 11.1 — Fix H-13
-- ============================================================================
-- PROBLEMA: RLS policies en stock_movements permitían UPDATE/DELETE a
-- cualquier miembro del store. El ledger de inventario era mutable —
-- un usuario podía alterar movimientos pasados para ocultar mermas o robos.
--
-- SOLUCIÓN:
--   1. DROP policies existentes que permiten UPDATE/DELETE a authenticated.
--   2. CREATE nuevas policies:
--      - SELECT: mismo acceso que antes (store members pueden leer).
--      - INSERT: solo service_role (bypass RLS) o via RPC SECURITY DEFINER.
--        Authenticated no puede INSERT directamente (deben usar RPCs).
--      - UPDATE: DENY a authenticated (USING false).
--      - DELETE: DENY a authenticated (USING false).
--   3. service_role bypassa RLS → puede INSERT via RPCs SECURITY DEFINER.
--
-- IMPACTO:
--   - register_stock_movement (SECURITY DEFINER) sigue funcionando (bypass RLS).
--   - create_sale, void_transaction, etc. (SECURITY DEFINER) siguen funcionando.
--   - Client-side direct INSERTs/UPDATEs/DELETEs a stock_movements quedan
--     bloqueados.
--
-- UP:
--   DROP + CREATE policies.
--
-- DOWN:
--   Restaurar policies anteriores de 20260619000006.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- SELECT: store members pueden leer sus movimientos
DROP POLICY IF EXISTS "stock_movements_select_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_select_rls" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_store_role(store_id, ARRAY['admin', 'manager', 'encargado', 'clerk', 'warehouse'])
  );

-- INSERT: DENY a authenticated (deben usar RPCs SECURITY DEFINER)
-- service_role bypassa RLS y puede INSERT
DROP POLICY IF EXISTS "stock_movements_insert_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_rls" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- UPDATE: DENY a authenticated — el ledger es inmutable
DROP POLICY IF EXISTS "stock_movements_update_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_update_rls" ON public.stock_movements
  FOR UPDATE TO authenticated
  USING (false);

-- DELETE: DENY a authenticated — el ledger es inmutable
DROP POLICY IF EXISTS "stock_movements_delete_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_delete_rls" ON public.stock_movements
  FOR DELETE TO authenticated
  USING (false);

COMMENT ON POLICY "stock_movements_insert_rls" ON public.stock_movements IS
  'Iteración 11.1 (H-13): Authenticated users cannot INSERT directly — must use register_stock_movement RPC. service_role bypasses RLS.';
COMMENT ON POLICY "stock_movements_update_rls" ON public.stock_movements IS
  'Iteración 11.1 (H-13): stock_movements is immutable — UPDATE denied to authenticated.';
COMMENT ON POLICY "stock_movements_delete_rls" ON public.stock_movements IS
  'Iteración 11.1 (H-13): stock_movements is immutable — DELETE denied to authenticated.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar policies de 20260619000006_rls_policies_versioned.sql:262-280:
--
-- DROP POLICY IF EXISTS "stock_movements_select_rls" ON public.stock_movements;
-- DROP POLICY IF EXISTS "stock_movements_insert_rls" ON public.stock_movements;
-- DROP POLICY IF EXISTS "stock_movements_update_rls" ON public.stock_movements;
-- DROP POLICY IF EXISTS "stock_movements_delete_rls" ON public.stock_movements;
--
-- CREATE POLICY "stock_movements_select_rls" ON public.stock_movements
--   FOR SELECT TO authenticated USING (...);
-- CREATE POLICY "stock_movements_insert_rls" ON public.stock_movements
--   FOR INSERT TO authenticated WITH CHECK (...);
-- CREATE POLICY "stock_movements_update_rls" ON public.stock_movements
--   FOR UPDATE TO authenticated USING (...);
-- CREATE POLICY "stock_movements_delete_rls" ON public.stock_movements
--   FOR DELETE TO authenticated USING (...);
-- ============================================================================
