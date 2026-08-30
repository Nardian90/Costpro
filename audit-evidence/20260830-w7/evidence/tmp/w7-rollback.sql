-- ============================================================================
-- w7-rollback.sql — ROLLBACK REAL W7 FASE 16 (generado desde snapshot v6)
-- Funciones baseline restauradas: 24 bloques
-- Triggers baseline: 18 | Constraints: 1 | ACL lines: 264
-- Origen: production-schema-snapshot-20260828.sql (SHA 351efa11…f3af)
-- ============================================================================
BEGIN;

-- R1. Guard y motor W6.2 fuera
DROP TRIGGER IF EXISTS trg_guard_wac_writer ON public.products;
DROP FUNCTION IF EXISTS public.fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb);
DROP FUNCTION IF EXISTS public.withdraw_production_item_v3(uuid,numeric,uuid,uuid,text,uuid,text);
DROP FUNCTION IF EXISTS public.w62_df04_classify(timestamp with time zone,numeric,numeric,boolean);

-- R2. Renombres legacy de vuelta
ALTER FUNCTION public.withdraw_production_item_deprecated_6arg(uuid,numeric,numeric,uuid,uuid,text) RENAME TO withdraw_production_item;
ALTER FUNCTION public.withdraw_production_item_deprecated_9arg(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) RENAME TO withdraw_production_item;
ALTER FUNCTION public.receive_production_output_deprecated_4arg(uuid,uuid,numeric,uuid) RENAME TO receive_production_output;

-- R3. payment_transactions a baseline
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_devolution_ref_check;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_direction_check;
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check;
ALTER TABLE public.payment_transactions DROP COLUMN IF EXISTS direction;

-- R4. Tablas auxiliares W6.2 fuera
DROP TABLE IF EXISTS public.w62_df04_synthetic_rows CASCADE;
DROP TABLE IF EXISTS public.w62_df04_design_params CASCADE;
DROP TABLE IF EXISTS public.store_credit_ledger CASCADE;
DROP TABLE IF EXISTS public.w62_zero_cost_flags CASCADE;
DROP TABLE IF EXISTS public.wac_change_log CASCADE;

