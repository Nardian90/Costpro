-- ════════════════════════════════════════════════════════════════════
-- Fase 6: Fixes de robustez
-- ════════════════════════════════════════════════════════════════════
-- 1. receive_production_output: recalcular cost_average (WAC) del producto
-- 2. close_service_order_as_sale: crear transaction_items con item "Servicio"
-- ════════════════════════════════════════════════════════════════════

-- ── 1. receive_production_output con WAC ──
CREATE OR REPLACE FUNCTION public.receive_production_output(
  p_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_store_id uuid
) RETURNS void AS $$
DECLARE
  v_current_stock numeric;
  v_current_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_total_materials_cost numeric := 0;
BEGIN
  -- Calcular costo total de materiales usados (actual_qty × actual_unit_cost)
  SELECT COALESCE(SUM(actual_qty * actual_unit_cost), 0)
  INTO v_total_materials_cost
  FROM public.production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  -- Obtener stock y costo promedio actual
  SELECT stock_current, COALESCE(cost_average, 0)
  INTO v_current_stock, v_current_cost
  FROM public.products
  WHERE id = p_product_id AND store_id = p_store_id;

  v_current_stock := COALESCE(v_current_stock, 0);
  v_new_stock := v_current_stock + p_quantity;

  -- Calcular WAC: (stock_actual × costo_actual + cantidad_nueva × costo_materiales) / stock_nuevo
  -- El costo del producto terminado = costo de materiales / cantidad producida
  IF p_quantity > 0 THEN
    v_new_cost := ((v_current_stock * v_current_cost) + (v_total_materials_cost)) / v_new_stock;
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  -- Actualizar producto con stock + cost_average
  UPDATE public.products SET
    stock_current = v_new_stock,
    cost_average = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id AND store_id = p_store_id;

  -- Registrar movimiento de stock
  INSERT INTO public.stock_movements
    (store_id, product_id, quantity_change, movement_type, reference_id, created_at)
  VALUES (p_store_id, p_product_id, p_quantity, 'production_in', p_order_id::text, now());

  -- Actualizar orden
  UPDATE public.production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. close_service_order_as_sale con transaction_items ──
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(
  p_order_id uuid,
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0
) RETURNS uuid AS $$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Calcular monto en CUP
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- Crear transacción
  INSERT INTO public.transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at,
    customer_name, customer_phone
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    p_payment_method::payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(),
    v_order.customer_name, v_order.customer_phone
  ) RETURNING id INTO v_transaction_id;

  -- FIX Fase 6: crear transaction_items con item "Servicio"
  INSERT INTO public.transaction_items (
    transaction_id, product_id, quantity, unit_price, subtotal,
    price_currency, price_at_sale_cup, cash_paid, transfer_paid
  ) VALUES (
    v_transaction_id,
    -- Usar el primer producto del inventario como "producto servicio" si existe
    (SELECT id FROM public.products WHERE store_id = p_store_id LIMIT 1),
    1,
    v_order.budget_total,
    v_order.budget_total,
    p_currency,
    v_amount_cup,
    CASE WHEN p_payment_method = 'cash' THEN v_amount_cup ELSE 0 END,
    CASE WHEN p_payment_method = 'transfer' THEN v_amount_cup ELSE 0 END
  );

  -- Vincular transacción a la orden
  UPDATE public.production_orders SET transaction_id = v_transaction_id WHERE id = p_order_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'fase6_robustness_fixed' AS status;
