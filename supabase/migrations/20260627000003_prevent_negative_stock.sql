-- Migration: 20260627000003_prevent_negative_stock.sql
-- Objetivo: Prevenir que el stock_current quede negativo en productos e inventory.
-- Antes: era posible crear ventas que dejaban stock < 0 (overselling).
-- Después: la BD rechaza cualquier update/insert que deje stock_current < 0 o inventory.quantity < 0.

-- 1. Constraint en products.stock_current
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_current_non_negative'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_stock_current_non_negative
    CHECK (stock_current >= 0);
  END IF;
END $$;

-- 2. Constraint en inventory.quantity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_quantity_non_negative'
  ) THEN
    ALTER TABLE public.inventory
    ADD CONSTRAINT inventory_quantity_non_negative
    CHECK (quantity >= 0);
  END IF;
END $$;

-- 3. Constraint en transaction_items.quantity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_items_quantity_positive'
  ) THEN
    ALTER TABLE public.transaction_items
    ADD CONSTRAINT transaction_items_quantity_positive
    CHECK (quantity > 0);
  END IF;
END $$;

-- 4. Constraint en receipt_items.quantity (ya existe receipt_items_quantity_check pero lo reforzamos)
-- Si ya existe receipt_items_quantity_check con quantity > 0, no duplicar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipt_items_quantity_positive'
  ) THEN
    ALTER TABLE public.receipt_items
    ADD CONSTRAINT receipt_items_quantity_positive
    CHECK (quantity > 0);
  END IF;
END $$;

-- 5. Constraint en stock_movements: balance_after no puede ser negativo
-- (cuando sea un movimiento de venta, el balance resultante no debe quedar < 0)
-- Excepción: si balance_after es 0 (no se seteó), lo permitimos para no romper migraciones.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_balance_non_negative'
  ) THEN
    ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_balance_non_negative
    CHECK (balance_after IS NULL OR balance_after = 0 OR balance_after >= 0);
  END IF;
END $$;

-- Nota: Si hay datos existentes que violan estos constraints, el ALTER fallará.
-- En ese caso, ejecutar antes:
--   UPDATE products SET stock_current = 0 WHERE stock_current < 0;
--   UPDATE inventory SET quantity = 0 WHERE quantity < 0;
