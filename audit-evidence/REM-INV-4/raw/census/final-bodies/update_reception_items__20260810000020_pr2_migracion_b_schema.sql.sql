-- DECLARED FINAL STATE (Git) de update_reception_items
-- fuente: 20260810000020_pr2_migracion_b_schema.sql stmt#6

CREATE OR REPLACE FUNCTION public.update_reception_items(
  p_receipt_id uuid,
  p_item_updates jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_status text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_deleted boolean;
  v_new_total numeric := 0;
  v_updated_count integer := 0;
  v_failed_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
  FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- PR-2 C4: alinear auth con patrón v2.12.12 (has_store_access_as + v_caller_uid)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_item_updates) LOOP
    v_item_id := (v_item->>'id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_deleted := COALESCE((v_item->>'deleted')::boolean, false);

    IF v_deleted THEN
      DELETE FROM public.receipt_items WHERE id = v_item_id AND receipt_id = p_receipt_id;
      v_updated_count := v_updated_count + 1;
    ELSE
      UPDATE public.receipt_items
      SET quantity = v_qty, unit_cost = v_cost
      WHERE id = v_item_id AND receipt_id = p_receipt_id;

      IF NOT FOUND THEN
        v_failed_count := v_failed_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- PR-2 C4: recalcular total_cost usando calculate_receipt_total_cup (con tasa)
  v_new_total := public.calculate_receipt_total_cup(p_receipt_id);

  UPDATE public.receipts SET total_cost = v_new_total, updated_at = NOW()
  WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_store_id, 'reception_items_updated', 'receipts', p_receipt_id,
    jsonb_build_object('updated', v_updated_count, 'failed', v_failed_count, 'new_total', v_new_total)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', v_updated_count,
    'failed_count', v_failed_count,
    'new_total', v_new_total
  );
END;
$func$
