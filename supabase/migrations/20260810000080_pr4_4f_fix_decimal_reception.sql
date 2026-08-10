-- PR-4.4F — Fix confirm_pending_reception: v_units_to_add integer → numeric
-- BUG: v_units_to_add was declared as integer, truncating decimal quantities.
-- Ej: 89.50 → 90 (rounding) instead of preserving 89.50.
-- Esto causaba diferencias de stock en productos con cantidades decimales.

CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_store_id uuid;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_unit_cost_cup numeric;
  v_units_to_add numeric;  -- PR-4.4F: changed from integer to numeric to preserve decimals
  v_current_stock numeric;
  v_current_avg numeric;
  v_new_stock numeric;
  v_new_avg numeric;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'pending' THEN RAISE EXCEPTION 'ERR_RECEIPT_ALREADY_CONFIRMED: status=%', v_receipt.status; END IF;

  v_store_id := v_receipt.store_id;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
    v_units_to_add := v_item.quantity;

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM public.products WHERE id = v_item.product_id FOR UPDATE;

    v_new_stock := COALESCE(v_current_stock, 0) + v_units_to_add;
    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_unit_cost_cup) / v_new_stock
      ELSE v_unit_cost_cup END;

    UPDATE products
    SET cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'active',
      reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id),
      updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$$;
