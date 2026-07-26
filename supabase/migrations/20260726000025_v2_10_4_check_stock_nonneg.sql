-- V2.10.4 — Añadir CHECK constraint stock_current >= 0 en products
-- Versión corregida: UPDATE primero, ADD CONSTRAINT después

-- 1. Arreglar stocks negativos existentes
UPDATE public.products SET stock_current = 0 WHERE stock_current < 0;

-- 2. Añadir CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_stock_current_check'
    AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_stock_current_check
      CHECK (stock_current >= 0);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
