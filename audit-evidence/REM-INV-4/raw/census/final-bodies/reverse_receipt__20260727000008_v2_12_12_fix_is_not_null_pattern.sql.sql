-- DECLARED FINAL STATE (Git) de reverse_receipt
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#18

CREATE OR REPLACE FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_receipt.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_receipt.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_receipt_id, 'Reversión de recepción', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.receipts
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_receipt_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'receipt_id', p_receipt_id);
END;
$function$
