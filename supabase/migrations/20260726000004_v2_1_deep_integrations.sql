-- ════════════════════════════════════════════════════════════════════════
-- V2.1 — INTEGRACIONES PROFUNDAS
-- 1. create_sale vende desde lotes específicos + descuenta warehouse_stock
-- 2. register_reception recibe a almacén específico
-- 3. Reorder points basados en clasificación ABC
-- 4. Conciliación bancaria: matching automático
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CREATE_SALE V2: soporta lotes + multi-almacén
--    Parámetros nuevos: p_warehouse_id (opcional), p_items ahora puede incluir lot_id
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_sale_currency text DEFAULT 'CUP',
  p_sale_exchange_rate numeric DEFAULT 1.0,
  p_zelle_amount numeric DEFAULT 0,
  p_warehouse_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $func$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_existing uuid;
  v_cost numeric; v_price_cup numeric; v_cost_cup numeric;
  v_item_currency text; v_item_rate numeric;
  v_currencies text[] := ARRAY[]::text[];
  v_is_mixed boolean := false;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units_to_deduct integer;
  v_product_name text;
  v_rows_affected integer;
  v_lot_id uuid;
  v_lot_qty numeric;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_has_warehouses boolean := false;
  v_wh_stock_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Check if store has warehouses configured
  SELECT EXISTS(SELECT 1 FROM public.warehouses WHERE store_id = p_store_id AND is_active = true) INTO v_has_warehouses;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    IF NOT (v_currencies @> ARRAY[v_item_currency]) THEN
      v_currencies := array_append(v_currencies, v_item_currency);
    END IF;
  END LOOP;
  v_is_mixed := array_length(v_currencies, 1) > 1;

  IF p_payment_method = 'mixed' AND NOT v_is_mixed AND (p_cash_amount + p_transfer_amount + p_zelle_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    cash_amount, transfer_amount, zelle_amount, idempotency_key, created_at, completed_at,
    sale_currency, sale_exchange_rate
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed',
    p_payment_method::payment_method_enum,
    p_discount_type::discount_type_enum,
    p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_cash_amount, p_transfer_amount, p_zelle_amount, p_idempotency_key, v_eff, v_eff,
    CASE WHEN v_is_mixed THEN 'MIXED' ELSE COALESCE(p_sale_currency, v_currencies[1]) END,
    p_sale_exchange_rate
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, 1.0);
    v_lot_id := NULLIF(v_item->>'lot_id', '')::uuid;

    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      IF v_conversion_factor IS NULL THEN v_conversion_factor := 1; END IF;
    ELSE
      v_conversion_factor := 1;
    END IF;

    v_units_to_deduct := v_qty * v_conversion_factor;

    -- ── DEDUCTION STRATEGY ──────────────────────────────────────────────
    -- 1. If lot_id is specified: deduct from lot
    -- 2. If warehouse_id is specified and store has warehouses: deduct from warehouse_stock
    -- 3. Fallback: deduct from products.stock_current (legacy)

    IF v_lot_id IS NOT NULL THEN
      -- Deduct from specific lot
      UPDATE public.product_lots
      SET quantity_remaining = quantity_remaining - v_units_to_deduct,
          status = CASE WHEN quantity_remaining - v_units_to_deduct <= 0 THEN 'depleted' ELSE status END,
          updated_at = now()
      WHERE id = v_lot_id AND store_id = p_store_id AND quantity_remaining >= v_units_to_deduct;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'ERR_LOT_INSUFFICIENT: Lote % sin stock suficiente', v_lot_id;
      END IF;

      -- Also update product stock_current for consistency
      UPDATE public.products SET stock_current = stock_current - v_units_to_deduct
      WHERE id = v_pid AND stock_current >= v_units_to_deduct;
      -- Note: we don't check ROW_COUNT here because lot might have stock even if product stock_current is 0

    ELSIF v_has_warehouses AND p_warehouse_id IS NOT NULL THEN
      -- Deduct from specific warehouse
      UPDATE public.warehouse_stock
      SET quantity = quantity - v_units_to_deduct, updated_at = now()
      WHERE warehouse_id = p_warehouse_id AND product_id = v_pid AND quantity >= v_units_to_deduct;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        -- Try to create warehouse_stock entry if it doesn't exist (might be 0 qty)
        SELECT id INTO v_wh_stock_id FROM public.warehouse_stock WHERE warehouse_id = p_warehouse_id AND product_id = v_pid;
        IF v_wh_stock_id IS NULL THEN
          RAISE EXCEPTION 'ERR_WAREHOUSE_NO_STOCK: Producto % no encontrado en almacén', v_pid;
        ELSE
          RAISE EXCEPTION 'ERR_WAREHOUSE_INSUFFICIENT: Stock insuficiente en almacén para producto %', v_pid;
        END IF;
      END IF;

      -- Also update product stock_current
      UPDATE public.products SET stock_current = stock_current - v_units_to_deduct
      WHERE id = v_pid AND stock_current >= v_units_to_deduct;

    ELSE
      -- Legacy: deduct from product stock_current (atomic)
      UPDATE public.products
      SET stock_current = stock_current - v_units_to_deduct
      WHERE id = v_pid AND stock_current >= v_units_to_deduct;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        SELECT name INTO v_product_name FROM public.products WHERE id = v_pid;
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: %', COALESCE(v_product_name, v_pid::text);
      END IF;
    END IF;

    v_price_cup := CASE WHEN v_item_currency = 'CUP' THEN v_price * v_qty ELSE v_price * v_qty * v_item_rate END;
    v_cost_cup := CASE WHEN v_item_currency = 'CUP' THEN v_cost * v_qty ELSE v_cost * v_qty * v_item_rate END;

    -- Insert transaction_item
    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost,
      v_item_currency, v_price_cup
    )
    RETURNING id INTO v_existing; -- reuse v_existing as item_id

    -- If lot was specified, record the lot-item link
    IF v_lot_id IS NOT NULL THEN
      INSERT INTO public.transaction_item_lots (transaction_item_id, lot_id, quantity)
      VALUES (v_existing, v_lot_id, v_qty);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_tx_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. REGISTER_RECEPTION V2: recibe a almacén específico si se especifica
