-- ============================================================================
-- Migration: 20260702000003_multi_currency_sales.sql
-- Soporte multi-moneda en ventas (POS) y productos
--
-- Principio: CUP es la moneda de cuenta interna. Todo se convierte a CUP
-- para almacenar y calcular márgenes. La moneda original se guarda para
-- display y auditoría.
--
-- Cambios:
--   1. products: añadir price_currency (moneda del precio de venta)
--   2. transactions: añadir sale_currency + exchange_rate (moneda de la venta)
--   3. transaction_items: añadir price_currency + price_at_sale_cup (convertido)
-- ============================================================================

-- ── 1. Products: moneda del precio de venta ──────────────────────────────
BEGIN;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'CUP';
COMMIT;

-- ── 2. Transactions: moneda de la venta + tasa ───────────────────────────
BEGIN;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS sale_currency TEXT NOT NULL DEFAULT 'CUP';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS sale_exchange_rate NUMERIC(12,4) NOT NULL DEFAULT 1.0;
COMMIT;

-- ── 3. Transaction items: moneda del precio + convertido a CUP ───────────
BEGIN;
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS price_currency TEXT NOT NULL DEFAULT 'CUP';
ALTER TABLE public.transaction_items ADD COLUMN IF NOT EXISTS price_at_sale_cup NUMERIC(12,2) NOT NULL DEFAULT 0;
COMMIT;

-- ── 4. Backfill: price_at_sale_cup = price_at_sale (todas las ventas existentes son CUP) ──
BEGIN;
UPDATE public.transaction_items SET price_at_sale_cup = price_at_sale WHERE price_at_sale_cup = 0;
COMMIT;

-- ── 5. Índices ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_sale_currency ON public.transactions(sale_currency);
CREATE INDEX IF NOT EXISTS idx_products_price_currency ON public.products(price_currency);

-- ── 6. Comentarios ──────────────────────────────────────────────────────
COMMENT ON COLUMN public.products.price_currency IS 'Moneda del precio de venta (CUP, USD, EUR, MLC). Default CUP.';
COMMENT ON COLUMN public.transactions.sale_currency IS 'Moneda en la que se realizó la venta. Default CUP.';
COMMENT ON COLUMN public.transactions.sale_exchange_rate IS 'Tasa de cambio aplicada a la venta (ej: 500 CUP/USD). Default 1.0.';
COMMENT ON COLUMN public.transaction_items.price_currency IS 'Moneda del precio unitario al momento de la venta.';
COMMENT ON COLUMN public.transaction_items.price_at_sale_cup IS 'Precio unitario convertido a CUP (para cálculos de margen). price_at_sale * sale_exchange_rate.';

NOTIFY pgrst, 'reload schema';