-- R5. Restauración de cuerpos baseline (snapshot v6) — motor B incluido
DROP FUNCTION IF EXISTS public.fn_process_receipt(jsonb,uuid,text) CASCADE;
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
    -- Security validation: Impersonation check
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
    END IF;

    -- If auth is not available (internal call), we proceed with p_user_id but it's unlikely in this system
    -- Better to force auth.uid() if possible, but keep p_user_id for backwards compatibility if validated.

    INSERT INTO public.receipts (user_id, status, reference_doc)
    VALUES (p_user_id, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::int;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';
        
        -- SKU Enforcement
        IF v_sku IS NULL OR v_sku = '' THEN 
            RAISE EXCEPTION 'SKU es obligatorio para todos los productos en la recepción'; 
        END IF;

        IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser positiva'; END IF;
        IF v_cost < 0 THEN RAISE EXCEPTION 'Costo no puede ser negativo'; END IF;

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku;
            
            IF v_prod_id IS NULL THEN
                INSERT INTO public.products (
                    name, 
                    sku, 
                    cost_price, 
                    price, 
                    unit_of_measure, 
                    supplier,
                    image_url,
                    stock_current,
                    cost_average
                ) VALUES (
                    v_new_details->>'name',
                    v_sku,
                    v_cost,
                    (v_new_details->>'price')::numeric,
                    COALESCE(v_new_details->>'unit_of_measure', 'un'),
                    v_new_details->>'supplier',
                    v_new_details->>'image_url',
                    0,
                    0
                )
                RETURNING id INTO v_prod_id;
            END IF;
        ELSE
             v_prod_id := (v_item->>'product_id')::uuid;
             
             IF v_prod_id IS NULL THEN
                SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku;
             END IF;
             
             IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'Producto no encontrado: %', v_sku;
             END IF;
        END IF;

        SELECT stock_current, cost_average 
        INTO v_current_stock, v_current_avg_cost
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;
        IF v_current_avg_cost IS NULL THEN v_current_avg_cost := 0; END IF;

        v_new_stock := v_current_stock + v_qty;
        
        IF v_new_stock > 0 THEN
            v_new_avg_cost := ((v_current_stock * v_current_avg_cost) + (v_qty * v_cost)) / v_new_stock;
        ELSE
            v_new_avg_cost := v_cost;
        END IF;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost)
        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost);

        UPDATE public.products
        SET stock_current = v_new_stock,
            cost_average = v_new_avg_cost,
            cost_price = v_cost 
        WHERE id = v_prod_id;

        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_prod_id, 'IN_RECEIPT', v_qty, v_receipt_id, p_user_id, v_new_stock);

        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;

    RETURN v_receipt_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.cancel_reception(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.cancel_reception(p_reception_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_item RECORD;
    v_current_stock NUMERIC;
    v_current_avg_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;

    FOR v_item IN SELECT product_id, quantity, unit_cost FROM public.receipt_items WHERE receipt_id = p_reception_id
    LOOP
        -- Lock product
        SELECT stock_current, cost_price INTO v_current_stock, v_current_avg_cost 
        FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        -- Register movement to revert stock
        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_store_id,
            p_user_id := v_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'adjustment',
            p_reason := 'Cancelación de recepción: ' || p_reception_id::TEXT,
            p_sale_id := NULL,
            p_unit_cost := 0 -- Standard adjustment doesn't change cost usually, but we need to REVERSE WAC
        );

        -- REVERSE WAC CALCULATION:
        -- v_current_avg_cost = (Old_Total_Cost + Reception_Total_Cost) / (Old_Stock + Reception_Qty)
        -- Old_Total_Cost = (v_current_avg_cost * v_current_stock) - (v_item.quantity * v_item.unit_cost)
        -- Old_Stock = v_current_stock - v_item.quantity
        
        v_new_stock := v_current_stock - v_item.quantity;
        IF v_new_stock > 0 THEN
            v_new_cost := ((v_current_avg_cost * v_current_stock) - (v_item.quantity * v_item.unit_cost)) / v_new_stock;
        ELSE
            v_new_cost := v_current_avg_cost; -- Keep last known if stock hits zero
        END IF;

        UPDATE public.products 
        SET cost_price = GREATEST(0, v_new_cost),
            cost_average = GREATEST(0, v_new_cost),
            updated_at = NOW()
        WHERE id = v_item.product_id;
    END LOOP;

    UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.update_product_wac() CASCADE;
CREATE OR REPLACE FUNCTION public.update_product_wac()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id UUID;
  v_total_cost NUMERIC := 0;
  v_total_qty NUMERIC := 0;
  v_service_costs NUMERIC := 0;
  v_current_wac NUMERIC;
BEGIN
  SELECT store_id INTO v_store_id FROM products WHERE id = NEW.product_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;

  -- Sumar costos de receipt_items (costo directo de recepciones)
  SELECT COALESCE(SUM(ri.quantity * ri.unit_cost * COALESCE(ri.tasa_cambio_recepcion, 1.0)), 0)
  INTO v_total_cost
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE ri.product_id = NEW.product_id AND r.store_id = v_store_id AND r.status = 'active';

  -- Sumar cantidades de receipt_items
  SELECT COALESCE(SUM(ri.quantity), 0)
  INTO v_total_qty
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE ri.product_id = NEW.product_id AND r.store_id = v_store_id AND r.status = 'active';

  -- G4 NUEVO: Sumar costos de service_cost_distributions (servicios recibidos)
  SELECT COALESCE(SUM(scd.distribution_amount), 0)
  INTO v_service_costs
  FROM service_cost_distributions scd
  JOIN received_services rs ON rs.id = scd.service_id
  WHERE scd.product_id = NEW.product_id
    AND rs.store_id = v_store_id
    AND rs.status = 'active';

  -- Calcular WAC: (costo recepciones + costo servicios) / cantidad total
  IF v_total_qty > 0 THEN
    v_current_wac := (v_total_cost + v_service_costs) / v_total_qty;
  ELSE
    v_current_wac := 0;
  END IF;

  UPDATE products
  SET cost_average = v_current_wac, updated_at = NOW()
  WHERE id = NEW.product_id AND store_id = v_store_id;

  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_process_receipt(jsonb,uuid,uuid,text) CASCADE;
CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text DEFAULT NULL::text)
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
    -- Security validation: Impersonation check
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch';
    END IF;

    -- Security validation: Store access
    IF NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', p_store_id;
    END IF;

    INSERT INTO public.receipts (user_id, store_id, status, reference_doc)
    VALUES (p_user_id, p_store_id, 'active', p_reference)
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

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            -- Lookup with store_id to allow SKU reuse across stores
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku AND store_id = p_store_id;
            
            IF v_prod_id IS NULL THEN
                INSERT INTO public.products (
                    name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id
                ) VALUES (
                    v_new_details->>'name', v_sku, v_cost, (v_new_details->>'price')::numeric,
                    COALESCE(v_new_details->>'unit_of_measure', 'un'), v_new_details->>'supplier',
                    v_new_details->>'image_url', 0, 0, p_store_id
                )
                RETURNING id INTO v_prod_id;
            END IF;
        ELSE
             v_prod_id := (v_item->>'product_id')::uuid;
             
             IF v_prod_id IS NULL THEN
                SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku AND store_id = p_store_id;
             END IF;
             
             IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'Producto no encontrado: % en tienda %', v_sku, p_store_id;
             END IF;
        END IF;

        SELECT stock_current, cost_average 
        INTO v_current_stock, v_current_avg_cost
        FROM public.products
        WHERE id = v_prod_id
        FOR UPDATE;

        v_current_stock := COALESCE(v_current_stock, 0);
        v_current_avg_cost := COALESCE(v_current_avg_cost, 0);

        v_new_stock := v_current_stock + v_qty;
        v_new_avg_cost := CASE WHEN v_new_stock > 0 
                               THEN ((v_current_stock * v_current_avg_cost) + (v_qty * v_cost)) / v_new_stock 
                               ELSE v_cost END;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost)
        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost);

        UPDATE public.products
        SET stock_current = v_new_stock, cost_average = v_new_avg_cost, cost_price = v_cost 
        WHERE id = v_prod_id;

        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_prod_id, 'IN_RECEIPT', v_qty, v_receipt_id, p_user_id, v_new_stock);

        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.confirm_transfer(uuid,uuid,timestamp with time zone) CASCADE;
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_mov JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_stock_info JSONB;
  v_available NUMERIC;
  v_rows_affected INTEGER;
  v_ref_doc TEXT;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF COALESCE(v_transfer.requires_approval, false) = true AND v_transfer.approved_at IS NULL THEN
    RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
  END IF;

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    SELECT * INTO v_stock_info FROM public.get_available_stock(v_transfer.origin_store_id, v_item.product_id);
    IF NOT (v_stock_info->>'found')::boolean THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_AT_CONFIRM: %', v_item.product_id;
    END IF;
    v_available := (v_stock_info->>'stock_available')::numeric;
    IF v_available < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, disponible=%, solicitado=%',
        v_item.product_id, v_available, v_item.quantity;
    END IF;
  END LOOP;

  UPDATE public.transfers
    SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = v_caller_uid
    WHERE id = p_transfer_id;

  v_ref_doc := 'TRANSFERENCIA ' || UPPER(left(v_transfer.id::text, 8));

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    UPDATE public.inventory_reservations
      SET status = 'CONSUMED', consumed_at = NOW()
      WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id
        AND product_id = v_item.product_id AND status = 'ACTIVE';
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE EXCEPTION 'ERR_RESERVATION_NOT_FOUND: transferencia % producto %', p_transfer_id, v_item.product_id;
    END IF;

    -- FIX: pasar p_transfer_id como p_sale_id (8vo param) para que reference_id se setee
    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,  -- p_sale_id → se guarda como reference_id
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,  -- p_sale_id → reference_id
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id,
      'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED'),
      'reference_doc', v_ref_doc));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$;

DROP FUNCTION IF EXISTS public.receive_production_output(uuid,uuid,numeric,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_user_id UUID;
  v_product_exists BOOLEAN;
  v_qty_int INTEGER;
BEGIN
  SELECT EXISTS(SELECT 1 FROM products WHERE id = p_product_id AND store_id = p_store_id)
    INTO v_product_exists;
  IF NOT v_product_exists THEN
    RAISE EXCEPTION 'Producto no encontrado en esta tienda';
  END IF;

  v_qty_int := GREATEST(p_quantity, 0)::integer;

  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id;

  v_new_stock := v_current_stock + p_quantity;
  v_new_cost := CASE WHEN v_new_stock > 0
    THEN (v_current_stock * v_current_cost + v_total_materials_cost) / v_new_stock
    ELSE v_total_materials_cost / GREATEST(p_quantity, 1)
  END;

  -- Actualizar cost_average (WAC). NO tocar stock_current.
  UPDATE products SET
    cost_average = v_new_cost,
    cost_price = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := v_qty_int,
    p_movement_type := 'production_in'::text,
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_new_cost::numeric,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) CASCADE;
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
$function$;

