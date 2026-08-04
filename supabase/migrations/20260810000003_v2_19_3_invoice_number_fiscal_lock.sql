-- ============================================================================
-- Migration: 20260810000003_v2_19_3_invoice_number_fiscal_lock.sql
-- Iteración Fiscal — Fix F-C1 (invoice_number) + F-C3 (bloqueo fiscal)
-- ============================================================================
-- 1. ALTER TABLE transactions ADD COLUMN invoice_number
-- 2. Extender create_sale_v2 para asignar invoice_number
-- 3. Extender validate_operation_date para bloquear ventas en períodos cerrados
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Añadir invoice_number a transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS invoice_number text;
CREATE INDEX IF NOT EXISTS transactions_invoice_number_idx ON public.transactions (invoice_number) WHERE invoice_number IS NOT NULL;

-- 2. Extender validate_operation_date para checkear fiscal_closings
DROP FUNCTION IF EXISTS public.validate_operation_date(timestamp with time zone, uuid);

CREATE OR REPLACE FUNCTION public.validate_operation_date(
  p_new_date timestamp with time zone,
  p_store_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_max_date timestamptz;
BEGIN
  -- Bloquear el store para serializar validación (existente)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- Validar forward-only (existente)
  SELECT MAX(created_at) INTO v_max_date FROM public.transactions WHERE store_id = p_store_id;
  IF v_max_date IS NOT NULL AND p_new_date < v_max_date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: date % is before max %', p_new_date, v_max_date;
  END IF;

  -- Iteración Fiscal (F-C3): Bloquear ventas en períodos fiscales cerrados/locked
  IF EXISTS (
    SELECT 1 FROM public.fiscal_closings
    WHERE store_id = p_store_id
      AND status IN ('closed', 'locked')
      AND p_new_date >= make_date(period_year, period_month, 1)
      AND p_new_date < make_date(period_year, period_month, 1) + interval '1 month'
  ) THEN
    RAISE EXCEPTION 'ERR_FISCAL_PERIOD_CLOSED: date % is within a closed/locked fiscal period', p_new_date;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_operation_date FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_operation_date TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_operation_date TO service_role;

COMMENT ON FUNCTION public.validate_operation_date IS
  'Iteración 11.1 + Fiscal: Forward-only locking + fiscal period closure check (F-C3).';

-- 3. Extender create_sale_v2 para asignar invoice_number
-- Necesitamos reescribir create_sale_v2 con el añadido de invoice_number
-- Para mantener el cambio mínimo, solo añadimos la generación al INSERT de transactions
DROP FUNCTION IF EXISTS public.create_sale_v2;

CREATE OR REPLACE FUNCTION public.create_sale_v2(
  p_store_id uuid,
  p_seller_id uuid,
  p_items jsonb,
  p_payment_method text DEFAULT 'cash',
  p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0,
  p_applied_taxes jsonb DEFAULT '[]'::jsonb,
  p_tax_amount numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_subtotal numeric DEFAULT 0,
  p_cash_amount numeric DEFAULT 0,
  p_transfer_amount numeric DEFAULT 0,
  p_zelle_amount numeric DEFAULT 0,
  p_sale_currency text DEFAULT 'CUP',
  p_sale_exchange_rate numeric DEFAULT 1,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_supervisor_user_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tx_id uuid := gen_random_uuid();
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units numeric;
  v_stock numeric;
  v_existing uuid;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
  v_calculated_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_taxable_base numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_total numeric := 0;
  v_tax jsonb;
  v_tax_value numeric;
  v_effective_discount_pct numeric := 0;
  v_cash_amt numeric := p_cash_amount;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  v_invoice_number text;
  v_tax_config_exists boolean := false;
  v_tax_cfg RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_operation_date IS NOT NULL THEN PERFORM public.validate_operation_date(p_operation_date, p_store_id); END IF;

  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN v_effective_method := 'mixed'; END IF;

  -- Primera pasada: SELECT FOR UPDATE + recalcular subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    SELECT quantity INTO v_stock FROM public.inventory WHERE product_id = v_pid AND store_id = p_store_id FOR UPDATE;
    IF v_stock IS NULL THEN
      SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);
    IF v_stock < v_units THEN RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units; END IF;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN v_price := NULLIF(v_item->>'price', '')::numeric; END IF;
    IF v_price IS NULL THEN SELECT price INTO v_product_price FROM public.products WHERE id = v_pid; v_price := COALESCE(v_product_price, 0); END IF;
    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);
    v_calculated_subtotal := v_calculated_subtotal + (v_price * v_qty);
  END LOOP;

  -- Recalcular descuento
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- Recalcular tax
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;

  -- Iteración Fiscal (F-H5): Si tax_configurations tiene rows, usarlas
  SELECT EXISTS(SELECT 1 FROM public.tax_configurations WHERE store_id = p_store_id AND is_active = true) INTO v_tax_config_exists;

  IF v_tax_config_exists THEN
    FOR v_tax_cfg IN SELECT * FROM public.tax_configurations WHERE store_id = p_store_id AND is_active = true LOOP
      IF v_tax_cfg.type = 'percentage' THEN
        v_tax_value := GREATEST(0, v_taxable_base - COALESCE(v_tax_cfg.min_exempt, 0)) * v_tax_cfg.value / 100;
      ELSE
        v_tax_value := v_tax_cfg.value;
      END IF;
      v_calculated_tax := v_calculated_tax + v_tax_value;
    END LOOP;
  ELSE
    -- Fallback: usar p_applied_taxes del cliente (comportamiento existente)
    FOR v_tax IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
      IF v_tax->>'type' = 'percentage' THEN
        v_tax_value := (v_taxable_base * COALESCE((v_tax->>'value')::numeric, 0)) / 100;
        IF v_tax ? 'min_exempt' THEN
          v_tax_value := GREATEST(0, v_taxable_base - COALESCE((v_tax->>'min_exempt')::numeric, 0)) * COALESCE((v_tax->>'value')::numeric, 0) / 100;
        END IF;
      ELSE
        v_tax_value := COALESCE((v_tax->>'value')::numeric, 0);
      END IF;
      v_calculated_tax := v_calculated_tax + v_tax_value;
    END LOOP;
  END IF;

  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  IF v_calculated_subtotal > 0 THEN v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100; END IF;

  IF v_effective_discount_pct >= 15 THEN
    IF p_supervisor_user_id IS NULL THEN RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: discount_pct=%', v_effective_discount_pct; END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED'; END IF;
  END IF;

  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH'; END IF;
  ELSIF v_effective_method = 'cash' THEN v_cash_amt := v_calculated_total;
  ELSIF v_effective_method = 'transfer' THEN v_transfer_amt := v_calculated_total;
  ELSIF v_effective_method = 'zelle' THEN v_zelle_amt := v_calculated_total;
  END IF;

  -- Iteración Fiscal (F-C1): Generar invoice_number
  v_invoice_number := public.next_document_number(p_store_id, 'invoice', v_uid);

  -- INSERT transactions (con invoice_number)
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name, invoice_number
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name, v_invoice_number
  );

  -- Segunda pasada: stock movement + transaction_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;
    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN v_price := NULLIF(v_item->>'price', '')::numeric; END IF;
    IF v_price IS NULL THEN SELECT price INTO v_product_price FROM public.products WHERE id = v_pid; v_price := COALESCE(v_product_price, 0); END IF;
    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
      p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
      p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
      p_operation_date := v_eff, p_skip_access_check := TRUE
    );

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
      cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
      cash_currency, transfer_currency, zelle_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      zelle_discount_type, zelle_discount_value, zelle_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency', v_item->>'transfer_currency', v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum, v_discount_amount,
      p_sale_currency, v_price * p_sale_exchange_rate
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object('total_amount', v_calculated_total, 'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount, 'discount_pct', v_effective_discount_pct,
      'tax_amount', v_calculated_tax, 'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id, 'supervisor_id', p_supervisor_user_id,
      'item_count', jsonb_array_length(p_items), 'v2_checkout', true,
      'invoice_number', v_invoice_number));

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id,
    'calculated_total',v_calculated_total,'calculated_subtotal',v_calculated_subtotal,
    'calculated_tax',v_calculated_tax,'discount_amount',v_discount_amount,
    'invoice_number',v_invoice_number);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_sale_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_v2 TO service_role;

COMMENT ON FUNCTION public.create_sale_v2 IS
  'Iteración 11.2 + Fiscal: Server-side checkout with invoice_number (F-C1), tax_configurations enforcement (F-H5), fiscal period lock (F-C3).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.create_sale_v2;
-- -- Restaurar versión de 11.2 sin invoice_number ni tax_config enforcement
-- DROP FUNCTION IF EXISTS public.validate_operation_date;
-- -- Restaurar versión de 11.1 sin check fiscal_closings
-- ALTER TABLE public.transactions DROP COLUMN IF EXISTS invoice_number;
-- ============================================================================
