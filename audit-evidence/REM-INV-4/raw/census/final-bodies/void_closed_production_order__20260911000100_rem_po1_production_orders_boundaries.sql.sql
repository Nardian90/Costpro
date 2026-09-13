-- DECLARED FINAL STATE (Git) de void_closed_production_order
-- fuente: 20260911000100_rem_po1_production_orders_boundaries.sql stmt#2

CREATE OR REPLACE FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text DEFAULT 'Anulación'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'closed' THEN RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_VOID'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_void',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','void_closed_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Void orden cerrada: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='voided', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_VOIDED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $function$