DROP FUNCTION IF EXISTS public.reverse_transfer(uuid,text,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_ref_doc TEXT;
  v_mov JSONB;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: estado actual: %', v_transfer.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;

  v_ref_doc := 'REVERSIÓN ' || UPPER(left(v_transfer.id::text, 8)) || ' [' || left(p_reason, 50) || ']';

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    IF v_item.destination_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_DEST_PRODUCT_NULL: item %', v_item.id;
    END IF;

    -- FIX: pasar p_transfer_id como p_sale_id para reference_id
    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,  -- reference_id
      v_item.unit_cost, 'Reversión: devolución al origen', NOW(), TRUE
    );

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,  -- reference_id
      v_item.unit_cost, 'Reversión: retiro del destino', NOW(), TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.transfers
    SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_transfer_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_reversed', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count, 'reference_doc', v_ref_doc));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END;
$function$;

DROP FUNCTION IF EXISTS public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) CASCADE;
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_nuevo_costo_total NUMERIC;
  v_nuevo_costo_unitario NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  -- V2.5 H2a: autorización por TIENDA
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  -- V2.5.5: usar products.stock_current (inventory.quantity tiene trigger inmutable)
  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
    v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;
  END IF;

  -- V2.5.5: UPDATE en products (no en inventory que tiene trigger)
  UPDATE public.products
    SET stock_current = v_nuevo_stock,
        cost_average = CASE WHEN p_quantity_delta > 0 THEN v_nuevo_costo_unitario ELSE cost_average END,
        updated_at = v_effective_date
    WHERE id = p_product_id AND store_id = p_store_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date,
    p_skip_access_check := (v_caller_uid IS NULL)  -- V2.5.5: bypass si service_role
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock, 'new_cost_average', v_costo_promedio_actual);
END;
$function$;

DROP FUNCTION IF EXISTS public.confirm_pending_reception(uuid,uuid,timestamp with time zone) CASCADE;
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- PR-2 C.7-fix: NO actualizar stock_current aquí — los triggers de stock_movements
    -- son la fuente canónica de stock. Solo actualizar cost_average (WAC).
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
$function$;

DROP FUNCTION IF EXISTS public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) CASCADE;
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_old_stock NUMERIC;
  v_old_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  FOR v_item IN
    SELECT product_id, quantity, unit_cost, tasa_cambio_recepcion
    FROM receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current, cost_average INTO v_old_stock, v_old_wac
    FROM products WHERE id = v_item.product_id FOR UPDATE;

    v_new_stock := COALESCE(v_old_stock, 0) - v_item.quantity;

    -- A3 FIX: Insert reversal via register_stock_movement (uses 'purchase_reverse' enum)
    -- This automatically: updates products.stock_current, inventory.quantity (via trigger),
    -- and creates kardex_entries (via trg_auto_kardex trigger)
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_item.quantity,
      p_movement_type := 'purchase_reverse',
      p_reason := ('Void de recepcion: ' || COALESCE(p_reason, ''))::text,
      p_unit_cost := 0,
      p_notes := ('VOID:' || p_receipt_id::text),
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );

    -- A3 FIX: Restore WAC using reverse formula
    IF v_new_stock > 0 THEN
      v_new_wac := (COALESCE(v_old_stock, 0) * COALESCE(v_old_wac, 0)
                   - v_item.quantity * v_unit_cost_cup) / v_new_stock;
      v_new_wac := GREATEST(v_new_wac, 0);
    ELSE
      v_new_wac := v_old_wac;
    END IF;

    UPDATE products
      SET cost_average = v_new_wac, updated_at = v_effective_date
      WHERE id = v_item.product_id;
  END LOOP;

  UPDATE receipts SET status = 'voided', updated_at = v_effective_date WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('RECEPTION_VOIDED', 'receipts', p_receipt_id, v_store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'receipt_id', p_receipt_id));
END;
$function$;

DROP FUNCTION IF EXISTS public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) CASCADE;
CREATE OR REPLACE FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_devolution_id UUID;
    v_devolution_number TEXT;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_pid UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_pname TEXT;
    v_psku TEXT;
    v_caller_uid UUID := COALESCE(auth.uid(), NULL);
    v_seq_val BIGINT;
    v_prev_stock NUMERIC;
    v_prev_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
    v_line_total NUMERIC;
