-- ============================================================================
-- Migration: 20260820000007_fix_h01_store_mismatch.sql
-- FIX H-01: Validar que NEW.store_id coincide con products.store_id
--
-- Antes: un movimiento con store_id equivocado podía crear inventory
--   en la store equivocada sin error.
-- Después: el trigger rechaza con ERR_STORE_MISMATCH antes de tocar inventory.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_new_qty numeric;
  v_exists boolean;
  v_product_store_id uuid;
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- FIX H-01: Validar que el producto existe y su store_id coincide
  SELECT store_id INTO v_product_store_id FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: Producto % no existe', NEW.product_id;
  END IF;
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: store_id es NULL para el producto %', NEW.product_id;
  END IF;
  IF v_product_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: products.store_id es NULL para el producto %', NEW.product_id;
  END IF;
  IF NEW.store_id IS DISTINCT FROM v_product_store_id THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: movement store_id % no coincide con product store_id % para el producto %',
      NEW.store_id, v_product_store_id, NEW.product_id;
  END IF;

  -- Check if inventory record exists for this product+store
  SELECT EXISTS(
    SELECT 1 FROM public.inventory
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- inventory no existe → base = 0
    v_new_qty := NEW.quantity_change;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: No hay inventario para el producto % en tienda %. No se puede registrar una salida.', NEW.product_id, NEW.store_id;
    END IF;

    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, v_new_qty, 1, now())
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.inventory
    SET quantity = public.inventory.quantity + NEW.quantity_change,
        version = public.inventory.version + 1,
        updated_at = now()
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
    RETURNING quantity INTO v_new_qty;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: El stock no puede ser negativo para el producto % (Resultado: %)', NEW.product_id, v_new_qty;
    END IF;
  END IF;

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_sync_inventory_on_movement IS
  'FIX H-01 (20260820000007): Valida store_id coincide con products.store_id.
   Rechaza movimientos cross-store con ERR_STORE_MISMATCH.';
