-- Migration: Hardened Inventory Final
-- Date: 2026-03-05
-- Author: Jules
-- Description: Ensures that inventory never goes negative by adding a CHECK constraint and hardening the sync function.

BEGIN;

-- 1. Ensure the inventory table has a check constraint for non-negative quantity
-- We use a DO block to safely add the constraint if it doesn't exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_quantity_check'
    ) THEN
        ALTER TABLE public.inventory ADD CONSTRAINT inventory_quantity_check CHECK (quantity >= 0);
    END IF;
END $$;

-- 2. Harden the sync function to provide a clear error message before the constraint is violated
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_current_qty integer;
    v_new_qty integer;
BEGIN
    -- Get current quantity if exists
    SELECT quantity INTO v_current_qty
    FROM public.inventory
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id;

    -- Calculate new quantity
    v_new_qty := COALESCE(v_current_qty, 0) + NEW.quantity_change;

    -- Explicit validation before update/insert
    IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Product % (Store: %) cannot go below 0. Current: %, Change: %, Result: %',
            NEW.product_id, NEW.store_id, COALESCE(v_current_qty, 0), NEW.quantity_change, v_new_qty;
    END IF;

    -- Perform atomic upsert
    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, NEW.quantity_change, 1, now())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET
        quantity = public.inventory.quantity + EXCLUDED.quantity,
        version = public.inventory.version + 1,
        updated_at = now()
    RETURNING quantity INTO v_new_qty;

    NEW.balance_after := v_new_qty;
    RETURN NEW;
END;
$function$;

COMMIT;
