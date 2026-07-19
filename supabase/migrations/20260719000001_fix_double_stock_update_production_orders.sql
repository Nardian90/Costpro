-- ============================================================================
-- Migration: 20260719000001_fix_double_stock_update_production_orders.sql
-- Purpose:  Corrige doble actualización de products.stock_current en
--           withdraw_production_item y receive_production_output.
--
-- PROBLEMA (audit 2026-07-19):
--   Ambos RPCs hacen:
--     1) UPDATE products SET stock_current = stock_current ± p_qty   ← directo
--     2) INSERT INTO stock_movements (...)                            ← dispara triggers
--        → tr_sync_inventory_after_movement → UPSERT inventory
--        → trg_sync_products_stock_current → UPDATE products.stock_current
--   Resultado: products.stock_current se modifica DOS VECES.
--   En withdraw: stock baja p_qty*2 en vez de p_qty.
--   En receive_production_output: stock sube p_qty*2 en vez de p_qty.
--   inventory.quantity solo se actualiza una vez (la del trigger),
--   así que products.stock_current e inventory.quantity quedan DIVERGENTES.
--
-- FIX:
--   Eliminar el UPDATE directo a products. Dejar que el INSERT a stock_movements
--   dispare la cadena de triggers que actualiza inventory.quantity y
--   products.stock_current de forma consistente.
--
--   Usar register_stock_movement (RPC canónico) para mantener el patrón
--   uniforme con void_transaction, ventas y recepciones.
--
-- VALIDACIÓN:
--   Antes: withdraw(qty=3) con stock=100 → stock=94 (incorrecto, baja 6)
--   Después: withdraw(qty=3) con stock=100 → stock=97 (correcto, baja 3)
-- ============================================================================

-- ── 1. withdraw_production_item: eliminar UPDATE directo a products ──
CREATE OR REPLACE FUNCTION withdraw_production_item(
  p_item_id UUID,
  p_qty NUMERIC,
  p_unit_cost NUMERIC,
  p_store_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_order_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
  v_user_id UUID;
BEGIN
  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  -- Obtener el creador de la orden para auditoría del stock movement
  SELECT created_by INTO v_user_id
  FROM production_orders WHERE id = v_order_id;

  -- Actualizar el item con la cantidad salida
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = p_unit_cost,
    withdrawn_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END,
    updated_at = now()
  WHERE id = p_item_id;

  -- Registrar movimiento de stock vía RPC canónico.
  -- Esto dispara:
  --   tr_sync_inventory_after_movement → UPSERT inventory
  --   trg_sync_products_stock_current  → UPDATE products.stock_current
  -- Ya NO hacemos UPDATE directo a products (eliminaba la doble actualización).
  PERFORM register_stock_movement(
    p_product_id   := v_product_id,
    p_store_id     := p_store_id,
    p_user_id      := COALESCE(v_user_id, auth.uid()),
    p_quantity     := -p_qty,
    p_movement_type := 'production_out',
    p_reason       := 'Salida para orden de producción ' || v_order_id::text,
    p_reference_id := v_order_id::text,
    p_unit_cost    := p_unit_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
--Nota: register_stock_movement espera movement_type como enum. production_out debe existir.

-- ── 2. receive_production_output: eliminar UPDATE directo a products ──
CREATE OR REPLACE FUNCTION receive_production_output(
  p_order_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_store_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_user_id UUID;
  v_product_exists BOOLEAN;
BEGIN
  -- Validar que el producto pertenece a la tienda
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id AND store_id = p_store_id)
    INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Producto no encontrado en esta tienda';
  END IF;

  -- Actualizar la orden con el producto de salida
  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  -- Calcular costo total de materiales consumidos (para WAC del producto terminado)
  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  -- Leer estado actual del producto para cálculo WAC
  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id;

  v_new_stock := v_current_stock + p_quantity;
  v_new_cost := CASE WHEN v_new_stock > 0
    THEN (v_current_stock * v_current_cost + v_total_materials_cost) / v_new_stock
    ELSE v_total_materials_cost / GREATEST(p_quantity, 1)
  END;

  -- Actualizar cost_average del producto terminado (WAC).
  -- NO tocamos stock_current aquí: lo hace el trigger tras el INSERT a stock_movements.
  UPDATE products SET
    cost_average = v_new_cost,
    cost_price = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id;

  -- Obtener creador de la orden para auditoría
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  -- Registrar movimiento de stock vía RPC canónico.
  -- Esto incrementa inventory.quantity y products.stock_current una sola vez.
  PERFORM register_stock_movement(
    p_product_id   := p_product_id,
    p_store_id     := p_store_id,
    p_user_id      := COALESCE(v_user_id, auth.uid()),
    p_quantity     := p_quantity,
    p_movement_type := 'production_in',
    p_reason       := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_reference_id := p_order_id::text,
    p_unit_cost    := v_new_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Comentario informativo ──
COMMENT ON FUNCTION withdraw_production_item IS 'Descuenta material de una orden de producción. Usa register_stock_movement para mantener consistencia inventory↔products.stock_current. Antes (bug C-1) hacía UPDATE directo + INSERT, causando doble descuento.';
COMMENT ON FUNCTION receive_production_output IS 'Recibe producto terminado de orden de producción. Calcula WAC con costo total de materiales. Usa register_stock_movement para entrada de stock. Antes (bug C-2) hacía UPDATE directo + INSERT, causando doble incremento.';
