-- ============================================================================
-- Migration: 20260803000008_v2_13_8_transaction_items_index.sql
-- Iteración 11.1 — Fix M-7
-- ============================================================================
-- PROBLEMA: No existía índice dedicado en transaction_items.transaction_id.
-- Solo FK constraint. useTransactionDetails query sufría full table scan.
--
-- SOLUCIÓN: CREATE INDEX en transaction_items(transaction_id).
--
-- UP:
--   CREATE INDEX.
--
-- DOWN:
--   DROP INDEX.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS transaction_items_transaction_id_idx
  ON public.transaction_items (transaction_id);

COMMENT ON INDEX public.transaction_items_transaction_id_idx IS
  'Iteración 11.1 (M-7): Index on transaction_items.transaction_id for useTransactionDetails query performance.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.transaction_items_transaction_id_idx;
-- ============================================================================
