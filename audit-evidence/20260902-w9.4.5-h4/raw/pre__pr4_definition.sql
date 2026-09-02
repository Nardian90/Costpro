CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(
  p_receipt_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_stock numeric;
  v_new_wac numeric;
  v_old_total_value numeric;
  v_new_total_value numeric;
  v_old_qty numeric;
  v_new_qty numeric;
  v_unit_cost_cup numeric;
  v_reversed_payments integer;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND';
  END IF;

  -- PR-2 C5: idempotencia
  IF v_receipt.status = 'voided' THEN
    RETURN jsonb_build_object(
      'status', 'idempotent',
      'receipt_id', p_receipt_id,
      'message', 'receipt already voided — no changes applied'
    );
  END IF;

  IF v_receipt.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only active receipts can be reversed (status=%)',
      v_receipt.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    v_stock := COALESCE(v_stock, 0);

    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %',
        v_item.product_id, v_stock, v_item.quantity;
    END IF;

    v_unit_cost_cup := v_item.unit_cost * v_item.tasa_cambio_recepcion;

    -- register_stock_movement genera el stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_receipt.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_item.quantity,
      p_movement_type := 'purchase_reverse'::text,
      p_sale_id := p_receipt_id,
      p_unit_cost := v_unit_cost_cup,
      p_reason := ('Reverso de recepción: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement ahora genera la kardex entry
    -- con movement_type='purchase_reverse' (gracias al CASE map actualizado)

    -- WAC recalc usando v_unit_cost_cup
    SELECT stock_current, cost_average INTO v_old_qty, v_new_wac FROM public.products WHERE id = v_item.product_id;
    v_old_total_value := (v_old_qty + v_item.quantity) * COALESCE(v_new_wac, 0);
    v_new_total_value := v_old_total_value - (v_item.quantity * v_unit_cost_cup);
    v_new_qty := v_old_qty;

    IF v_new_qty > 0 THEN
      v_new_wac := v_new_total_value / v_new_qty;
      UPDATE public.products SET cost_average = v_new_wac WHERE id = v_item.product_id;
    ELSE
      NULL;
    END IF;
  END LOOP;

  UPDATE public.receipts
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = NOW()
  WHERE id = p_receipt_id;

  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by reverse_receipt_v2 ' || p_receipt_id::text || ' at ' || NOW()::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;

  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_RECEIPT_V2', 'receipts', p_receipt_id, v_receipt.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'v2_reverse', true, 'payments_reversed', v_reversed_payments));

  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_id', p_receipt_id,
    'payments_reversed', v_reversed_payments
  );
END;
$function$;
