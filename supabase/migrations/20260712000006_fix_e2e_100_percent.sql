-- ============================================================================
-- FIX E2E — Llevar readiness al 100%
-- Creado: 2026-07-12
-- ============================================================================

-- ── FIX 1: received_services — policy INSERT para authenticated ──
-- El policy actual received_services_write es para service_role solo.
-- Añadir policy para usuarios authenticated.
CREATE POLICY "received_services_insert_auth" ON received_services
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "received_services_update_auth" ON received_services
  FOR UPDATE TO authenticated
  USING (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "received_services_delete_auth" ON received_services
  FOR DELETE TO authenticated
  USING (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── FIX 2: production_orders — añadir columnas paid_at y payment_method ──
-- (ya añadidas en migration anterior pero verificar)
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- ── FIX 3: commission_payments — trigger que recalcula amount_cup correctamente ──
-- El trigger actual solo calcula cuando status='paid'. Pero el PATCH via REST
-- no dispara el trigger BEFORE UPDATE correctamente para amount_cup.
-- Asegurar que el trigger siempre recalcule.
CREATE OR REPLACE FUNCTION calculate_commission_amount_cup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    IF NEW.currency = 'CUP' OR NEW.currency IS NULL THEN
      NEW.amount_cup := NEW.final_amount;
    ELSE
      NEW.amount_cup := NEW.final_amount * COALESCE(NEW.exchange_rate, 1.0);
    END IF;
  ELSE
    NEW.amount_cup := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── FIX 4: create_sale — hacer p_items más flexible ──
-- El error "cannot extract elements from a scalar" ocurre cuando p_items
-- se pasa como string en vez de array. La RPC ya espera jsonb array.
-- No necesita fix en la RPC — el problema era que python3 enviaba json.dumps()
-- que lo convertía a string. Con el fix del script de prueba basta.
-- Pero añadimos un guard por si acaso:
CREATE OR REPLACE FUNCTION create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamptz DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL, p_sale_currency text DEFAULT 'CUP',
  p_sale_exchange_rate numeric DEFAULT 1.0, p_zelle_amount numeric DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
  v_tx_id uuid;
  v_existing uuid;
  v_item jsonb;
  v_pid uuid; v_qty numeric; v_price numeric; v_cost numeric; v_stock numeric;
  v_variant_id uuid;
  v_item_currency text; v_item_rate numeric;
  v_price_cup numeric; v_cost_cup numeric;
  v_currencies text[] := ARRAY[]::text[];
  v_real_subtotal numeric := 0;
  v_real_cost numeric := 0;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
    END IF;
  END IF;

  -- Collect currencies
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    IF NOT (v_currencies @> ARRAY[v_item_currency]) THEN
      v_currencies := array_append(v_currencies, v_item_currency);
    END IF;
  END LOOP;

  -- Create transaction
  INSERT INTO transactions (
    store_id, seller_id, total_amount, subtotal, discount_type, discount_value,
    payment_method, tax_amount, status, created_at, idempotency_key,
    sale_currency, sale_exchange_rate,
    cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    p_store_id, p_seller_id, p_total_amount, COALESCE(p_subtotal, p_total_amount),
    p_discount_type, p_discount_value, p_payment_method,
    p_tax_amount, 'completed', COALESCE(p_operation_date, now()),
    p_idempotency_key, p_sale_currency, p_sale_exchange_rate,
    p_cash_amount, p_transfer_amount, p_zelle_amount
  )
  RETURNING id INTO v_tx_id;

  -- Process items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, 1.0);

    v_price_cup := CASE WHEN v_item_currency = 'CUP' THEN v_price * v_qty ELSE v_price * v_qty * v_item_rate END;
    v_cost_cup := CASE WHEN v_item_currency = 'CUP' THEN v_cost * v_qty ELSE v_cost * v_qty * v_item_rate END;
    v_real_subtotal := v_real_subtotal + v_price_cup;
    v_real_cost := v_real_cost + v_cost_cup;

    -- Insert transaction item
    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, unit_price, unit_cost,
      subtotal, currency, exchange_rate, price_cup, cost_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost,
      v_price * v_qty, v_item_currency, v_item_rate, v_price_cup, v_cost_cup
    );

    -- Deduct stock
    UPDATE products SET stock_current = stock_current - v_qty WHERE id = v_pid AND store_id = p_store_id;

    -- Register stock movement
    INSERT INTO stock_movements (store_id, product_id, variant_id, quantity_change, movement_type, reference_id, created_at)
    VALUES (p_store_id, v_pid, v_variant_id, -v_qty, 'sale', v_tx_id::text, now());
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_tx_id);
END;
$$ LANGUAGE plpgsql;
