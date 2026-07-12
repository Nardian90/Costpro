-- ============================================================================
-- FIX E2E 100% — create_sale con columnas correctas de transaction_items
-- ============================================================================

-- Reescribir create_sale con las columnas correctas de transaction_items
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
  v_cash_paid numeric; v_transfer_paid numeric;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
    END IF;
  END IF;

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
    v_item_currency := COALESCE(v_item->>'currency', p_sale_currency);
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, p_sale_exchange_rate);
    v_cash_paid := COALESCE((v_item->>'cash_paid')::numeric, 0);
    v_transfer_paid := COALESCE((v_item->>'transfer_paid')::numeric, 0);

    v_price_cup := CASE WHEN v_item_currency = 'CUP' THEN v_price * v_qty ELSE v_price * v_qty * v_item_rate END;
    v_cost_cup := CASE WHEN v_item_currency = 'CUP' THEN v_cost * v_qty ELSE v_cost * v_qty * v_item_rate END;

    -- Insert transaction item con columnas CORRECTAS
    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity,
      price_at_sale, cost_at_sale, cash_paid, transfer_paid,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty,
      v_price, v_cost, v_cash_paid, v_transfer_paid,
      v_item_currency, v_price_cup
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
