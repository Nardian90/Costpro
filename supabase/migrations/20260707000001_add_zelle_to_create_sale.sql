-- ============================================================================
-- POS: Agregar Zelle como método de pago
-- ============================================================================
-- Esta migración:
-- 1. Agrega columna zelle_amount a la tabla transactions
-- 2. Recrea el RPC create_sale para aceptar p_zelle_amount
-- 3. Actualiza la validación de pago mixto: cash + transfer + zelle = total
-- ============================================================================

-- 1. Agregar columna zelle_amount a transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS zelle_amount numeric DEFAULT 0;

-- 2. Recrear create_sale con p_zelle_amount
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
  p_zelle_amount numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
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
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    IF NOT (v_currencies @> ARRAY[v_item_currency]) THEN
      v_currencies := array_append(v_currencies, v_item_currency);
    END IF;
  END LOOP;
  v_is_mixed := array_length(v_currencies, 1) > 1;

  -- FIX-BUG-5 (2026-07-06): relajar validación cuando hay multi-moneda (v_is_mixed)
  -- En ese caso, los montos cash/transfer/zelle están en distintas monedas y no
  -- pueden sumarse directamente con p_total_amount (que está en CUP).
  -- La validación de coherencia se delega al cliente.
  IF p_payment_method = 'mixed' AND NOT v_is_mixed AND (p_cash_amount + p_transfer_amount + p_zelle_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    cash_amount, transfer_amount, zelle_amount, idempotency_key, created_at, completed_at,
    sale_currency, sale_exchange_rate
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed', p_payment_method,
    p_discount_type, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
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

    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      IF v_conversion_factor IS NULL THEN v_conversion_factor := 1; END IF;
    ELSE
      v_conversion_factor := 1;
    END IF;

    v_units_to_deduct := v_qty * v_conversion_factor;

    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_units_to_deduct THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_pid;
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: %', COALESCE(v_product_name, v_pid::text);
    END IF;

    UPDATE public.products SET stock_current = stock_current - v_units_to_deduct WHERE id = v_pid;

    v_price_cup := CASE WHEN v_item_currency = 'CUP' THEN v_price * v_qty ELSE v_price * v_qty * v_item_rate END;
    v_cost_cup := CASE WHEN v_item_currency = 'CUP' THEN v_cost * v_qty ELSE v_cost * v_qty * v_item_rate END;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price, cost,
      subtotal, currency, exchange_rate, price_cup, cost_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost,
      v_price * v_qty, v_item_currency, v_item_rate, v_price_cup, v_cost_cup
    );
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_tx_id);
END;
$func$;

COMMENT ON COLUMN public.transactions.zelle_amount IS 'Monto pagado vía Zelle (USD u otra moneda) para esta venta';
COMMENT ON FUNCTION public.create_sale IS 'RPC para crear venta — soporta efectivo, transferencia y Zelle (p_zelle_amount)';