BEGIN
    -- H4-1 (preservado): auth.uid() NULL → rechazo.
    IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    -- H4-3: validar moneda.
    IF p_currency IS NULL OR p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
        RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', p_currency;
    END IF;

    -- H4-4: validar tasa de cambio positiva.
    IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: %', p_exchange_rate;
    END IF;

    -- H4-2: devolution_number generado por SEQUENCE.
    v_seq_val := nextval('public.devolutions_number_seq');
    v_devolution_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                           LPAD(v_seq_val::TEXT, 8, '0');

    -- H4-7: envolver toda la lógica de negocio en sub-block con EXCEPTION.
    BEGIN
        -- ⚠️ HOTFIX V2.12.8: 'transaction_id' → 'original_transaction_id'
        INSERT INTO public.devolutions (
            store_id, devolution_number, customer_id, customer_name, reason,
            total_amount, payment_method, status, processed_at, processed_by,
            original_transaction_id, currency, exchange_rate
        ) VALUES (
            p_store_id, v_devolution_number, p_customer_id, p_customer_name, p_reason,
            0, p_payment_method, 'completed', now(), v_caller_uid,
            p_original_transaction_id, p_currency, p_exchange_rate
        ) RETURNING id INTO v_devolution_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
            v_pid := (v_item->>'product_id')::UUID;
            v_qty := (v_item->>'quantity')::NUMERIC;
            v_price := (v_item->>'unit_price')::NUMERIC;
            v_line_total := v_qty * v_price;

            -- H4-5 + H4-6: capturar balance previo ANTES del UPDATE.
            SELECT p.stock_current, p.cost_average
              INTO v_prev_stock, v_prev_cost
            FROM public.products p
            WHERE p.id = v_pid;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid;
            END IF;

            -- H4-6: recalcular WAC.
            v_new_stock := v_prev_stock + v_qty;
            IF v_new_stock > 0 THEN
                v_new_cost := (v_prev_stock * v_prev_cost + v_line_total) / v_new_stock;
            ELSE
                v_new_cost := v_prev_cost;
            END IF;

            -- Restaurar stock Y actualizar cost_average.
            UPDATE public.products
                SET stock_current = v_new_stock,
                    cost_average = v_new_cost,
                    updated_at = now()
                WHERE id = v_pid;

            SELECT name, sku INTO v_pname, v_psku FROM public.products WHERE id = v_pid;

            -- H4-5: kardex registra balance ANTERIOR.
            INSERT INTO public.kardex_entries (
                store_id, product_id, movement_type, quantity, unit_cost, total_value,
                balance_quantity, balance_unit_cost, balance_total_value,
                reference_type, reference_id, reference_description, created_by
            ) VALUES (
                p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_line_total,
                v_prev_stock, v_prev_cost, v_prev_stock * v_prev_cost,
                'devolution', v_devolution_id, 'Devolución ' || v_devolution_number, v_caller_uid
            );

            INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total)
            VALUES (v_devolution_id, v_pid, v_qty, v_price, v_line_total);

            v_total := v_total + v_line_total;
        END LOOP;

        UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

        -- Audit (solo si todo OK)
        INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
        VALUES ('CREATE_DEVOLUTION', 'devolutions', v_devolution_id, p_store_id, v_caller_uid,
            jsonb_build_object(
              'total', v_total,
              'currency', p_currency,
              'exchange_rate', p_exchange_rate,
              'items_count', jsonb_array_length(p_items)
            ));

        RETURN jsonb_build_object(
            'status', 'success',
            'devolution_id', v_devolution_id,
            'devolution_number', v_devolution_number,
            'total_amount', v_total
        );

    EXCEPTION
        WHEN OTHERS THEN
            -- H4-7: loggear el fallo con contexto y re-raise con mensaje claro.
            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES (
                'CREATE_DEVOLUTION_FAILED',
                'devolutions',
                COALESCE(v_devolution_id, NULL),
                p_store_id,
                v_caller_uid,
                jsonb_build_object(
                    'devolution_number', v_devolution_number,
                    'error_message', SQLERRM,
                    'error_sqlstate', SQLSTATE,
                    'items_count', jsonb_array_length(p_items)
                )
            );
            RAISE EXCEPTION 'ERR_DEVOLUTION_FAILED: %', SQLERRM USING ERRCODE = SQLSTATE;
    END;
END;
$function$;

DROP FUNCTION IF EXISTS public.reverse_receipt_v2(uuid,text,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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

DROP FUNCTION IF EXISTS public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) CASCADE;
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_user_id UUID;
  v_qty_int INTEGER;
  v_order_status TEXT;
  v_order_store_id UUID;
  v_existing_result JSONB;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_param_hash TEXT;
