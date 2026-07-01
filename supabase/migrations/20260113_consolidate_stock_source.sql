-- Migration: Consolidate stock source of truth and update stock movement function
-- Date: 2026-01-13

BEGIN;

-- 1. Create a trigger to synchronize products.stock_current with inventory.quantity

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.sync_products_stock_current()
RETURNS TRIGGER AS $$
BEGIN
  -- The action is the same for both INSERT and UPDATE
  UPDATE public.products
  SET stock_current = NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_sync_products_stock_current
AFTER INSERT OR UPDATE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.sync_products_stock_current();

-- 2. Update the register_stock_movement function to use optimistic locking

CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity_change integer,
  p_movement_type text,
  p_reference_doc text,
  p_created_by uuid,
  p_inventory_version integer DEFAULT NULL -- Make the version parameter optional
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_new_qty integer;
  v_new_version integer;
  v_res jsonb;
BEGIN
  -- Insert movement
  INSERT INTO public.stock_movements(
    store_id, product_id, variant_id, quantity_change, movement_type, reference_doc, movement_date, created_by, created_at
  ) VALUES (
    p_store_id, p_product_id, p_variant_id, p_quantity_change, p_movement_type::public.movement_type, p_reference_doc, now(), p_created_by, now()
  );

  -- Upsert inventario with optimistic locking
  INSERT INTO public.inventory (id, store_id, product_id, quantity, version, updated_at)
  VALUES (gen_random_uuid(), p_store_id, p_product_id, p_quantity_change, 1, now()) -- Corrected logic
  ON CONFLICT (store_id, product_id) DO UPDATE
  SET quantity = public.inventory.quantity + p_quantity_change,
      version = public.inventory.version + 1,
      updated_at = now()
  WHERE (p_inventory_version IS NULL OR public.inventory.version = p_inventory_version) -- Handle null version
  RETURNING quantity, version INTO v_new_qty, v_new_version;

  -- Verify that a row was updated (if a version was provided)
  IF p_inventory_version IS NOT NULL AND NOT FOUND THEN
    RAISE EXCEPTION 'Concurrency error: Inventory version mismatch';
  END IF;

  v_res := jsonb_build_object('status', 'ok', 'new_quantity', v_new_qty, 'new_version', v_new_version);
  RETURN v_res;
END;
$body$;

COMMIT;
