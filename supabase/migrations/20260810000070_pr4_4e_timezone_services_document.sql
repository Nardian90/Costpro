-- ============================================================================
-- PR-4.4E — Fix timezone en validate_operation_date + is_service + create_sale_v2
-- ============================================================================
-- 3 fixes para finalizar importación IPV histórica:
--
-- 1. validate_operation_date: comparar FECHAS DE NEGOCIO (date-only), no timestamps
--    absolutos. Evita que 2026-06-10T00:00:00Z falle por estar 6 horas detrás
--    de NOW() (que es 2026-06-10T06:15:00Z).
--
-- 2. products.is_service: nuevo campo boolean para distinguir servicios de
--    productos inventariables. SKU 999 (Servicio de cripiar) = servicio.
--
-- 3. create_sale_v2: skip register_stock_movement cuando product.is_service = true.
--    Los servicios NO consumen stock, NO generan stock_movement, NO generan kardex.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: validate_operation_date — comparar fechas de negocio (date-only)
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: v_min_date := NOW() - INTERVAL '2 months' (timestamp absoluto)
--        Problema: 2026-06-10T00:00:00Z < 2026-06-10T06:15:00Z → FAIL (incorrecto)
-- DESPUÉS: comparar solo la FECHA (sin hora), en timezone del negocio (America/Havana)
--          v_min_date = (NOW() AT TZ Havana)::date - 2 months
--          p_new_date Business = (p_new_date AT TZ Havana)::date

CREATE OR REPLACE FUNCTION public.validate_operation_date(
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_store_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_business DATE;
  v_min_date_business DATE;
  v_max_date_business DATE;
  v_new_date_business DATE;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- PR-4.4E: comparar fechas de NEGOCIO (date-only) en timezone America/Havana
  -- Evita edge case de timezone donde 2026-06-10T00:00:00Z fallaba por estar
  -- 6 horas detrás de NOW() (2026-06-10T06:15:00Z)
  v_today_business := (NOW() AT TIME ZONE 'America/Havana')::DATE;
  v_min_date_business := v_today_business - INTERVAL '2 months';
  v_max_date_business := v_today_business + INTERVAL '1 day';
  v_new_date_business := (p_new_date AT TIME ZONE 'America/Havana')::DATE;

  IF v_new_date_business < v_min_date_business THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior al límite histórico permitido de 2 meses (mínimo: %). No se pueden registrar operaciones con más de 2 meses de antigüedad.',
      to_char(v_new_date_business, 'DD/MM/YYYY'),
      to_char(v_min_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_new_date_business > v_max_date_business THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT: La fecha % es posterior al máximo permitido (hoy + 1 día). No se pueden registrar operaciones con fechas futuras.',
      to_char(v_new_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;

COMMENT ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE, UUID) IS
'PR-4.4E: Política lookback 2 meses usando fechas de NEGOCIO (date-only, timezone America/Havana). Evita edge case de timezone donde timestamps absolutos causaban rechazos incorrectos.';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 2: products.is_service — distinguir servicios de productos inventariables
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.is_service IS
'PR-4.4E: Si true, el producto es un servicio (no inventariable). Las ventas de servicios NO consumen stock, NO generan stock_movement, NO generan kardex_entry.';

-- Marcar SKU 999 como servicio (si existe)
UPDATE public.products SET is_service = TRUE WHERE sku = '999';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 3: create_sale_v2 — skip register_stock_movement para servicios
-- ════════════════════════════════════════════════════════════════════════════

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
  v_is_service boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_operation_date IS NOT NULL THEN PERFORM public.validate_operation_date(p_operation_date, p_store_id); END IF;

  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN v_effective_method := 'mixed'; END IF;
  IF p_cash_amount > 0 AND p_zelle_amount > 0 AND p_payment_method <> 'mixed' THEN v_effective_method := 'mixed'; END IF;
  IF p_transfer_amount > 0 AND p_zelle_amount > 0 AND p_payment_method <> 'mixed' THEN v_effective_method := 'mixed'; END IF;

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

    -- PR-4.4E: chequear si es servicio
    SELECT is_service INTO v_is_service FROM public.products WHERE id = v_pid;
    v_is_service := COALESCE(v_is_service, FALSE);

    -- PR-4.4E: solo validar stock si NO es servicio
    IF NOT v_is_service THEN
      SELECT quantity INTO v_stock FROM public.inventory WHERE product_id = v_pid AND store_id = p_store_id FOR UPDATE;
      IF v_stock IS NULL THEN
        SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
      END IF;
      v_stock := COALESCE(v_stock, 0);
      IF v_stock < v_units THEN RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units; END IF;
    END IF;

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

  v_invoice_number := public.next_document_number(p_store_id, 'invoice', v_uid);

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

    -- PR-4.4E: chequear si es servicio
    SELECT is_service INTO v_is_service FROM public.products WHERE id = v_pid;
    v_is_service := COALESCE(v_is_service, FALSE);

    -- PR-4.4E: solo generar stock_movement si NO es servicio
    IF NOT v_is_service THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
        p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
        p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;

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