BEGIN
  -- ─── 0. Idempotency ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || p_product_id::text || p_quantity::text || p_store_id::text);

    SELECT metadata->>'result'
    INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_OUTPUT_RECEIVED'
      AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key
    LIMIT 1;

    IF v_existing_result IS NOT NULL THEN
      -- Verificar que los parámetros coinciden
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE con status check ───
  SELECT status, store_id INTO v_order_status, v_order_store_id
  FROM production_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  IF v_order_status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_IN_PROGRESS: status % is not in_progress', v_order_status;
  END IF;

  -- ─── 2. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Validar que el producto pertenece a la tienda ───
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND store_id = v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE';
  END IF;

  -- ─── 4. Validar quantity > 0 ───
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_quantity must be > 0';
  END IF;

  -- ─── 5. Calcular costo total de materiales ───
  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  -- ─── 6. Calcular nuevo WAC ───
  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id FOR UPDATE;

  v_new_stock := v_current_stock + p_quantity;
  v_new_cost := CASE WHEN v_new_stock > 0
    THEN (v_current_stock * v_current_cost + v_total_materials_cost) / v_new_stock
    ELSE v_total_materials_cost / GREATEST(p_quantity, 1)
  END;

  -- ─── 7. Actualizar production_orders (output + snapshot) ───
  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    output_total_cost = v_total_materials_cost,
    output_unit_cost = CASE WHEN p_quantity > 0 THEN v_total_materials_cost / p_quantity ELSE 0 END,
    updated_at = now()
  WHERE id = p_order_id;

  -- ─── 8. Actualizar cost_average (WAC) ───
  UPDATE products SET
    cost_average = v_new_cost,
    cost_price = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id;

  -- ─── 9. Registrar movimiento de stock ───
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  v_qty_int := GREATEST(p_quantity, 0)::integer;

  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := v_qty_int,
    p_movement_type := 'production_in',
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_new_cost,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid,
    p_skip_access_check := TRUE
  );

  -- ─── 10. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_OUTPUT_RECEIVED', 'production_orders', p_order_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'quantity', p_quantity,
      'total_materials_cost', v_total_materials_cost,
      'unit_cost', v_new_cost,
      'previous_wac', v_current_cost,
      'new_wac', v_new_cost,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'new_wac', v_new_cost, 'new_stock', v_new_stock)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'new_wac', v_new_cost,
    'new_stock', v_new_stock,
    'total_materials_cost', v_total_materials_cost
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) CASCADE;
CREATE OR REPLACE FUNCTION public.withdraw_production_item(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_qty_int INTEGER; v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_unit_cost::text || '|' || p_store_id::text || '|' || COALESCE(p_user_id::text, ''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  v_qty_int := GREATEST(p_qty, 0)::integer;
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty, actual_unit_cost = p_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(p_product_id := v_product_id, p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int, p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text, p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost, p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id, p_skip_access_check := TRUE);

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost', p_unit_cost, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$;

DROP FUNCTION IF EXISTS public.void_closed_production_order(uuid,text,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text DEFAULT 'Anulación'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_count INTEGER := 0;
  v_reversed_payments INTEGER := 0;
BEGIN
  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  -- ─── 2. Idempotencia: si ya está voided, retornar success ───
  IF v_order.status = 'voided' THEN
    RETURN jsonb_build_object('status', 'already_voided', 'order_id', p_order_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Solo permitir anular OTs cerradas ───
  IF v_order.status != 'closed' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED: status actual %', v_order.status;
  END IF;

  -- ─── 5. Si tiene transaction_id (venta), marcarla como voided ───
  IF v_order.transaction_id IS NOT NULL THEN
    UPDATE public.transactions
      SET status = 'voided'
      WHERE id = v_order.transaction_id AND status = 'completed';
  END IF;

  -- ─── 6. Validar stock suficiente para revertir output ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0 THEN

    SELECT stock_current, COALESCE(cost_average, 0)
      INTO v_output_stock, v_output_wac
    FROM products WHERE id = v_order.output_product_id FOR UPDATE;

    IF v_output_stock < v_order.output_quantity THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_OUTPUT_ALREADY_CONSUMED: stock (%) < output_quantity (%). Revertir la venta primero.',
        v_output_stock, v_order.output_quantity;
    END IF;
  END IF;

  -- ─── 7. Reabastecer insumos via register_stock_movement ───
  FOR v_item IN
    SELECT poi.*, p.store_id as p_store_id
    FROM production_order_items poi
    JOIN products p ON p.id = poi.product_id
    WHERE poi.order_id = p_order_id AND poi.actual_qty > 0
    ORDER BY poi.id
  LOOP
    PERFORM register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.actual_qty,
      p_movement_type := 'production_reverse',
      p_reason := 'Anulación OT ' || v_order.order_number || ' - devolución insumo',
      p_unit_cost := 0,
      p_notes := 'void:' || p_order_id::text,
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 8. Descontar output product via register_stock_movement ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0 THEN

    PERFORM register_stock_movement(
      p_product_id := v_order.output_product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_order.output_quantity,
      p_movement_type := 'production_reverse',
      p_reason := 'Anulación OT ' || v_order.order_number || ' - retirar output',
      p_unit_cost := 0,
      p_notes := 'void:' || p_order_id::text,
      p_skip_access_check := TRUE
    );

    -- ─── 9. WAC reversal usando snapshot output_total_cost ───
    v_new_stock := v_output_stock - v_order.output_quantity;
    IF v_new_stock > 0 THEN
      v_new_wac := (v_output_stock * v_output_wac - v_order.output_total_cost) / v_new_stock;
      v_new_wac := GREATEST(v_new_wac, 0);
    ELSE
      v_new_wac := 0;
    END IF;

    UPDATE products SET
      cost_average = v_new_wac,
      cost_price = v_new_wac,
      updated_at = now()
    WHERE id = v_order.output_product_id;

    v_count := v_count + 1;
  END IF;

  -- ─── 10. Marcar payment_transactions como REVERSED ───
  UPDATE payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by void OT ' || p_order_id::text || ' at ' || now()::text || ']'
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id
  RETURNING id INTO v_item; -- just to count

  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- ─── 11. Marcar OT como voided + reset payment_status ───
  UPDATE production_orders
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      reversed_at = now(),
      reversed_by = v_caller_uid,
      reversal_reason = p_reason
  WHERE id = p_order_id;

  -- ─── 12. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_VOIDED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', p_reason,
      'items_reversed', v_count,
      'payments_reversed', v_reversed_payments,
      'output_total_cost_snapshot', v_order.output_total_cost,
      'wac_before', v_output_wac,
      'wac_after', v_new_wac
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'items_reversed', v_count,
    'payments_reversed', v_reversed_payments
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.reverse_production_order(uuid,text,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
BEGIN
  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia ───
  IF v_order.status = 'reversed' THEN
    RETURN jsonb_build_object('status', 'already_reversed', 'order_id', p_order_id);
  END IF;

  -- ─── 3. Validaciones ───
  IF v_order.status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use void, no reverse';
  END IF;
  IF v_order.status IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: no se puede revertir una orden sin avance (use void)';
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar stock suficiente para revertir output ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    SELECT stock_current, COALESCE(cost_average, 0)
      INTO v_output_stock, v_output_wac
    FROM products WHERE id = v_order.output_product_id FOR UPDATE;

    IF v_output_stock < v_order.output_quantity THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_OUTPUT_ALREADY_CONSUMED: stock (%) < output_quantity (%). Revertir la venta primero.',
        v_output_stock, v_order.output_quantity;
    END IF;
  END IF;

  -- ─── 5. Devolver insumos via register_stock_movement ───
  FOR v_item IN
    SELECT product_id, actual_qty, variant_id
    FROM production_order_items
    WHERE order_id = p_order_id AND actual_qty > 0
    ORDER BY id
  LOOP
    PERFORM register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_uid,
      p_quantity := v_item.actual_qty,
      p_movement_type := 'production_reverse',
      p_reason := 'Reversión de orden: insumo devuelto',
      p_unit_cost := 0,
      p_notes := 'reverse:' || p_order_id::text,
      p_variant_id := v_item.variant_id,
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 6. Retirar output product via register_stock_movement + WAC reversal ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    PERFORM register_stock_movement(
      p_product_id := v_order.output_product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_uid,
      p_quantity := -v_order.output_quantity,
      p_movement_type := 'production_reverse',
      p_reason := 'Reversión de orden: output retirado',
      p_unit_cost := 0,
      p_notes := 'reverse:' || p_order_id::text,
      p_skip_access_check := TRUE
    );

    -- WAC reversal usando snapshot
    v_new_stock := v_output_stock - v_order.output_quantity;
    IF v_new_stock > 0 THEN
      v_new_wac := (v_output_stock * v_output_wac - v_order.output_total_cost) / v_new_stock;
      v_new_wac := GREATEST(v_new_wac, 0);
    ELSE
      v_new_wac := 0;
    END IF;

    UPDATE products SET
      cost_average = v_new_wac,
      cost_price = v_new_wac,
      updated_at = now()
    WHERE id = v_order.output_product_id;

    v_count := v_count + 1;
  END IF;

  -- ─── 7. Marcar orden como reversed ───
  UPDATE production_orders
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_uid, v_order.store_id, 'PRODUCTION_REVERSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', p_reason,
      'items_reversed', v_count,
      'output_total_cost_snapshot', v_order.output_total_cost,
      'wac_before', v_output_wac,
      'wac_after', v_new_wac
    )
  );

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'order_id', p_order_id);
END;
$function$;

DROP FUNCTION IF EXISTS public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) CASCADE;
CREATE OR REPLACE FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL::text, p_final_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_output_product_id uuid DEFAULT NULL::uuid, p_output_quantity numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
  v_transaction_id uuid;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_recv_result jsonb;
  v_existing_result jsonb;
  v_param_hash text;
  v_sum_payments numeric;
