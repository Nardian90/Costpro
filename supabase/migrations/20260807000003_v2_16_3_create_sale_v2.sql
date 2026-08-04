-- ============================================================================
-- Migration: 20260807000003_v2_16_3_create_sale_v2.sql
-- Iteración 11.2 — Fix C-1, C-2, C-3, C-6, H-9, H-19
-- ============================================================================
-- Nuevo RPC create_sale_v2 con:
--   - pg_advisory_xact_lock por store (H-19, serialización)
--   - SELECT FOR UPDATE en inventory (C-1, pre-validación stock)
--   - Recálculo server-side de subtotal, discount, tax, total (C-2)
--   - Validación supervisor auth server-side si descuento >= 15% (C-3)
--   - Persistencia de 22 columnas en transaction_items (C-6)
--   - customer_id atómico en INSERT (H-9)
--   - Validación payment split (cash + transfer + zelle == total)
--   - Audit log completo
--
-- NO modifica create_sale viejo. Es un RPC paralelo.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

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
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions
      WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
    END IF;
  END IF;

  -- 3. Auth
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 4. Operation date validation (forward-only)
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. Auto-promote to mixed
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;

  -- 6. Primera pasada: SELECT FOR UPDATE + recalcular subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    -- Conversion factor
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    -- SELECT FOR UPDATE en inventory (lock por product+store)
    SELECT quantity INTO v_stock
      FROM public.inventory
      WHERE product_id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    -- Si no hay row en inventory, usar products.stock_current
    IF v_stock IS NULL THEN
      SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);

    -- Pre-validar stock
    IF v_stock < v_units THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units;
    END IF;

    -- Precio: usar el del item, o fallback al del producto
    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    -- Acumular subtotal
    v_calculated_subtotal := v_calculated_subtotal + (v_price * v_qty);
  END LOOP;

  -- 7. Recalcular descuento
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 8. Recalcular tax
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  FOR v_tax IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax->>'type' = 'percentage' THEN
      v_tax_value := (v_taxable_base * COALESCE((v_tax->>'value')::numeric, 0)) / 100;
      -- Aplicar exención mínima si existe
      IF v_tax ? 'min_exempt' THEN
        v_tax_value := GREATEST(0, v_taxable_base - COALESCE((v_tax->>'min_exempt')::numeric, 0)) * COALESCE((v_tax->>'value')::numeric, 0) / 100;
      END IF;
    ELSE
      v_tax_value := COALESCE((v_tax->>'value')::numeric, 0);
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 9. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 10. Validar total vs cliente (tolerancia 0.01 CUP)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 11. Validar supervisor auth (si descuento >= 15%)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;

  IF v_effective_discount_pct >= 15 THEN
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: discount_pct=%', v_effective_discount_pct;
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
  END IF;

  -- 12. Validar/setear payment split
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 0.01 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
        v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'cash' THEN
    v_cash_amt := v_calculated_total;
  ELSIF v_effective_method = 'transfer' THEN
    v_transfer_amt := v_calculated_total;
  ELSIF v_effective_method = 'zelle' THEN
    v_zelle_amt := v_calculated_total;
  END IF;

  -- 13. INSERT transactions (con customer_id atómico)
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name
  );

  -- 14. Segunda pasada: stock movement + INSERT transaction_items (22 columnas)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;
    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    -- Stock movement
    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
      p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
      p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
      p_operation_date := v_eff, p_skip_access_check := TRUE
    );

    -- INSERT transaction_items con TODOS los campos (22 columnas)
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
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum,
      v_discount_amount,
      p_sale_currency,
      v_price * p_sale_exchange_rate
    );
  END LOOP;

  -- 15. Audit log completo
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object(
      'total_amount', v_calculated_total,
      'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount,
      'discount_pct', v_effective_discount_pct,
      'tax_amount', v_calculated_tax,
      'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id,
      'supervisor_id', p_supervisor_user_id,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_sale_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_v2 TO service_role;

COMMENT ON FUNCTION public.create_sale_v2 IS
  'Iteración 11.2: Server-side checkout with advisory lock, SELECT FOR UPDATE, recalculation, supervisor auth, full item persistence, atomic customer_id. Does NOT replace create_sale (feature flag controls which is used).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.create_sale_v2;
-- ============================================================================
