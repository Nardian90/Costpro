-- ============================================================================
-- Migration: 20260803000003_v2_13_3_transactions_idempotency_unique.sql
-- Iteración 11.1 — Fix H-1
-- ============================================================================
-- PROBLEMA: No existía UNIQUE constraint en transactions.idempotency_key.
-- create_sale hacía SELECT-then-INSERT (TOCTOU race): dos requests concurrentes
-- con la misma key ambos pasaban el SELECT y ambos INSERTaban.
--
-- SOLUCIÓN: CREATE UNIQUE INDEX partial (WHERE idempotency_key IS NOT NULL)
-- para que la BD rechace duplicados atómicamente. El SELECT-then-INSERT del
-- RPC sigue sirviendo para el happy path, pero el index es el backstop real.
--
-- UP:
--   CREATE UNIQUE INDEX partial.
--
-- DOWN:
--   DROP INDEX.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- Partial unique index: solo aplica cuando idempotency_key IS NOT NULL.
-- Múltiples filas con idempotency_key=NULL son permitidas (ventas sin key).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_store_idx
  ON public.transactions (idempotency_key, store_id)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX public.transactions_idempotency_key_store_idx IS
  'Iteración 11.1 (H-1): Unique partial index on (idempotency_key, store_id). Prevents duplicate sales from TOCTOU race in create_sale.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.transactions_idempotency_key_store_idx;
-- ============================================================================
