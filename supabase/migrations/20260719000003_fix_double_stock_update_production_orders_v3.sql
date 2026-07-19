-- ============================================================================
-- Migration: 20260719000003_fix_double_stock_update_production_orders_v3.sql
-- Purpose:  Versión final del fix. Llama a register_stock_movement con casts
--           explícitos de tipos (numeric → integer).
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
  v_qty_int INTEGER;
BEGIN
  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  -- Convertir numeric → integer explícitamente
  v_qty_int := GREATEST(p_qty, 0)::integer;

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
  -- register_stock_movement espera integer para p_quantity.
  -- Pasa casts explícitos para que PostgreSQL resuelva la firma.
  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := p_store_id,
    p_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int,
    p_movement_type := 'production_out'::text,
    p_reason := 'Salida para orden ' || v_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost::numeric,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id
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
  v_qty_int INTEGER;
BEGIN
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id AND store_id = p_store_id)
    INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Producto no encontrado en esta tienda';
  END IF;

  v_qty_int := GREATEST(p_quantity, 0)::integer;

  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id;

  v_new_stock := v_current_stock + p_quantity;
  v_new_cost := CASE WHEN v_new_stock > 0
    THEN (v_current_stock * v_current_cost + v_total_materials_cost) / v_new_stock
    ELSE v_total_materials_cost / GREATEST(p_quantity, 1)
  END;

  -- Actualizar cost_average (WAC). NO tocar stock_current.
  UPDATE products SET
    cost_average = v_new_cost,
    cost_price = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := v_qty_int,
    p_movement_type := 'production_in'::text,
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_new_cost::numeric,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION withdraw_production_item IS 'Descuenta material de una orden de producción. Usa register_stock_movement (10-param canonical) con casts explícitos. Antes hacía UPDATE directo + INSERT, causando doble descuento (bug C-1).';
COMMENT ON FUNCTION receive_production_output IS 'Recibe producto terminado de orden de producción. Calcula WAC con costo total de materiales. Usa register_stock_movement para entrada de stock. Antes hacía UPDATE directo + INSERT, causando doble incremento (bug C-2).';
