-- ============================================================================
-- Migration: 20260807000001_v2_16_1_transaction_items_full_columns.sql
-- Iteración 11.2 — Fix C-6 (persistir 15 campos por item)
-- ============================================================================
-- Añade 15 columnas nullable a transaction_items para persistir TODOS los
-- campos de pago multi-moneda y descuentos por método que el frontend envía.
--
-- Compatible con create_sale viejo: no lo modifica, las columnas quedan NULL.
-- create_sale_v2 las popula.
--
-- UP: ALTER TABLE ADD COLUMN (15 columnas)
-- DOWN: ALTER TABLE DROP COLUMN (15 columnas)
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS zelle_paid NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS cash_currency TEXT,
  ADD COLUMN IF NOT EXISTS transfer_currency TEXT,
  ADD COLUMN IF NOT EXISTS zelle_currency TEXT,
  ADD COLUMN IF NOT EXISTS cash_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS cash_discount_value NUMERIC,
  ADD COLUMN IF NOT EXISTS cash_discount_currency TEXT,
  ADD COLUMN IF NOT EXISTS transfer_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS transfer_discount_value NUMERIC,
  ADD COLUMN IF NOT EXISTS transfer_discount_currency TEXT,
  ADD COLUMN IF NOT EXISTS zelle_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS zelle_discount_value NUMERIC,
  ADD COLUMN IF NOT EXISTS zelle_discount_currency TEXT;

COMMENT ON TABLE public.transaction_items IS
  'Iteración 11.2 (C-6): 15 new nullable columns for full payment split + per-method discounts. Old create_sale leaves them NULL; create_sale_v2 populates them.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.transaction_items
--   DROP COLUMN IF EXISTS zelle_paid,
--   DROP COLUMN IF EXISTS currency,
--   DROP COLUMN IF EXISTS exchange_rate,
--   DROP COLUMN IF EXISTS cash_currency,
--   DROP COLUMN IF EXISTS transfer_currency,
--   DROP COLUMN IF EXISTS zelle_currency,
--   DROP COLUMN IF EXISTS cash_discount_type,
--   DROP COLUMN IF EXISTS cash_discount_value,
--   DROP COLUMN IF EXISTS cash_discount_currency,
--   DROP COLUMN IF EXISTS transfer_discount_type,
--   DROP COLUMN IF EXISTS transfer_discount_value,
--   DROP COLUMN IF EXISTS transfer_discount_currency,
--   DROP COLUMN IF EXISTS zelle_discount_type,
--   DROP COLUMN IF EXISTS zelle_discount_value,
--   DROP COLUMN IF EXISTS zelle_discount_currency;
-- ============================================================================
