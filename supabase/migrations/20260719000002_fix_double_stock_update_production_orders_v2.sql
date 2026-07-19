-- ============================================================================
-- Migration: 20260719000002_fix_double_stock_update_production_orders_v2.sql
-- Purpose:  Versión corregida de 20260719000001. Usa la firma correcta de
--           register_stock_movement (10 params: uuid×4, integer, text×4, numeric, text, uuid).
--           p_sale_id (uuid) se usa como reference_id; p_reason como reference_doc.
-- ============================================================================

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

  -- Obtener creador de la orden para auditoría del stock movement
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

  -- Registrar movimiento de stock vía RPC canónico (10 params).
  -- Esto dispara tr_sync_inventory_after_movement → UPSERT inventory
  -- y trg_sync_products_stock_current → UPDATE products.stock_current
  -- Ya NO hacemos UPDATE directo a products (eliminaba la doble actualización).
  -- Nota: p_sale_id=NULL (no es venta), pasamos v_order_id como reference_id vía p_notes.
  PERFORM register_stock_movement(
    v_product_id,                              -- p_product_id
    p_store_id,                                -- p_store_id
    COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),  -- p_user_id
    -p_qty::integer,                           -- p_quantity (negativo = salida)
    'production_out',                          -- p_movement_type
    'Salida para orden ' || v_order_id::text,  -- p_reason (va a reference_doc)
    NULL,                                      -- p_sale_id (no aplica)
    p_unit_cost,                               -- p_unit_cost
    'production_order:' || v_order_id::text,   -- p_notes (identifica la orden)
    v_variant_id                               -- p_variant_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id AND store_id = p_store_id)
    INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Producto no encontrado en esta tienda';
  END IF;

  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  -- Calcular costo total de materiales consumidos
  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  -- Leer estado actual del producto
  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id;

  v_new_stock := v_current_stock + p_quantity;
  v_new_cost := CASE WHEN v_new_stock > 0
    THEN (v_current_stock * v_current_cost + v_total_materials_cost) / v_new_stock
    ELSE v_total_materials_cost / GREATEST(p_quantity, 1)
  END;

  -- Actualizar cost_average (WAC). NO tocar stock_current: lo hace el trigger.
  UPDATE products SET
    cost_average = v_new_cost,
    cost_price = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  PERFORM register_stock_movement(
    p_product_id,
    p_store_id,
    COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity::integer,
    'production_in',
    'Entrada de producto terminado de orden ' || p_order_id::text,
    NULL,
    v_new_cost,
    'production_order:' || p_order_id::text,
    NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION withdraw_production_item IS 'Descuenta material de una orden de producción. Usa register_stock_movement (10-param canonical) para mantener consistencia inventory↔products.stock_current. Antes hacía UPDATE directo + INSERT, causando doble descuento (bug C-1).';
COMMENT ON FUNCTION receive_production_output IS 'Recibe producto terminado de orden de producción. Calcula WAC con costo total de materiales. Usa register_stock_movement para entrada de stock. Antes hacía UPDATE directo + INSERT, causando doble incremento (bug C-2).';
