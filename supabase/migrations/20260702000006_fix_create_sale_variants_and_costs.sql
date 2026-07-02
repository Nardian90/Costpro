-- ============================================================================
-- Migration: 20260702000006_fix_create_sale_variants_and_costs.sql
-- Fix G1 + G3: restaurar lógica de variantes + guardar cost_at_sale
--
-- G1: create_sale no aplicaba conversion_factor al descontar stock.
--     Vender 1 docena descuentaba 1 unidad en vez de 12. REGRESIÓN CRÍTICA.
-- G3: create_sale no guardaba cost_at_sale ni cost_at_sale_cup.
--     Imposible calcular margen histórico por item.
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
  v_cost numeric; v_price_cup numeric; v_cost_cup numeric;
  v_item_currency text; v_item_rate numeric;
  v_currencies text[] := ARRAY[]::text[];
  v_is_mixed boolean := false;
  -- FIX-G1: variables para variantes
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units_to_deduct integer;
  v_product_name text;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Detectar múltiples monedas
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

  -- Crear transacción
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

  -- Procesar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);

    -- FIX-G1: leer variant_id y conversion_factor
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    -- FIX-G1: calcular unidades reales a descontar
    v_units_to_deduct := v_qty * v_conversion_factor;

    -- FIX-G1: validar stock con unidades convertidas
    SELECT stock_current, name INTO v_stock, v_product_name FROM public.products WHERE id = v_pid AND store_id = p_store_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_units_to_deduct THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: % (Disponible: %, Requerido: %)',
        COALESCE(v_product_name, 'Producto'), v_stock, v_units_to_deduct;
    END IF;

    -- Multi-moneda: convertir precio y costo a CUP
    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, 1.0);
    v_price_cup := v_price * v_item_rate;
    v_cost_cup := v_cost * v_item_rate;

    -- FIX-G3: guardar cost_at_sale, cost_at_sale_cup, variant_id
    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost,
      v_item_currency, v_price_cup
    );

    -- FIX-G1: descontar stock con unidades convertidas
    PERFORM public.register_stock_movement(
      v_pid, p_store_id, -v_units_to_deduct, 'sale',
      v_tx_id::text, p_seller_id, v_variant_id, v_tx_id, v_cost, NULL, v_eff
    );
  END LOOP;

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$func$;

COMMENT ON FUNCTION public.create_sale IS
  'Crea una venta con items. FIX-G1: descuenta stock con conversion_factor de variantes.
  FIX-G3: guarda cost_at_sale en transaction_items. Multi-moneda: cada item tiene
  currency y exchange_rate, calcula price_at_sale_cup para margen en CUP.';

NOTIFY pgrst, 'reload schema';
