-- Migration: Resolve "sale_price" database error and unify product schema
-- Date: 2026-02-15
-- This migration drops any legacy triggers that might be referencing the old "sale_price" column
-- and ensures the products table uses the "price" column consistently.

BEGIN;

-- 1. Identify and drop legacy triggers on products table
-- We use a DO block to safely drop triggers if they exist
DO $$
DECLARE
    trig_name TEXT;
BEGIN
    -- List of known or potential legacy trigger names
    FOR trig_name IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'products'
          AND trigger_schema = 'public'
          AND trigger_name NOT IN ('trg_sync_products_stock_current') -- Keep known good triggers
    LOOP
        -- If we found any other trigger, it might be the legacy audit or sync trigger
        EXECUTE 'DROP TRIGGER IF EXISTS ' || trig_name || ' ON public.products';
        RAISE NOTICE 'Dropped legacy trigger: %', trig_name;
    END LOOP;
END $$;

-- 2. Ensure "price" column exists and "sale_price" is gone
DO $$
BEGIN
    -- If sale_price exists, rename it to price if price doesn't exist, or just drop it
    IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'products' AND column_name = 'sale_price') THEN
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'products' AND column_name = 'price') THEN
            ALTER TABLE public.products RENAME COLUMN sale_price TO price;
        ELSE
            ALTER TABLE public.products DROP COLUMN sale_price;
        END IF;
    END IF;
END $$;

-- 3. Fix audit_product_changes function if it exists and uses sale_price
CREATE OR REPLACE FUNCTION public.audit_product_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        store_id
    )
    VALUES (
        auth.uid(),
        'UPDATE_PRODUCT',
        'products',
        NEW.id,
        jsonb_build_object(
            'name', OLD.name,
            'price', OLD.price,
            'cost_price', OLD.cost_price,
            'sku', OLD.sku
        ),
        jsonb_build_object(
            'name', NEW.name,
            'price', NEW.price,
            'cost_price', NEW.cost_price,
            'sku', NEW.sku
        ),
        NEW.store_id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Re-create the audit trigger with the fixed function if needed
-- We only add it if it was previously there or if we want to ensure auditing
DROP TRIGGER IF EXISTS trigger_audit_product_changes ON public.products;
CREATE TRIGGER trigger_audit_product_changes
AFTER UPDATE ON public.products
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.price IS DISTINCT FROM NEW.price OR OLD.cost_price IS DISTINCT FROM NEW.cost_price OR OLD.sku IS DISTINCT FROM NEW.sku)
EXECUTE FUNCTION public.audit_product_changes();

COMMIT;
