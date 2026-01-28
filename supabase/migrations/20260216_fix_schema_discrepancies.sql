-- Migration: Add public_image_url and fix receipts status constraint
-- Date: 2026-02-16

BEGIN;

-- 1. Add public_image_url to products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS public_image_url TEXT;

-- 2. Update receipts status check constraint
-- First, identify the constraint name. It's usually 'receipts_status_check' or similar.
-- Based on the user's SQL, it was defined inline. We can drop it by type if we knew the name,
-- or we can just try to add a new one after dropping any existing check on status.

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.receipts'::regclass AND contype = 'c' AND confkey IS NULL AND consrc LIKE '%status%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.receipts DROP CONSTRAINT ' || constraint_name;
    END IF;
END $$;

ALTER TABLE public.receipts
ADD CONSTRAINT receipts_status_check
CHECK (status = ANY (ARRAY['active'::text, 'voided'::text, 'pending'::text, 'partial'::text]));

-- 3. Ensure receipt_items quantity and unit_cost are NUMERIC for precision
-- If it already exists as integer, we might want to alter it.
-- The memory says unit_cost should be numeric.

ALTER TABLE public.receipt_items
ALTER COLUMN quantity TYPE NUMERIC USING quantity::NUMERIC,
ALTER COLUMN unit_cost TYPE NUMERIC USING unit_cost::NUMERIC;

COMMIT;
