-- ============================================================================
-- Migration: 20260629000003_fix_rls_commission_reception_links.sql
-- FIX-AUDIT: RLS policy on commission_reception_links was calling
-- is_store_member(receipt_id) but is_store_member expects store_id.
-- Must join through receipts to get store_id.
-- ============================================================================

-- Drop incorrect policies
DROP POLICY IF EXISTS "commission_reception_links_select_authenticated"
  ON public.commission_reception_links;
DROP POLICY IF EXISTS "commission_reception_links_insert_admin"
  ON public.commission_reception_links;
DROP POLICY IF EXISTS "commission_reception_links_delete_admin"
  ON public.commission_reception_links;

-- Recreate with correct join: receipt_id → receipts.store_id
CREATE POLICY "commission_reception_links_select_authenticated"
  ON public.commission_reception_links FOR SELECT TO authenticated
  USING (
    public.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.id = commission_reception_links.receipt_id
      AND public.is_store_member(r.store_id)
    )
  );

CREATE POLICY "commission_reception_links_insert_admin"
  ON public.commission_reception_links FOR INSERT TO authenticated
  WITH CHECK (
    public.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.id = commission_reception_links.receipt_id
      AND public.has_store_role(r.store_id, ARRAY['admin', 'manager'])
    )
  );

CREATE POLICY "commission_reception_links_delete_admin"
  ON public.commission_reception_links FOR DELETE TO authenticated
  USING (
    public.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.id = commission_reception_links.receipt_id
      AND public.has_store_role(r.store_id, ARRAY['admin', 'manager'])
    )
  );
