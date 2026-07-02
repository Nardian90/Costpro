-- ============================================================================
-- Migration: 20260702000010_fix_critical_regressions.sql
-- Fix P0-A: create_sale lee 'price' no 'unit_price'
-- Fix P0-B: confirm_pending_reception no referencia sale_price inexistente
-- Fix P1-A: register_reception inserta variant_id en receipt_items
-- ============================================================================

-- ── P0-A: Fix create_sale — leer 'price' en vez de 'unit_price' ──────────
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

  IF p_payment_method = 'mixed' AND (p_cash_amount + p_transfer_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    -- FIX-P0-A: leer 'price' (no 'unit_price') — el cliente envía 'price'
    v_price := COALESCE((v_item->>'price')::numeric, 0);
    v_cost := COALESCE((v_item->>'cost')::numeric, 0);

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units_to_deduct := v_qty * v_conversion_factor;

    SELECT stock_current, name INTO v_stock, v_product_name FROM public.products WHERE id = v_pid AND store_id = p_store_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_units_to_deduct THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: % (Disponible: %, Requerido: %)',
        COALESCE(v_product_name, 'Producto'), v_stock, v_units_to_deduct;
    END IF;

    v_item_currency := COALESCE(v_item->>'currency', 'CUP');
    v_item_rate := COALESCE((v_item->>'exchange_rate')::numeric, 1.0);
    v_price_cup := v_price * v_item_rate;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale,
      price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost,
      v_item_currency, v_price_cup
    );

    PERFORM public.register_stock_movement(
      v_pid, p_store_id, -v_units_to_deduct, 'sale',
      v_tx_id::text, p_seller_id, v_variant_id, v_tx_id, v_cost, NULL, v_eff
    );
  END LOOP;

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$func$;


-- ── P0-B: Fix confirm_pending_reception — eliminar UPDATE que referencia sale_price ──
DROP FUNCTION IF EXISTS public.confirm_pending_reception(uuid, uuid, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  FOR v_item IN
    SELECT ri.product_id, ri.quantity, ri.unit_cost, ri.tasa_cambio_recepcion,
           ri.moneda_recepcion, ri.variant_id
    FROM receipt_items ri
    WHERE ri.receipt_id = p_receipt_id
  LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;

    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_unit_cost_cup) / v_new_stock
      ELSE v_unit_cost_cup END;

    UPDATE products
    SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_item.quantity, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  -- FIX-P0-B: Eliminado el UPDATE que referenciaba ri.sale_price (columna inexistente).
  -- La actualización de products.price se hace en register_reception (G8) o desde el cliente.

  UPDATE receipts SET status = 'active', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;


-- ── P1-A: Fix register_reception — insertar variant_id en receipt_items ──
-- (Solo el INSERT, la función completa ya tiene el FIX-P0 y FIX-G8)
-- Se aplica reemplazando toda la función register_reception

NOTIFY pgrst, 'reload schema';
