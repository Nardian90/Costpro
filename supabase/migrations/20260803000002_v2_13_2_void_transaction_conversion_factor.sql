-- ============================================================================
-- Migration: 20260803000002_v2_13_2_void_transaction_conversion_factor.sql
-- Iteración 11.1 — Fix C-7
-- ============================================================================
-- PROBLEMA: void_transaction restauraba ti.quantity directamente (1 caja)
-- sin multiplicar por conversion_factor (12 unidades). La versión anterior
-- (20260702000008_fix_void_transaction_variants.sql) sí multiplicaba, pero
-- la reescritura en 20260727000012_v2_12_18 eliminó esa lógica.
--
-- PROBLEMA ADICIONAL (necesario para simetría): create_sale TAMBIÉN dejó de
-- multiplicar por conversion_factor. Si solo fixeamos void pero no create_sale,
-- el void restauraría 12 unidades pero la venta solo decrementó 1 → inflación
-- de stock. Por eso esta migration fixea AMBAS funciones simétricamente.
--
-- SOLUCIÓN:
--   1. void_transaction: restaurar ti.quantity * conversion_factor unidades.
--      Lookup conversion_factor via variant_id de transaction_items, fallback
--      a product_variants por product_id, fallback a 1.
--   2. create_sale: extraer variant_id del payload JSONB, buscar
--      conversion_factor, decrementar v_qty * conversion_factor unidades.
--      Además persistir variant_id en transaction_items (parcial C-6, necesario
--      para que void pueda lookup el variant correcto).
--
-- COMPATIBILIDAD:
--   - Ventas existentes (pre-fix) tienen variant_id=NULL y quantity en
--     variant-units. El void usará fallback a 1 (sin conversión) → restaura
--     lo mismo que se decrementó (simétrico para ventas legacy).
--   - Ventas nuevas (post-fix) tienen variant_id poblado y quantity en
--     variant-units. create_sale decrementa qty*conv_factor, void restaura
--     qty*conv_factor → simétrico.
--
-- UP:
--   DROP + CREATE ambas funciones.
--
-- DOWN:
--   Restaurar versiones anteriores de 20260727000012 y 20260727000015.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- ============================================================================
-- 1. void_transaction — restaurar con conversion_factor
-- ============================================================================
DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, timestamp with time zone, uuid);

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_operation_date timestamp with time zone DEFAULT now(),
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore numeric;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- FIX C-7: Restaurar stock considerando conversion_factor de variantes.
  -- Si transaction_items.variant_id está poblado, buscar conversion_factor.
  -- Si variant_id es NULL (ventas legacy), usar 1 (sin conversión) para
  -- mantener simetría con create_sale legacy.
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_void',
      p_reference_doc := p_transaction_id::text,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Void de venta',
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) IS
  'Iteración 11.1 (C-7): Anula venta restaurando stock con conversion_factor. Si variant_id está poblado, restaura qty*conv_factor unidades; si no, restaura qty (simétrico con create_sale legacy).';

-- ============================================================================
-- 2. create_sale — decrementar con conversion_factor + persistir variant_id
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamp with time zone, numeric, numeric, text, text, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid,
  p_seller_id uuid,
  p_total_amount numeric,
  p_items jsonb,
  p_subtotal numeric DEFAULT 0,
  p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0,
  p_applied_taxes jsonb DEFAULT '[]'::jsonb,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0,
  p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_sale_currency text DEFAULT 'CUP',
  p_sale_exchange_rate numeric DEFAULT 1,
  p_zelle_amount numeric DEFAULT 0,
  p_warehouse_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units_to_deduct numeric;
  v_existing uuid;
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
BEGIN
  -- Idempotencia (sin UNIQUE constraint aún — H-1 añadirá el index)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    p_cash_amount, p_transfer_amount, p_zelle_amount
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    -- FIX C-7: Buscar conversion_factor si variant_id está presente.
    -- Si variant_id es NULL, usar 1 (sin conversión) para compatibilidad.
    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_deduct := v_qty * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
      p_quantity := -v_units_to_deduct, p_movement_type := 'sale', p_reason := 'Venta POS',
      p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
      p_operation_date := v_eff, p_skip_access_check := TRUE
    );

    -- FIX C-7: Persistir variant_id (necesario para que void_transaction pueda
    -- lookup el conversion_factor correcto). Antes estaba hardcoded a NULL.
    INSERT INTO public.transaction_items (transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff);
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object('total_amount', p_total_amount, 'payment_method', v_effective_method,
      'cash_amount', p_cash_amount, 'transfer_amount', p_transfer_amount,
      'currency', p_sale_currency, 'exchange_rate', p_sale_exchange_rate,
      'item_count', jsonb_array_length(p_items)));

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_sale FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale TO service_role;

COMMENT ON FUNCTION public.create_sale IS
  'Iteración 11.1 (C-7 companion): Decrementa stock con conversion_factor y persiste variant_id en transaction_items. Necesario para simetría con void_transaction.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Para revertir esta migración, restaurar las versiones anteriores:
--
-- -- void_transaction (versión 20260727000012):
-- DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, timestamp with time zone, uuid);
-- -- [pegar body de 20260727000012_v2_12_18_fix_5_residual_is_not_null.sql líneas 142-194]
--
-- -- create_sale (versión 20260727000015):
-- DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamp with time zone, numeric, numeric, text, text, numeric, uuid, uuid);
-- -- [pegar body de 20260727000015_v2_12_23_mixed_payment_price_at_sale_fallback.sql líneas 1-75]
-- ============================================================================
