-- ============================================================================
-- Migration: 20260702000005_create_sale_per_item_currency.sql
-- Actualizar create_sale para leer currency + exchange_rate de CADA ITEM
--
-- Ahora cada item del JSON p_items puede tener su propia moneda y tasa:
--   { "product_id": "...", "price": 1.00, "currency": "USD", "exchange_rate": 500 }
--   { "product_id": "...", "price": 100, "currency": "CUP", "exchange_rate": 1.0 }
--
-- La RPC calcula price_at_sale_cup = price * exchange_rate por item.
-- La transacción guarda sale_currency = 'MIXED' si hay múltiples monedas.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_sale(
  uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb,
  uuid, timestamp with time zone, numeric, numeric, text, text, numeric
);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_sale_currency text DEFAULT 'CUP',
  p_sale_exchange_rate numeric DEFAULT 1.0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_existing uuid;
  v_cost numeric; v_price_cup numeric;
  v_item_currency text; v_item_rate numeric;
  v_currencies text[] := ARRAY[]::text[];
  v_is_mixed boolean := false;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- FIX-MULTI-MONEDA: detectar si hay múltiples monedas en los items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    IF NOT (v_currencies @> ARRAY[v_item_currency]) THEN
      v_currencies := array_append(v_currencies, v_item_currency);
    END IF;
  END LOOP;
  v_is_mixed := array_length(v_currencies, 1) > 1;

  -- Validar cash+transfer=total
  IF p_payment_method = 'mixed' AND (p_cash_amount + p_transfer_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  -- Crear transacción con sale_currency (MIXED si hay múltiples, sino la del primer item)
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    cash_amount, transfer_amount, idempotency_key, created_at, completed_at,
    sale_currency, sale_exchange_rate
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed', p_payment_method,
    p_discount_type, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_cash_amount, p_transfer_amount, p_idempotency_key, v_eff, v_eff,
    CASE WHEN v_is_mixed THEN 'MIXED' ELSE COALESCE(p_sale_currency, v_currencies[1]) END,
    p_sale_exchange_rate
  );

  -- Procesar items con moneda y tasa individuales
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);

    -- FIX-MULTI-MONEDA: leer currency y exchange_rate de cada item
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, 1.0);
    v_price_cup := v_price * v_item_rate;

    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid AND store_id = p_store_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_qty THEN RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK'; END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, quantity, unit_price, subtotal,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_qty, v_price, v_qty * v_price,
      v_item_currency, v_price_cup
    );

    PERFORM public.register_stock_movement(v_pid, p_store_id, -v_qty, 'sale', v_tx_id::text, p_seller_id, NULL, v_tx_id, NULL, NULL, v_eff);
  END LOOP;

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$func$;

COMMENT ON FUNCTION public.create_sale IS
  'Crea una venta con items. Cada item puede tener su propia currency y exchange_rate.
  price_at_sale_cup = price * exchange_rate (por item). Si hay múltiples monedas,
  sale_currency = MIXED. FIX-MULTI-MONEDA per-item.';

NOTIFY pgrst, 'reload schema';
