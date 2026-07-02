-- ============================================================================
-- Migration: 20260702000004_create_sale_multi_currency.sql
-- Actualizar create_sale para aceptar moneda de venta + conversión a CUP
--
-- La versión actual de create_sale tiene: p_cash_amount, p_transfer_amount,
-- p_idempotency_key, p_operation_date. Esta migración añade:
--   p_sale_currency TEXT DEFAULT 'CUP'
--   p_sale_exchange_rate NUMERIC DEFAULT 1.0
-- ============================================================================

-- DROP la versión actual con su firma exacta
DROP FUNCTION IF EXISTS public.create_sale(
  uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb,
  uuid, timestamp with time zone, numeric, numeric, text
);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  -- FIX-MULTI-MONEDA: nuevos parámetros
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
  v_eff_rate numeric := COALESCE(NULLIF(p_sale_exchange_rate, 0), 1.0);
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Validar cash+transfer=total
  IF p_payment_method = 'mixed' AND (p_cash_amount + p_transfer_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  -- FIX-MULTI-MONEDA: guardar sale_currency y sale_exchange_rate en la transacción
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    cash_amount, transfer_amount, idempotency_key, created_at, completed_at,
    sale_currency, sale_exchange_rate
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed', p_payment_method,
    p_discount_type, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_cash_amount, p_transfer_amount, p_idempotency_key, v_eff, v_eff,
    p_sale_currency, v_eff_rate
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);
    -- FIX-MULTI-MONEDA: convertir precio a CUP
    v_price_cup := v_price * v_eff_rate;

    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid AND store_id = p_store_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_qty THEN RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK'; END IF;

    -- FIX-MULTI-MONEDA: guardar price_currency y price_at_sale_cup
    INSERT INTO public.transaction_items (
      transaction_id, product_id, quantity, unit_price, subtotal,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_qty, v_price, v_qty * v_price,
      p_sale_currency, v_price_cup
    );

    PERFORM public.register_stock_movement(v_pid, p_store_id, -v_qty, 'sale', v_tx_id::text, p_seller_id, NULL, v_tx_id, NULL, NULL, v_eff);
  END LOOP;

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$func$;

COMMENT ON FUNCTION public.create_sale IS
  'Crea una venta con items. Acepta sale_currency (default CUP) y sale_exchange_rate.
  Guarda price_at_sale en moneda original y price_at_sale_cup (convertido) para
  cálculos de margen siempre en CUP. FIX-MULTI-MONEDA.';

NOTIFY pgrst, 'reload schema';
