-- ════════════════════════════════════════════════════════════════════════
-- V2.7 — Cerrar 2 TODOs del allowlist del test de contrato
--
-- 1. close_service_order_as_sale: añadir has_store_access_as(p_store_id)
-- 2. compensate_inventory_error: crear con has_store_access_as(p_store_id)
--    (existía en BD pero no en migraciones — la formalizamos)
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. close_service_order_as_sale — añadir autorización
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(
  p_order_id uuid,
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  INSERT INTO public.transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at,
    customer_name, customer_phone
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    p_payment_method::payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(),
    v_order.customer_name, v_order.customer_phone
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- Marcar orden como closed y vincular transaction
  UPDATE public.production_orders
    SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id
    WHERE id = p_order_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(uuid, uuid, uuid, text, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_service_order_as_sale(uuid, uuid, uuid, text, text, numeric, uuid) TO service_role;

COMMENT ON FUNCTION public.close_service_order_as_sale(uuid, uuid, uuid, text, text, numeric, uuid) IS
'V2.7: Cierra orden de servicio como venta. Autorización has_store_access_as(p_store_id).';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. compensate_inventory_error — crear con autorización
--    Compensa un error de inventario creando un movimiento inverso al original
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compensate_inventory_error(
  p_store_id uuid,
  p_original_movement_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_orig RECORD;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
  v_new_quantity numeric;
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar movimiento original
  SELECT * INTO v_orig FROM public.stock_movements
  WHERE id = p_original_movement_id AND store_id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MOVEMENT_NOT_FOUND';
  END IF;

  -- Compensación: invertir el quantity_change
  v_new_quantity := -v_orig.quantity_change;

  -- Registrar movimiento compensatorio
  PERFORM public.register_stock_movement(
    p_product_id := v_orig.product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := v_new_quantity,
    p_movement_type := 'adjustment',
    p_unit_cost := v_orig.unit_cost,
    p_reason := 'COMPENSATION: ' || COALESCE(p_reason, 'inventory error'),
    p_operation_date := NOW(),
    p_skip_access_check := (v_caller_uid IS NULL)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'original_movement_id', p_original_movement_id,
    'compensation_quantity', v_new_quantity,
    'product_id', v_orig.product_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

GRANT EXECUTE ON FUNCTION public.compensate_inventory_error(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compensate_inventory_error(uuid, uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.compensate_inventory_error(uuid, uuid, text, uuid) IS
'V2.7: Compensa un error de inventario invirtiendo el movimiento original. Autorización has_store_access_as(p_store_id).';

NOTIFY pgrst, 'reload schema';
