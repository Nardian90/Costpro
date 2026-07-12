-- ============================================================================
-- FIX Production Orders — Critical bugs C1-C6 + R1 (work type)
-- Creado: 2026-07-12
-- ============================================================================

-- ── C1: Permitir 'production_order' y 'work' en payment_transactions.ref_type ──
ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_ref_type_check
  CHECK (ref_type IN ('receipt', 'service', 'production_order', 'work'));

-- ── R1: Añadir 'work' a production_orders.order_type ──
ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_order_type_check;
ALTER TABLE production_orders ADD CONSTRAINT production_orders_order_type_check
  CHECK (order_type IN ('production', 'service', 'work'));

-- ── C4: Actualizar update_payment_status trigger con rama production_order ──
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_type TEXT := NEW.ref_type;
  v_ref_id UUID := NEW.ref_id;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
BEGIN
  IF v_ref_type = 'receipt' THEN
    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id;
    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN (SELECT payment_method FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1) ELSE NULL END;
    UPDATE receipts SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method, paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id;
    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN (SELECT payment_method FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1) ELSE NULL END;
    UPDATE received_services SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method, paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END WHERE id = v_ref_id;

  ELSIF v_ref_type = 'production_order' THEN
    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'production_order' AND ref_id = v_ref_id;
    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN (SELECT payment_method FROM payment_transactions WHERE ref_type = 'production_order' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1) ELSE NULL END;
    UPDATE production_orders SET paid_amount = v_paid, payment_status = v_status, paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END WHERE id = v_ref_id;

  ELSIF v_ref_type = 'work' THEN
    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'work' AND ref_id = v_ref_id;
    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN (SELECT payment_method FROM payment_transactions WHERE ref_type = 'work' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1) ELSE NULL END;
    UPDATE production_orders SET paid_amount = v_paid, payment_status = v_status, paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END WHERE id = v_ref_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── C7: Actualizar register_supplier_payment para validar production_order y work ──
CREATE OR REPLACE FUNCTION register_supplier_payment(
  p_store_id UUID,
  p_ref_type TEXT,
  p_ref_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_paid_by UUID,
  p_currency TEXT DEFAULT 'CUP',
  p_exchange_rate NUMERIC DEFAULT 1.0,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_doc_store_id UUID;
BEGIN
  -- Validar que el documento pertenece a la store_id
  IF p_ref_type = 'receipt' THEN
    SELECT store_id INTO v_doc_store_id FROM receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id INTO v_doc_store_id FROM received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id INTO v_doc_store_id FROM production_orders WHERE id = p_ref_id;
  END IF;

  IF v_doc_store_id IS NULL OR v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'Documento no encontrado o no pertenece a esta tienda';
  END IF;

  INSERT INTO payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── C2: Fix withdraw_production_item — columnas correctas + enum ──
-- Primero añadir los nuevos valores al enum movement_type
DO $$ BEGIN
  ALTER TYPE public.movement_type ADD VALUE 'production_out';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.movement_type ADD VALUE 'production_in';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
BEGIN
  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  -- Actualizar el item con la cantidad salida
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = p_unit_cost,
    withdrawn_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END,
    updated_at = now()
  WHERE id = p_item_id;

  -- Descontar del inventario
  UPDATE products SET
    stock_current = stock_current - p_qty,
    updated_at = now()
  WHERE id = v_product_id AND store_id = p_store_id;

  -- Registrar movimiento de stock con columnas correctas
  INSERT INTO stock_movements (store_id, product_id, variant_id, quantity_change, movement_type, reference_id, created_at)
  VALUES (p_store_id, v_product_id, v_variant_id, -p_qty, 'production_out', v_order_id::text, now());
END;
$$ LANGUAGE plpgsql;

-- ── C3: Fix receive_production_output — columnas correctas ──
CREATE OR REPLACE FUNCTION receive_production_output(
  p_order_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_store_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Actualizar la orden con el producto de salida
  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  -- Incrementar inventario del producto terminado
  UPDATE products SET
    stock_current = stock_current + p_quantity,
    updated_at = now()
  WHERE id = p_product_id AND store_id = p_store_id;

  -- Registrar movimiento de stock con columnas correctas
  INSERT INTO stock_movements (store_id, product_id, quantity_change, movement_type, reference_id, created_at)
  VALUES (p_store_id, p_product_id, p_quantity, 'production_in', p_order_id::text, now());
END;
$$ LANGUAGE plpgsql;

-- ── C5: RPC para cerrar orden de servicio como venta ──
-- Inserta una fila en transactions (venta) al cerrar una orden de servicio
CREATE OR REPLACE FUNCTION close_service_order_as_sale(
  p_order_id UUID,
  p_store_id UUID,
  p_seller_id UUID,
  p_payment_method TEXT,
  p_currency TEXT DEFAULT 'CUP',
  p_exchange_rate NUMERIC DEFAULT 1.0
)
RETURNS UUID AS $$
DECLARE
  v_order production_orders%ROWTYPE;
  v_transaction_id UUID;
  v_amount_cup NUMERIC;
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id AND store_id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada';
  END IF;

  -- Calcular monto en CUP
  IF p_currency = 'CUP' THEN
    v_amount_cup := v_order.budget_total;
  ELSE
    v_amount_cup := v_order.budget_total * p_exchange_rate;
  END IF;

  -- Insertar venta en transactions
  INSERT INTO transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at,
    customer_name, customer_phone
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total, p_payment_method,
    p_currency, p_exchange_rate, 'completed', now(),
    v_order.customer_name, v_order.customer_phone
  )
  RETURNING id INTO v_transaction_id;

  -- Vincular la transacción a la orden
  UPDATE production_orders SET
    transaction_id = v_transaction_id,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- ── Añadir columna transaction_id a production_orders ──
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS transaction_id UUID;
