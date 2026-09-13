-- DECLARED FINAL STATE (Git) de create_devolution
-- fuente: 20260727000006_v2_12_9_spoofing_p_user_id.sql stmt#11

CREATE OR REPLACE FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_devolution_id UUID; v_dev_number TEXT; v_item JSONB; v_total NUMERIC := 0;
    v_pid UUID; v_qty NUMERIC; v_price NUMERIC; v_item_total NUMERIC;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_dev_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::NUMERIC; v_price := (v_item->>'unit_price')::NUMERIC;
        v_total := v_total + (v_qty * v_price);
    END LOOP;
    INSERT INTO public.devolutions (store_id, original_transaction_id, devolution_number, reason, total_amount, currency, payment_method, status, customer_id, customer_name, notes, processed_by)
    VALUES (p_store_id, p_original_transaction_id, v_dev_number, p_reason, v_total, 'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes, v_uid)
    RETURNING id INTO v_devolution_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID; v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC; v_item_total := v_qty * v_price;
        INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
        VALUES (v_devolution_id, v_pid, v_qty, v_price, v_item_total, v_item->>'reason');
        UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_pid;
        INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
        SELECT p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_item_total, stock_current, cost_average, stock_current * cost_average, 'devolution', v_devolution_id, 'Devolucion ' || v_dev_number, v_uid
        FROM public.products WHERE id = v_pid;
    END LOOP;
    RETURN jsonb_build_object('status', 'success', 'devolution_id', v_devolution_id, 'devolution_number', v_dev_number, 'total', v_total);
END;
$function$
