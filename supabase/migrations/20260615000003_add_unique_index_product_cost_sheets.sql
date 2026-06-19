-- =============================================================================
-- Migration: Add partial unique index for product_cost_sheets ON CONFLICT support
-- Date: 2026-06-15
-- Task: P0-1 Fix - FC Automatizada por Tienda
--
-- The save_product_cost_sheet RPC uses:
--   ON CONFLICT (product_id) WHERE deleted_at IS NULL
-- PostgreSQL requires a matching partial unique index for this upsert.
-- Without it, the RPC fails at runtime with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- =============================================================================

-- Partial unique index: only one active (non-deleted) cost sheet per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_cost_sheets_unique_active
  ON public.product_cost_sheets(product_id)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.idx_product_cost_sheets_unique_active IS
  'Partial unique index supporting ON CONFLICT (product_id) WHERE deleted_at IS NULL in save_product_cost_sheet RPC. Ensures at most one active cost sheet per product.';