BEGIN
  -- ─── 0. Idempotency ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id::text
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia: si ya está closed ───
  IF v_order.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'order_id', p_order_id, 'transaction_id', v_order.transaction_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar que la orden está en progreso ───
  IF v_order.status NOT IN ('in_progress', 'approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSABLE: status %', v_order.status;
  END IF;

  -- ─── 5. Transición a in_progress (si no lo está) ───
  IF v_order.status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_order.status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  -- ─── 6. Pago final (atómico) ───
  IF p_final_amount > 0 AND p_final_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id,
      p_amount := p_final_amount,
      p_payment_method := p_final_method,
      p_paid_by := v_caller_uid,
      p_currency := p_final_currency,
      p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- PATH A: PRODUCCIÓN
  -- ═══════════════════════════════════════════════════════════════
  IF v_order.order_type = 'production' THEN
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT: product_id y quantity > 0 son obligatorios';
    END IF;

    PERFORM public.receive_production_output(
      p_order_id := p_order_id,
      p_product_id := p_output_product_id,
      p_quantity := p_output_quantity,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_idempotency_key := 'recv-' || p_order_id::text
    );

  -- ═══════════════════════════════════════════════════════════════
  -- PATH B: SERVICIO
  -- ═══════════════════════════════════════════════════════════════
  ELSIF v_order.order_type = 'service' THEN
    -- Calcular desglose de pagos
    SELECT
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_amount, v_transfer_amount, v_zelle_amount
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

    v_effective_method := COALESCE(p_final_method, 'cash');
    IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
      v_effective_method := 'mixed';
    ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
      v_effective_method := 'mixed';
    ELSIF v_cash_amount > 0 THEN
      v_effective_method := 'cash';
    ELSIF v_transfer_amount > 0 THEN
      v_effective_method := 'transfer';
    ELSIF v_zelle_amount > 0 THEN
      v_effective_method := 'zelle';
    END IF;

    -- Crear venta (inline)
    INSERT INTO transactions (
      store_id, seller_id, total_amount, payment_method,
      sale_currency, sale_exchange_rate, status, created_at, completed_at,
      customer_name, customer_phone, customer_ci, customer_address,
      subtotal, cash_amount, transfer_amount, zelle_amount
    ) VALUES (
      v_order.store_id, p_seller_id, v_order.budget_total,
      v_effective_method::public.payment_method_enum,
      p_final_currency, p_exchange_rate, 'completed', now(), now(),
      v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
      v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
    ) RETURNING id INTO v_transaction_id;

    -- Item de venta
    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
    );

    -- ═══════════════════════════════════════════════════════════════
    -- PR-4.4I: Asociar pagos existentes con la nueva venta (UPDATE, no INSERT)
    -- ═══════════════════════════════════════════════════════════════
    -- NO duplicamos filas. Solo marcamos transaction_id en los pagos existentes.
    -- Esto preserva la trazabilidad: ref_type+ref_id = origen OT,
    -- transaction_id = aplicación contable (venta).
    UPDATE public.payment_transactions
      SET transaction_id = v_transaction_id
      WHERE ref_type IN ('production_order', 'work')
        AND ref_id = p_order_id
        AND transaction_id IS NULL;

    -- Validación I1c (OT permite saldo pendiente)
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_transaction_id;

    IF v_sum_payments > v_order.budget_total + 0.01 THEN
      RAISE EXCEPTION 'ERR_OT_OVERPAID: payments=% > budget_total=%',
        v_sum_payments, v_order.budget_total;
    END IF;

    -- Si hay diferencia (saldo), se registra en audit_log
    IF ABS(v_sum_payments - v_order.budget_total) > 0.01 THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'OT_SALDO_PENDING', 'transactions', v_transaction_id, v_order.store_id, v_caller_uid,
        jsonb_build_object(
          'order_id', p_order_id,
          'budget_total', v_order.budget_total,
          'sum_payments_cup', v_sum_payments,
          'saldo', v_order.budget_total - v_sum_payments
        )
      );
    END IF;
  END IF;

  -- ─── 7. Transición a completed → closed ───
  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET
    status = 'closed',
    closed_at = now(),
    transaction_id = COALESCE(v_transaction_id, v_order.transaction_id),
    payment_status = 'paid'
  WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_CLOSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'transaction_id', v_transaction_id,
      'final_amount', p_final_amount,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'payment_transactions_associated', true,
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'transaction_id', v_transaction_id
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) CASCADE;
CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
  v_devolution_cost numeric;
  v_total numeric := 0;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing);
    END IF;
  END IF;

  -- Autorización (patrón canónico v2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar cross-store (preservado de v2.19.4)
  IF p_original_transaction_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_original_transaction_id AND store_id = p_store_id) THEN
      RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
    END IF;
  END IF;

  -- Numeración secuencial (preservado de v2.19.4 / F-H1)
  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    -- PR-4.3: determinar costo histórico correcto para kardex
    -- 1. Intentar cost_at_sale de la transacción original
    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id
        AND product_id = v_pid
      LIMIT 1;
    END IF;

    -- 2. Fallback: WAC actual (documentado como fallback operativo, no histórico)
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost
      FROM public.products WHERE id = v_pid;
    END IF;

    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    -- register_stock_movement con costo correcto → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_pid,
      p_store_id := p_store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_qty,
      p_movement_type := 'return',
      p_sale_id := v_devolution_id,
      p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement ahora genera la kardex con
    -- movement_type='devolution_in' y unit_cost=v_devolution_cost (correcto)
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items)
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx_id uuid := gen_random_uuid();
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units numeric;
  v_stock numeric;
  v_existing uuid;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
  v_calculated_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_taxable_base numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_total numeric := 0;
  v_tax jsonb;
  v_tax_value numeric;
  v_effective_discount_pct numeric := 0;
  v_cash_amt numeric := p_cash_amount;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  -- PR-4.4I: variables para payment_transactions
  v_pt_id uuid;
  v_zelle_original_amount numeric;
  v_sum_payments numeric;
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions
      WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
    END IF;
  END IF;

  -- 3. Auth
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 4. Operation date validation
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. Auto-promote to mixed
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND p_payment_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
    v_zelle_amt := p_total_amount;
  END IF;

  -- 6. Primera pasada: SELECT FOR UPDATE + recalcular subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    SELECT quantity INTO v_stock
      FROM public.inventory
      WHERE product_id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    IF v_stock IS NULL THEN
      SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);

    -- Saltar validación de stock para servicios
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      IF v_stock < v_units THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units;
      END IF;
    END IF;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    v_calculated_subtotal := v_calculated_subtotal + (v_price * v_qty);
  END LOOP;

  -- 7. Recalcular descuento
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 8. Recalcular tax
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  FOR v_tax IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax->>'type' = 'percentage' THEN
      v_tax_value := (v_taxable_base * COALESCE((v_tax->>'value')::numeric, 0)) / 100;
      IF v_tax ? 'min_exempt' THEN
        v_tax_value := GREATEST(0, v_taxable_base - COALESCE((v_tax->>'min_exempt')::numeric, 0)) * COALESCE((v_tax->>'value')::numeric, 0) / 100;
      END IF;
    ELSE
      v_tax_value := COALESCE((v_tax->>'value')::numeric, 0);
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 9. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 10. Validar total vs cliente (tolerancia 0.01 CUP)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 11. Validar supervisor auth (si descuento >= 15%)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;

  IF v_effective_discount_pct >= 15 THEN
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: discount_pct=%', v_effective_discount_pct;
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
  END IF;

  -- 12. Validar/setear payment split
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 1.00 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
        v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'cash' THEN
    v_cash_amt := v_calculated_total;
  ELSIF v_effective_method = 'transfer' THEN
    v_transfer_amt := v_calculated_total;
  ELSIF v_effective_method = 'zelle' THEN
    v_zelle_amt := v_calculated_total;
  END IF;

  -- 13. INSERT transactions
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name
  );

  -- 14. Segunda pasada: stock movement + INSERT transaction_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;
    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    -- Stock movement (solo si NO es servicio)
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
        p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
        p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;

    -- INSERT transaction_items
    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
      cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
      cash_currency, transfer_currency, zelle_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      zelle_discount_type, zelle_discount_value, zelle_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum,
      v_discount_amount,
      p_sale_currency,
      v_price * p_sale_exchange_rate
    );
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════
  -- 15. PR-4.4I: INSERT payment_transactions (fuente autoritativa de pagos)
  -- ═══════════════════════════════════════════════════════════════════
  -- Cada pago se persiste individualmente con su moneda y tasa.
  -- amount_cup es GENERATED (no se inserta — la BD lo calcula).
  -- El trigger trg_validate_payment_invariants valida invariantes I1a, I9-TXN, etc.

  -- 15a. Pago cash (siempre CUP, rate=1)
  IF v_cash_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_cash_amt, 'cash', 'CUP', 1.0,
      v_eff, v_uid, 'pay-cash-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 15b. Pago transfer (siempre CUP, rate=1)
  IF v_transfer_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_transfer_amt, 'transfer', 'CUP', 1.0,
      v_eff, v_uid, 'pay-transfer-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 15c. Pago Zelle (USD/EUR, rate > 1)
  -- p_sale_currency se interpreta como currency del pago Zelle
  -- p_sale_exchange_rate se interpreta como tasa del pago Zelle
  IF v_zelle_amt > 0 THEN
    -- Validar: Zelle requiere tasa > 1
    IF p_sale_currency = 'CUP' OR p_sale_exchange_rate IS NULL OR p_sale_exchange_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and p_sale_exchange_rate > 1. Got: currency=%, rate=%',
        p_sale_currency, p_sale_exchange_rate
        USING ERRCODE = 'PT009';
    END IF;

    -- Validar: currency domain
    IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
        p_sale_currency
        USING ERRCODE = 'PT004';
    END IF;

    -- Monto original en moneda nativa
    v_zelle_original_amount := v_zelle_amt / p_sale_exchange_rate;

    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_zelle_original_amount, 'zelle', p_sale_currency, p_sale_exchange_rate,
      v_eff, v_uid, 'pay-zelle-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 16. Validación post-INSERT: I1b (POS exige pago completo)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
  FROM public.payment_transactions WHERE transaction_id = v_tx_id;

  IF ABS(v_sum_payments - v_calculated_total) > 0.01 THEN
    RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
      v_sum_payments, v_calculated_total
      USING ERRCODE = 'PT011';
  END IF;

  -- 17. Audit log completo
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object(
      'total_amount', v_calculated_total,
      'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount,
      'discount_pct', v_effective_discount_pct,
      'tax_amount', v_calculated_tax,
      'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id,
      'supervisor_id', p_supervisor_user_id,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true,
      'payment_transactions_created', true
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.validate_payment_transactions_invariants() CASCADE;
CREATE OR REPLACE FUNCTION public.validate_payment_transactions_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'PT007'; END IF; IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1' USING ERRCODE = 'PT003'; END IF; IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1' USING ERRCODE = 'PT004'; END IF; IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP' USING ERRCODE = 'PT005'; END IF; IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0)); PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0)); ELSIF NEW.transaction_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0)); END IF; IF NEW.transaction_id IS NOT NULL THEN DECLARE v_total_amount numeric; v_sum_payments numeric; v_existing_rate numeric; BEGIN SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id; SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id; IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL' USING ERRCODE = 'PT001'; END IF; SELECT exchange_rate INTO v_existing_rate FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id LIMIT 1; IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES' USING ERRCODE = 'PT006'; END IF; END; END IF; RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.protect_transactions_total_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    IF current_user <> 'costpro_transaction_adjuster' THEN
      RAISE EXCEPTION 'ERR_TOTAL_AMOUNT_IMMUTABLE: transactions.total_amount cannot be modified directly (current_user=%). Use adjust_total_amount() RPC.',
        current_user
        USING ERRCODE = 'PT008';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) CASCADE;
