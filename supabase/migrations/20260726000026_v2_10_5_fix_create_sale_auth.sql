-- V2.10.5 — FIX CRÍTICO: create_sale falla con service_role
--
-- BUG ENCONTRADO EN PRUEBAS LIVE:
-- create_sale usa has_store_access(p_store_id) que usa auth.uid().
-- Con service_role, auth.uid() es NULL → siempre falla "Unauthorized".
-- Esto significa que el endpoint /api/sales (que usa service_role) no puede
-- crear ventas. El POS está roto cuando se llama desde la API route.
--
-- FIX: añadir p_user_id opcional + bypass cuando v_caller_uid IS NULL.
-- Cuando v_caller_uid NO es NULL, usar has_store_access_as(v_caller_uid, p_store_id).

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_existing uuid;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  -- FIX F2-02: Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  -- V2.10.5: autorización con bypass para service_role
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- FIX F2-05: Validar cash+transfer=total
  IF p_payment_method = 'mixed' AND (p_cash_amount + p_transfer_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    completed_at, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed', p_payment_method,
    p_discount_type, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    v_eff, p_idempotency_key, v_eff
  );

  -- Insertar items + descontar stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price_at_sale')::numeric;

    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Product % not found', v_pid;
    END IF;

    UPDATE public.products SET stock_current = stock_current - v_qty, updated_at = v_eff
      WHERE id = v_pid;

    INSERT INTO public.transaction_items (transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_tx_id, v_pid, NULL, v_qty, v_price, (v_item->>'cost_at_sale')::numeric, v_eff);
  END LOOP;

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamp with time zone, numeric, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamp with time zone, numeric, numeric, text, uuid) TO service_role;

-- Eliminar versión vieja sin p_user_id
DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamp with time zone, numeric, numeric, text) CASCADE;

NOTIFY pgrst, 'reload schema';
