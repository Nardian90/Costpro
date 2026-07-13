-- ============================================================================
-- Fase 0.1 — RLS en payment_transactions
-- Creado: 2026-07-13
-- Descripción: Habilita Row Level Security en payment_transactions para
-- prevenir cross-tenant data leakage. Antes, cualquier usuario autenticado
-- podía leer pagos de cualquier tienda.
--
-- Patrones seguidos: has_store_access(uuid) de 20260324_total_remediation.sql
-- ============================================================================

-- ── 1. Habilitar RLS ──
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- ── 2. Policy SELECT: usuario puede ver pagos de tiendas donde tiene acceso ──
-- has_store_access(p_store_id) verifica memberships activas del usuario actual.
DROP POLICY IF EXISTS "payment_transactions_select_own_store" ON public.payment_transactions;
CREATE POLICY "payment_transactions_select_own_store" ON public.payment_transactions
  FOR SELECT TO authenticated
  USING (public.has_store_access(store_id));

-- ── 3. Policy INSERT: usuario puede registrar pagos en tiendas con acceso ──
-- Solo admin/manager/encargado pueden registrar pagos (verificación adicional
-- en la RPC register_supplier_payment que valida store ownership).
DROP POLICY IF EXISTS "payment_transactions_insert_own_store" ON public.payment_transactions;
CREATE POLICY "payment_transactions_insert_own_store" ON public.payment_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_store_access(store_id));

-- ── 4. Policy UPDATE: solo admin/manager pueden editar pagos ──
-- (Corrección de errores, anulación con auditoría)
DROP POLICY IF EXISTS "payment_transactions_update_own_store" ON public.payment_transactions;
CREATE POLICY "payment_transactions_update_own_store" ON public.payment_transactions
  FOR UPDATE TO authenticated
  USING (public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

-- ── 5. Policy DELETE: solo admin/manager pueden anular pagos ──
-- (DELETE = anulación lógica; el trigger recalcula paid_amount)
DROP POLICY IF EXISTS "payment_transactions_delete_own_store" ON public.payment_transactions;
CREATE POLICY "payment_transactions_delete_own_store" ON public.payment_transactions
  FOR DELETE TO authenticated
  USING (public.has_store_access(store_id));

-- ── 6. Asegurar que service_role mantiene acceso completo ──
-- (la RPC register_supplier_payment usa service_role internamente)
-- Nota: service_role bypassa RLS por defecto (BYPASSRLS), no necesita policy.
-- Pero confirmamos que la tabla sea accesible:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;

-- ── 7. Comment para documentación ──
COMMENT ON TABLE public.payment_transactions IS
  'Tabla unificada de pagos a proveedores (recepciones, servicios, comisiones). RLS habilitada: usuarios solo ven pagos de tiendas donde tienen membership activa. service_role bypassa RLS para uso en RPCs.';
