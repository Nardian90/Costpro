-- ============================================================================
-- Migration: 20260824000002_telegram_show_price_units.sql
-- ============================================================================
-- Purpose: Add per-store publication content config to telegram_configs.
--   • show_price           — how Telegram decides to show price:
--       'according_to_storefront' (default, recommended) → follows Vitrina
--       'show'                                          → still respects Vitrina
--       'hide'                                          → always hide
--   • show_physical_units  — whether to show "Disponibles: N unidades":
--       false (default) → do not show
--       true            → show IF Vitrina also allows stock_visible
--
-- INVARIANT: Telegram can NEVER override Vitrina's price_visible=false or
-- stock_visible=false. The application layer enforces this in
-- src/lib/storefront/product-presentation.ts (buildTelegramProductMessage).
-- The DB only stores the user's preference; it does not grant the right
-- to reveal hidden info.
-- ============================================================================

ALTER TABLE public.telegram_configs
  ADD COLUMN IF NOT EXISTS show_price text DEFAULT 'according_to_storefront'
    CHECK (show_price IN ('according_to_storefront', 'show', 'hide')),
  ADD COLUMN IF NOT EXISTS show_physical_units boolean DEFAULT false;

COMMENT ON COLUMN telegram_configs.show_price IS
  'How Telegram publishes price: according_to_storefront (follow Vitrina), show (still respects Vitrina), hide (always)';
COMMENT ON COLUMN telegram_configs.show_physical_units IS
  'Whether Telegram shows physical units. Even when true, respects stock_visible (Vitrina rules).';

-- Backfill existing rows to defaults
UPDATE public.telegram_configs
  SET show_price = COALESCE(show_price, 'according_to_storefront'),
      show_physical_units = COALESCE(show_physical_units, false)
  WHERE show_price IS NULL OR show_physical_units IS NULL;
