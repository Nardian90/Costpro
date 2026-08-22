-- ============================================================================
-- Migration: 20260820000006_fix_fn_sync_inventory_on_movement.sql
-- CORRECTIVO CRÍTICO: fn_sync_inventory_on_movement Caso B (inventory no existe)
--
-- BUG: Cuando inventory no existe para (product_id, store_id), la función lee
-- products.stock_current como fuente de stock base. Esto es incorrecto porque
-- products.stock_current es un cache derivado que puede estar desincronizado.
-- Además, usa GREATEST(v_new_qty, 0) silenciosamente en lugar de rechazar
-- ventas sin stock.
--
-- CORRECCIÓN:
-- 1. Cuando inventory no existe: base = 0 (no products.stock_current)
-- 2. Si quantity_change < 0 y no hay inventory: RAISE ERR_INSUFFICIENT_STOCK
--    (no permite ventas sobre inventory inexistente sin error)
-- 3. Si quantity_change > 0: crear inventory con esa cantidad
--
-- Esto previene que:
-- - Una venta sobre inventory inexistente termine con balance_after=0 sin error
-- - Una venta cuando products.stock_current está desincronizado calcule mal
-- - Un restore seguido de importación backdated produzca divergencias
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
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Check if inventory record exists for this product+store
  SELECT EXISTS(
    SELECT 1 FROM public.inventory
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- FIX: inventory no existe → base = 0 (NO leer products.stock_current)
    -- products.stock_current es un cache derivado y puede estar desincronizado.
    v_new_qty := NEW.quantity_change;

    IF v_new_qty < 0 THEN
      -- FIX: rechazar ventas/ajustes negativos cuando no hay inventory
      -- Antes: GREATEST(v_new_qty, 0) silenciaba el error → balance_after=0
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: No hay inventario para el producto % en tienda %. No se puede registrar una salida.', NEW.product_id, NEW.store_id;
    END IF;

    -- quantity_change > 0: crear inventory con esa cantidad
    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, v_new_qty, 1, now())
    ON CONFLICT DO NOTHING;
  ELSE
    -- inventory existe: usar inventory.quantity como fuente (CORRECTO)
    -- SELECT FOR UPDATE ya está implícito en el UPDATE ... RETURNING
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
  'FIX 20260820000006: Caso B (inventory no existe) usa base=0 en vez de products.stock_current.
   Rechaza salidas (quantity_change<0) sobre inventory inexistente con ERR_INSUFFICIENT_STOCK.
   Antes: GREATEST(v_new_qty, 0) silenciaba el error produciendo balance_after=0.';
