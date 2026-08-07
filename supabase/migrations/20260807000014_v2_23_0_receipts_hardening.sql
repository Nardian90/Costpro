-- ============================================================================
-- Migration: 20260807000014_v2_23_0_receipts_hardening.sql
-- Iteración Recepciones Hardening — Grupo B + C
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- B1: UNIQUE INDEX on receipts(store_id, reference_doc) WHERE NOT NULL
-- Previamente: sin constraint → recepciones duplicadas por factura
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_store_reference_doc
  ON public.receipts (store_id, reference_doc)
  WHERE reference_doc IS NOT NULL AND reference_doc != '';

-- B2-B5 + C1-C2: register_reception validations
-- B2: p_supplier IS NULL → ERR_SUPPLIER_REQUIRED
-- B3: p_items empty → ERR_EMPTY_ITEMS
-- B4: unit_cost <= 0 → ERR_INVALID_UNIT_COST
-- B5: product not in store → ERR_PRODUCT_NOT_IN_STORE (was CONTINUE)
-- C1: tasa_cambio outside [0.01, 10000] → ERR_INVALID_EXCHANGE_RATE
-- C2: expired lots → RAISE WARNING (non-blocking)
-- (Applied via CREATE OR REPLACE FUNCTION — in-place in DB)

-- C3: Block UPDATE/DELETE on receipt_items for authenticated users
-- Previamente: policies permitían UPDATE/DELETE → modificaciones sin recalcular WAC
DROP POLICY IF EXISTS receipt_items_update_isolated ON public.receipt_items;
DROP POLICY IF EXISTS receipt_items_delete_isolated ON public.receipt_items;
CREATE POLICY receipt_items_update_denied
  ON public.receipt_items FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);
CREATE POLICY receipt_items_delete_denied
  ON public.receipt_items FOR DELETE
  TO authenticated
  USING (false);

COMMENT ON SCHEMA public IS
  'v2.23.0: Receipts hardening Grupo B+C. Unique invoice, supplier required, items validation, cost>0, product exists, exchange rate range, expired lots warning, receipt_items immutable for authenticated.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_receipts_store_reference_doc;
-- DROP POLICY IF EXISTS receipt_items_update_denied ON public.receipt_items;
-- DROP POLICY IF EXISTS receipt_items_delete_denied ON public.receipt_items;
-- (Restore old update/delete policies from backup)
-- ============================================================================
