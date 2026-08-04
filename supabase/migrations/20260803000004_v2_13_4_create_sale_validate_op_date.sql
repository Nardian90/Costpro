-- ============================================================================
-- Migration: 20260803000004_v2_13_4_create_sale_validate_op_date.sql
-- Iteración 11.1 — Fix H-2
-- ============================================================================
-- PROBLEMA: create_sale no llamaba validate_operation_date, permitiendo
-- backdating de ventas (p_operation_date con fecha anterior a la última
-- venta registrada). La función validate_operation_date existe
-- (20260623000004_fix_race_condition_advisory_lock.sql) con pg_advisory_xact_lock
-- y validación forward-only, pero create_sale no la invocaba.
--
-- SOLUCIÓN: Reescribir create_sale para llamar validate_operation_date
-- cuando p_operation_date IS NOT NULL. Esto valida forward-only locking
-- y previene backdating.
--
-- NOTA: Esta migration reescribe create_sale. La versión base es la de
-- 20260803000002 (C-7). Los cambios de C-7 (conversion_factor, variant_id)
-- se preservan. Solo se añade la llamada a validate_operation_date.
--
-- UP:
--   DROP + CREATE create_sale con validate_operation_date.
--
-- DOWN:
--   Restaurar create_sale de 20260803000002 (sin validate_operation_date).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

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
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- FIX H-2 (Iteración 11.1): Validar operation_date (forward-only locking).
  -- validate_operation_date usa pg_advisory_xact_lock(hashtext(store_id))
  -- para serializar la validación por tienda. Si p_operation_date es anterior
  -- al MAX(created_at) de la tienda, lanza ERR_BACKDATED_DOCUMENT.
  -- Solo validar si p_operation_date fue proporcionado explícitamente.
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
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
  'Iteración 11.1 (H-2): Valida operation_date via validate_operation_date (forward-only locking). Conserva C-7 (conversion_factor + variant_id).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar create_sale de 20260803000002 (C-7 sin validate_operation_date).
-- DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, numeric, jsonb, ...);
-- -- [pegar body de 20260803000002_v2_13_2 sin el bloque validate_operation_date]
-- ============================================================================
