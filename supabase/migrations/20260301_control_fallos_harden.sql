-- Migration: Control de Fallos Harden (REVISIÓN FINAL)
-- Objective: Integrity, WAC, and safety checks for Catalog -> Reception -> Sale -> Transfer

BEGIN;

-- 1. Product Status Enum
DO $$ BEGIN
    CREATE TYPE public.product_status AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add status column if it doesn't exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status public.product_status DEFAULT 'ACTIVE';

-- 2. Inventory Constraints: "Stock nunca negativo"
-- Enforce on the source of truth table
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS stock_non_negative;
ALTER TABLE public.inventory ADD CONSTRAINT stock_non_negative CHECK (quantity >= 0);

-- 3. Uniqueness Validation
-- SKU + Store + UoM (Unidad)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_store_sku_unit_unique;
ALTER TABLE public.products ADD CONSTRAINT products_store_sku_unit_unique UNIQUE (store_id, sku, unit_of_measure);

-- Variants Uniqueness: (Product + SKU)
ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_unique;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_sku_unique UNIQUE (product_id, sku);

-- 4. Automated Weighted Average Cost (WAC) update
-- Function to calculate and update products.cost_price
CREATE OR REPLACE FUNCTION public.update_product_wac()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock NUMERIC;
    v_current_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
    v_store_id UUID;
BEGIN
    -- Get current data
    SELECT stock_current, cost_price INTO v_current_stock, v_current_cost
    FROM public.products WHERE id = NEW.product_id;

    -- Safety fallback for first reception
    v_current_stock := COALESCE(v_current_stock, 0);
    v_current_cost := COALESCE(v_current_cost, 0);

    v_new_stock := v_current_stock + NEW.quantity;

    IF v_new_stock > 0 THEN
        -- WAC = (Stock Actual * Costo Actual + Nueva Cantidad * Nuevo Costo) / Stock Total
        v_new_cost := ((v_current_stock * v_current_cost) + (NEW.quantity * NEW.unit_cost)) / v_new_stock;
    ELSE
        v_new_cost := NEW.unit_cost;
    END IF;

    UPDATE public.products
    SET cost_price = v_new_cost,
        updated_at = NOW()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to activate WAC on reception items
DROP TRIGGER IF EXISTS trg_update_product_wac ON public.receipt_items;
CREATE TRIGGER trg_update_product_wac
AFTER INSERT ON public.receipt_items
FOR EACH ROW EXECUTE FUNCTION public.update_product_wac();

-- 5. Transfer Atomic Validation
CREATE OR REPLACE FUNCTION public.validate_transfer_stores()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.origin_store_id = NEW.destination_store_id THEN
        RAISE EXCEPTION 'Origin and Destination stores must be different';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_transfer_stores ON public.transfers;
CREATE TRIGGER trg_validate_transfer_stores
BEFORE INSERT OR UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.validate_transfer_stores();

-- 6. Reception Cost Variation Guard (Warning only to prevent blocking operations)
-- In production, we log this or use it to flag the reception for review
CREATE OR REPLACE FUNCTION public.check_reception_cost_variation()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_cost NUMERIC;
BEGIN
    SELECT COALESCE(cost_price, 0) INTO v_avg_cost FROM public.products WHERE id = NEW.product_id;

    IF v_avg_cost > 0 AND (NEW.unit_cost > v_avg_cost * 2.0 OR NEW.unit_cost < v_avg_cost * 0.2) THEN
        -- For now we just log a warning in the DB console or metadata
        -- Future: INSERT INTO audit_logs
        RAISE NOTICE 'Critical cost variation for product %: % vs average %', NEW.product_id, NEW.unit_cost, v_avg_cost;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_reception_cost_variation ON public.receipt_items;
CREATE TRIGGER trg_check_reception_cost_variation
BEFORE INSERT ON public.receipt_items
FOR EACH ROW EXECUTE FUNCTION public.check_reception_cost_variation();

COMMIT;