CREATE OR REPLACE FUNCTION public.withdraw_production_item(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_doc text DEFAULT NULL::text, p_server_side_cost boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,'') || '|' || p_server_side_cost::text);
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  -- V-01: SELECT FOR UPDATE reads AND locks budgeted_qty + actual_qty
  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- V-01: Overconsumption check using locked values
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %',
      v_actual, p_qty, v_budgeted;
  END IF;

  -- C-03 + C-04: Server-side cost without fallback
  IF p_server_side_cost THEN
    SELECT cost_average INTO v_real_unit_cost
    FROM products WHERE id = v_product_id AND store_id = v_order_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;
    IF v_real_unit_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
    END IF;
  ELSE
    v_real_unit_cost := p_unit_cost;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- No integer truncation (fix #3): use p_qty directly
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'server_side_cost', p_server_side_cost,
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_vale_salida(uuid,jsonb,uuid,text,text) CASCADE;
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid   uuid;
  v_slip_id      uuid;
  v_slip_number  text;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_po_item_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_param_hash   text;
  v_existing     jsonb;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_order_status text;
  v_po_product   uuid;
  v_po_variant   uuid;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- C-02: Idempotency key required
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', NULL, v_param_hash);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_production_order_id IS NOT NULL THEN
    SELECT status INTO v_order_status
    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
    IF v_order_status NOT IN ('approved','in_progress') THEN
      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
    END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (store_id, slip_number, production_order_id, notes, created_by, tenant_id)
  VALUES (p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
    (SELECT tenant_id FROM stores WHERE id = p_store_id))
  RETURNING id INTO v_slip_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN
        RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED';
      END IF;

      IF v_po_item_id = ANY(v_seen_po_items) THEN
        RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id;
      END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;

      IF v_po_product IS DISTINCT FROM v_product_id THEN
        RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH: expected %, got %', v_po_product, v_product_id;
      END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN
        RAISE EXCEPTION 'ERR_VARIANT_MISMATCH: expected %, got %', v_po_variant, v_variant_id;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM withdraw_production_item(
        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
        p_server_side_cost := TRUE
      );
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));

  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END;