--    Añade p_warehouse_id opcional
-- ──────────────────────────────────────────────────────────────────────────
-- We can't easily modify the existing register_reception RPC signature,
-- so we create a wrapper that accepts warehouse_id and updates warehouse_stock

CREATE OR REPLACE FUNCTION public.receive_to_warehouse(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0,
  p_warehouse_id uuid DEFAULT NULL,
  p_lot_number text DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Recepción a almacén'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_lot_id uuid;
  v_wh_id uuid;
  v_has_wh boolean := false;
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Check if store has warehouses
  SELECT EXISTS(SELECT 1 FROM public.warehouses WHERE store_id = p_store_id AND is_active = true) INTO v_has_wh;

  -- If warehouse_id not specified, use default warehouse
  IF p_warehouse_id IS NOT NULL THEN
    v_wh_id := p_warehouse_id;
  ELSIF v_has_wh THEN
    SELECT id INTO v_wh_id FROM public.warehouses WHERE store_id = p_store_id AND is_active = true AND is_default = true LIMIT 1;
    IF v_wh_id IS NULL THEN
      SELECT id INTO v_wh_id FROM public.warehouses WHERE store_id = p_store_id AND is_active = true LIMIT 1;
    END IF;
  END IF;

  -- Update product stock (always)
  UPDATE public.products
  SET stock_current = stock_current + p_quantity,
      cost_average = CASE
        WHEN stock_current + p_quantity = 0 THEN 0
        ELSE ((stock_current * cost_average) + (p_quantity * p_unit_cost)) / (stock_current + p_quantity)
      END,
      updated_at = now()
  WHERE id = p_product_id AND store_id = p_store_id;

  -- Update warehouse_stock if warehouse exists
  IF v_wh_id IS NOT NULL THEN
    INSERT INTO public.warehouse_stock (store_id, warehouse_id, product_id, quantity, updated_at)
    VALUES (p_store_id, v_wh_id, p_product_id, p_quantity, now())
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = warehouse_stock.quantity + p_quantity, updated_at = now();
  END IF;

  -- Create lot if lot_number is specified
  IF p_lot_number IS NOT NULL THEN
    INSERT INTO public.product_lots (store_id, product_id, lot_number, expiration_date, quantity_received, quantity_remaining, unit_cost, status, supplier, created_by)
    VALUES (p_store_id, p_product_id, p_lot_number, p_expiration_date, p_quantity, p_quantity, p_unit_cost, 'active', NULL, v_uid)
    RETURNING id INTO v_lot_id;
  END IF;

  -- Register stock movement
  INSERT INTO public.stock_movements (store_id, product_id, movement_type, quantity, unit_cost, reason, created_by)
  VALUES (p_store_id, p_product_id, 'reception', p_quantity, p_unit_cost, p_reason, v_uid);

  RETURN jsonb_build_object(
    'status', 'success',
    'product_id', p_product_id,
    'quantity_added', p_quantity,
    'warehouse_id', v_wh_id,
    'lot_id', v_lot_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_to_warehouse TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_to_warehouse TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. REORDER POINTS: sugiere OC basadas en ABC + stock mínimo
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_reorder_suggestions(
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_suggestions jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', p.id,
    'product_name', p.name,
    'sku', p.sku,
    'current_stock', p.stock_current,
    'suggested_quantity', CASE
      WHEN abc.classification = 'A' THEN GREATEST(50, p.stock_current * -1 + 100)
      WHEN abc.classification = 'B' THEN GREATEST(20, p.stock_current * -1 + 50)
      ELSE GREATEST(10, p.stock_current * -1 + 20)
    END,
    'abc_class', COALESCE(abc.classification, 'C'),
    'priority', CASE
      WHEN abc.classification = 'A' AND p.stock_current <= 5 THEN 'critical'
      WHEN abc.classification = 'A' THEN 'high'
      WHEN abc.classification = 'B' AND p.stock_current <= 0 THEN 'high'
      WHEN p.stock_current <= 0 THEN 'medium'
      ELSE 'low'
    END
  ))
  INTO v_suggestions
  FROM public.products p
  LEFT JOIN public.abc_classifications abc ON abc.product_id = p.id
    AND abc.store_id = p.store_id
    AND abc.period_year = EXTRACT(YEAR FROM now())::int
    AND abc.period_month = EXTRACT(MONTH FROM now())::int
  WHERE p.store_id = p_store_id
    AND p.is_active = true
    AND p.stock_current <= CASE
      WHEN abc.classification = 'A' THEN 10
      WHEN abc.classification = 'B' THEN 5
      ELSE 0
    END
  ORDER BY
    CASE abc.classification WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END,
    p.stock_current ASC;

  RETURN jsonb_build_object('status', 'success', 'suggestions', COALESCE(v_suggestions, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reorder_suggestions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reorder_suggestions TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. CONCILIACIÓN BANCARIA: matching automático
--    Match por monto + fecha (±3 días) entre bank_statement_items y transactions
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_match_bank_items(
  p_statement_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_store_id uuid;
  v_item RECORD;
  v_matched_count integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  -- Get store_id from statement
  SELECT store_id INTO v_store_id FROM public.bank_statements WHERE id = p_statement_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STATEMENT_NOT_FOUND';
  END IF;

  IF NOT public.has_store_access_as(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Match items: for each unmatched bank_item, find a transaction with same amount (±1) and date (±3 days)
  FOR v_item IN
    SELECT id, amount, type, transaction_date
    FROM public.bank_statement_items
    WHERE bank_statement_id = p_statement_id AND is_matched = false
  LOOP
    IF v_item.type = 'credit' THEN
      -- Match with cash/transfer sales
      UPDATE public.bank_statement_items bsi
      SET matched_transaction_id = t.id, is_matched = true, is_reconciled = true
      FROM public.transactions t
      WHERE bsi.id = v_item.id
        AND t.store_id = v_store_id
        AND t.status = 'completed'
        AND ABS(t.total_amount - v_item.amount) < 1
        AND ABS(t.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transaction_id = t.id AND other.id != bsi.id
        );
    ELSE
      -- Match with receipts (purchases)
      UPDATE public.bank_statement_items bsi
      SET matched_transfer_id = r.id, is_matched = true, is_reconciled = true
      FROM public.receipts r
      WHERE bsi.id = v_item.id
        AND r.store_id = v_store_id
        AND r.status = 'active'
        AND ABS(r.total_cost - v_item.amount) < 1
        AND ABS(r.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transfer_id = r.id AND other.id != bsi.id
        );
    END IF;

    IF FOUND THEN
      v_matched_count := v_matched_count + 1;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
    END IF;
  END LOOP;

  -- Update statement status
  IF v_unmatched_count = 0 THEN
    UPDATE public.bank_statements SET status = 'reconciled', reconciled_by = v_uid, reconciled_at = now(), updated_at = now()
    WHERE id = p_statement_id;
  ELSE
    UPDATE public.bank_statements SET status = 'discrepancy', updated_at = now()
    WHERE id = p_statement_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'matched', v_matched_count,
    'unmatched', v_unmatched_count,
    'statement_status', CASE WHEN v_unmatched_count = 0 THEN 'reconciled' ELSE 'discrepancy' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_match_bank_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_match_bank_items TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. ÍNDICES ADICIONALES PARA PERFORMANCE
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bank_items_unmatched ON public.bank_statement_items(bank_statement_id) WHERE is_matched = false;
CREATE INDEX IF NOT EXISTS idx_transactions_store_amount_date ON public.transactions(store_id, total_amount, created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_store_cost_date ON public.receipts(store_id, total_cost, created_at);
CREATE INDEX IF NOT EXISTS idx_products_store_active_stock ON public.products(store_id, is_active, stock_current);
CREATE INDEX IF NOT EXISTS idx_lots_store_active_exp ON public.product_lots(store_id, status, expiration_date) WHERE status = 'active';
