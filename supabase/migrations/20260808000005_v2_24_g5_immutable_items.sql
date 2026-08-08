-- ══════════════════════════════════════════════════════════════════════
-- F-20 G5 — Inmutabilidad de purchase_order_items (RLS DENY UPDATE/DELETE)
-- Hallazgos cubiertos: Medio #8 (purchase_order_items editable)
-- Patrón idéntico a receipt_items v2.23.0
-- ══════════════════════════════════════════════════════════════════════

-- 1. DROP policies UPDATE existentes (duplicadas / permisivas)
DROP POLICY IF EXISTS po_items_update_authenticated ON public.purchase_order_items;
DROP POLICY IF EXISTS poi_upd                       ON public.purchase_order_items;

-- 2. CREATE POLICY DENY UPDATE para authenticated
--    USING (false) = no se puede seleccionar filas existentes para UPDATE
--    WITH CHECK (false) = no se puede escribir nuevas versiones
CREATE POLICY purchase_order_items_update_deny
  ON public.purchase_order_items
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- 3. CREATE POLICY DENY DELETE para authenticated
--    No existía ninguna policy DELETE antes; explícito para claridad
CREATE POLICY purchase_order_items_delete_deny
  ON public.purchase_order_items
  FOR DELETE
  TO authenticated
  USING (false);

-- 4. Comentario documental
COMMENT ON TABLE public.purchase_order_items IS
  'IMMUTABLE since v2.24.0: items cannot be UPDATEd or DELETEd via API.
   Any modification requires cancelling the PO and creating a new one.
   quantity_received is updated only by receive_against_po RPC (SECURITY DEFINER bypasses RLS).';

-- ═══ DOWN ═══
-- DROP POLICY IF EXISTS purchase_order_items_update_deny ON public.purchase_order_items;
-- DROP POLICY IF EXISTS purchase_order_items_delete_deny ON public.purchase_order_items;
-- -- Restaurar policies UPDATE originales (ver migración 20260619000006_rls_policies_versioned.sql)
