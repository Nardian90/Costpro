-- DECLARED FINAL STATE (Git) de fn_process_receipt
-- fuente: 20260326_multi_tenant_hardening.sql stmt#13

CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty int;
    v_cost numeric;
    v_current_stock int;
    v_current_avg_cost numeric;
    v_new_stock int;
    v_new_avg_cost numeric;
    v_total_receipt numeric := 0;
    v_new_details jsonb;
    v_sku text;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch';
    END IF;

    INSERT INTO public.receipts (user_id, status, reference_doc)
    VALUES (p_user_id, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::int;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';

        IF v_sku IS NULL OR v_sku = '' THEN
            RAISE EXCEPTION 'SKU es obligatorio';
        END IF;

        IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser positiva'; END IF;

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku;
            IF v_prod_id IS NULL THEN
                INSERT INTO public.products (name, sku, cost_price, price, stock_current, cost_average)
                VALUES (v_new_details->>'name', v_sku, v_cost, (v_new_details->>'price')::numeric, 0, 0)
                RETURNING id INTO v_prod_id;
            END IF;
        ELSE
             v_prod_id := (v_item->>'product_id')::uuid;
             IF v_prod_id IS NULL THEN SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku; END IF;
             IF v_prod_id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado: %', v_sku; END IF;
        END IF;

        SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_prod_id FOR UPDATE;
        v_new_stock := COALESCE(v_current_stock, 0) + v_qty;
        v_new_avg_cost := CASE WHEN v_new_stock > 0 THEN ((COALESCE(v_current_stock,0) * COALESCE(v_current_avg_cost,0)) + (v_qty * v_cost)) / v_new_stock ELSE v_cost END;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost) VALUES (v_receipt_id, v_prod_id, v_qty, v_cost);
        UPDATE public.products SET stock_current = v_new_stock, cost_average = v_new_avg_cost, cost_price = v_cost WHERE id = v_prod_id;
        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_prod_id, 'IN_RECEIPT', v_qty, v_receipt_id, p_user_id, v_new_stock);
        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;
    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END;
$function$