$function$;

DROP FUNCTION IF EXISTS public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid   uuid;
  v_slip_id      uuid := gen_random_uuid();
  v_slip_number  text;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_po_item_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_param_hash   text;
  v_existing     jsonb;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_order_status text;
  v_po_product   uuid;
  v_po_variant   uuid;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  IF p_production_order_id IS NULL THEN
    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
      RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF p_production_order_id IS NOT NULL THEN
    SELECT status INTO v_order_status
    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
    IF v_order_status NOT IN ('approved','in_progress') THEN
      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
    END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, created_by, tenant_id)
  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
    (SELECT tenant_id FROM stores WHERE id = p_store_id));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM withdraw_production_item(
        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
        p_server_side_cost := TRUE
      );
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));

  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END;
$function$;

-- R6. Constraints baseline payment_transactions
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_ref_type_check CHECK (ref_type = ANY (ARRAY['receipt'::text, 'service'::text, 'production_order'::text, 'work'::text, 'sale'::text, 'commission'::text]));

-- R7. Triggers baseline (motor B y demás sobre products/receipt_items)
DROP TRIGGER IF EXISTS trg_sync_has_movements_inv ON inventory_movements;
CREATE TRIGGER trg_sync_has_movements_inv AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION sync_product_has_movements();
DROP TRIGGER IF EXISTS trg_validate_payment_invariants ON payment_transactions;
CREATE TRIGGER trg_validate_payment_invariants BEFORE INSERT OR DELETE OR UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION validate_payment_transactions_invariants();
DROP TRIGGER IF EXISTS trg_ensure_product_barcode ON products;
CREATE TRIGGER trg_ensure_product_barcode BEFORE INSERT OR UPDATE OF barcode ON products FOR EACH ROW EXECUTE FUNCTION ensure_product_barcode();
DROP TRIGGER IF EXISTS trg_maintain_product_completeness ON products;
CREATE TRIGGER trg_maintain_product_completeness BEFORE INSERT OR UPDATE OF price ON products FOR EACH ROW EXECUTE FUNCTION fn_maintain_product_completeness();
DROP TRIGGER IF EXISTS trigger_audit_product_changes ON products;
CREATE TRIGGER trigger_audit_product_changes AFTER UPDATE ON products FOR EACH ROW WHEN (old.name IS DISTINCT FROM new.name OR old.price IS DISTINCT FROM new.price OR old.cost_price IS DISTINCT FROM new.cost_price OR old.sku IS DISTINCT FROM new.sku OR old.price_currency IS DISTINCT FROM new.price_currency) EXECUTE FUNCTION audit_product_changes();
DROP TRIGGER IF EXISTS trg_check_reception_cost_variation ON receipt_items;
CREATE TRIGGER trg_check_reception_cost_variation BEFORE INSERT ON receipt_items FOR EACH ROW EXECUTE FUNCTION check_reception_cost_variation();
DROP TRIGGER IF EXISTS trg_sync_has_movements_receipt ON receipt_items;
CREATE TRIGGER trg_sync_has_movements_receipt AFTER INSERT ON receipt_items FOR EACH ROW EXECUTE FUNCTION sync_product_has_movements();
DROP TRIGGER IF EXISTS trg_update_product_wac ON receipt_items;
CREATE TRIGGER trg_update_product_wac AFTER INSERT ON receipt_items FOR EACH ROW EXECUTE FUNCTION update_product_wac();
DROP TRIGGER IF EXISTS trg_sync_has_movements_sale ON transaction_items;
CREATE TRIGGER trg_sync_has_movements_sale AFTER INSERT ON transaction_items FOR EACH ROW EXECUTE FUNCTION sync_product_has_movements();

-- R8. ACL baseline (REVOKE/GRANT del snapshot sobre funciones objetivo)
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.cancel_reception(uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.cancel_reception(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reception(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.cancel_reception(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid,uuid,uuid,numeric,text,text,numeric,uuid,numeric,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) TO postgres;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(uuid,uuid,timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) TO postgres;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid,uuid,timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2(uuid,jsonb,text,uuid,uuid,text,uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM anon;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) TO service_role;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_v2(uuid,uuid,jsonb,text,text,numeric,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,uuid,text,uuid,text,timestamp with time zone,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_vale_salida(uuid,jsonb,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(jsonb,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_process_receipt(jsonb,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) TO postgres;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid,uuid,numeric,text,uuid,numeric,timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid,uuid,numeric,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.reverse_production_order(uuid,text,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.reverse_transfer(uuid,text,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid,text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM anon;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM supabase_admin;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM dashboard_user;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.update_product_wac() FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.update_product_wac() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_wac() TO postgres;
GRANT EXECUTE ON FUNCTION public.update_product_wac() TO service_role;
REVOKE ALL ON FUNCTION public.validate_payment_transactions_invariants() FROM supabase_admin;
REVOKE ALL ON FUNCTION public.validate_payment_transactions_invariants() FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.validate_payment_transactions_invariants() FROM dashboard_user;
REVOKE ALL ON FUNCTION public.validate_payment_transactions_invariants() FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.validate_payment_transactions_invariants() FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.validate_payment_transactions_invariants() FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.validate_payment_transactions_invariants() TO anon;
GRANT EXECUTE ON FUNCTION public.validate_payment_transactions_invariants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_payment_transactions_invariants() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_payment_transactions_invariants() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_payment_transactions_invariants() TO service_role;
REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid,text,uuid) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid,text,uuid) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid,text,uuid) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid,text,uuid) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid,text,uuid) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid,text,uuid) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid,text,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid,text,uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid,text,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM authenticated;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) TO postgres;
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(uuid,uuid,text,timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM anon;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text,uuid,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM authenticated;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM supabase_admin;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM supabase_auth_admin;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM dashboard_user;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM costpro_transaction_adjuster;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM costpro_snapshot_restorer;
REVOKE ALL ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) FROM warehouse_staff;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) TO postgres;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid,numeric,numeric,uuid,uuid,text) TO service_role;
COMMIT;
