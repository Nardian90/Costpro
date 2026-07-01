-- Actualización per-store: pasar store_id a validate_operation_date en todos los RPCs


DROP FUNCTION IF EXISTS public.create_sale(uuid, uuid, numeric, jsonb, numeric, text, numeric, text, numeric, jsonb, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transaction_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_units_to_deduct NUMERIC;
  v_current_stock NUMERIC;
  v_tenant_id UUID;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- 0) Validación de política forward-only
  PERFORM public.validate_operation_date(p_operation_date, p_store_id);

  -- 1) Internal security check
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_store_id;
  v_transaction_id := COALESCE(p_transaction_id, gen_random_uuid());

  -- 2) Insert transaction header con la fecha efectiva
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, subtotal, tenant_id, status,
    payment_method, discount_type, discount_value, tax_amount, applied_taxes,
    created_at
  )
  VALUES (
    v_transaction_id, p_store_id, p_seller_id, p_total_amount, p_subtotal, v_tenant_id,
    'completed'::transaction_status,
    p_payment_method::payment_method_enum,
    p_discount_type::discount_type_enum,
    p_discount_value, p_tax_amount, p_applied_taxes,
    v_effective_date
  );

  -- 3) Process items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_units_to_deduct := (v_item->>'quantity')::NUMERIC;

    PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

    SELECT quantity INTO v_current_stock FROM public.inventory
      WHERE store_id = p_store_id AND product_id = v_product_id FOR UPDATE;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Producto % tiene % unidades, se requieren %', v_product_id, COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;

    -- Insert item con fecha efectiva
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_transaction_id, v_product_id, v_units_to_deduct, (v_item->>'price')::NUMERIC, (v_item->>'cost')::NUMERIC, v_effective_date);

    -- Register movement con la fecha efectiva
    PERFORM public.register_stock_movement(
      p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := p_seller_id,
      p_quantity := -v_units_to_deduct, p_movement_type := 'sale',
      p_sale_id := v_transaction_id, p_unit_cost := COALESCE((v_item->>'cost')::NUMERIC, 0),
      p_operation_date := v_effective_date
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$function$;



DROP FUNCTION IF EXISTS public.process_inventory_adjustment(uuid, uuid, adjustment_item[], timestamp with time zone);
CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_item public.adjustment_item;
  v_difference NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date, p_store_id);

  INSERT INTO public.inventory_adjustments (store_id, created_by, status, created_at)
  VALUES (p_store_id, p_cashier_id, 'PROCESSING', v_effective_date)
  RETURNING id INTO v_adjustment_id;

  FOREACH v_item IN ARRAY p_items
  LOOP
    v_difference := v_item.counted_quantity - v_item.expected_quantity;
    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity, created_at)
    VALUES (v_adjustment_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity, v_effective_date);

    PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := p_store_id,
        p_user_id := p_cashier_id,
        p_quantity := v_difference,
        p_movement_type := 'adjustment',
        p_operation_date := v_effective_date
    );
  END LOOP;

  UPDATE public.inventory_adjustments SET status = 'COMPLETED', updated_at = v_effective_date
  WHERE id = v_adjustment_id;
  RETURN v_adjustment_id;
END;
$function$;



DROP FUNCTION IF EXISTS public.process_stock_adjustment(uuid, uuid, numeric, text, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);

    PERFORM public.register_stock_movement(
      p_product_id := p_product_id,
      p_store_id := p_store_id,
      p_user_id := p_user_id,
      p_quantity := p_quantity_delta,
      p_movement_type := 'adjustment',
      p_reason := p_reason,
      p_operation_date := v_effective_date
    );
    RETURN jsonb_build_object('success', true);
END;
$function$;



DROP FUNCTION IF EXISTS public.register_reception(uuid, text, timestamp with time zone, text, jsonb);
CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_user_id UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
BEGIN
  -- Validación forward-only locking sobre p_reception_date
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  -- Validar acceso a la tienda
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- Insertar cabecera de recepción con la fecha efectiva
  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date
  );

  -- Procesar cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE NOTICE 'Producto % no encontrado o no pertenece a la tienda, saltando', v_product_id;
      CONTINUE;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, quantity, unit_cost, created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_quantity, v_unit_cost, v_effective_date, v_effective_date
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := v_user_id,
      p_quantity := v_quantity,
      p_movement_type := 'purchase',
      p_reason := p_invoice_number || ' - ' || p_supplier,
      p_unit_cost := v_unit_cost,
      p_sale_id := v_receipt_id,
      p_operation_date := v_effective_date
    );

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;
  RETURN v_receipt_id;
END;
$function$;



DROP FUNCTION IF EXISTS public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone);
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
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date, p_store_id);

  IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory WHERE store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := GREATEST(0, (v_stock_actual * v_costo_promedio_actual) - (ABS(p_quantity_delta) * v_costo_unitario_movimiento));
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, 0);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
  END IF;

  v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;

  -- Pasar p_operation_date a register_stock_movement para que el movimiento
  -- tenga la misma fecha efectiva que el ajuste.
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := p_user_id,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_reason := p_reason,
    p_unit_cost := v_costo_unitario_movimiento,
    p_operation_date := v_effective_date
  );

  UPDATE public.products
  SET cost_average = v_nuevo_costo_unitario, updated_at = v_effective_date
  WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'nuevo_stock', v_nuevo_stock,
    'nuevo_costo_total', v_nuevo_costo_total,
    'nuevo_costo_unitario', v_nuevo_costo_unitario,
    'movimiento_registrado', true
  );
END;
$function$;



DROP FUNCTION IF EXISTS public.confirm_pending_reception(uuid, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  FOR v_item IN SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;
    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_item.unit_cost) / v_new_stock
      ELSE v_item.unit_cost END;
    UPDATE products SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_item.quantity, v_item.unit_cost, 'Confirmacion recepcion', v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status = 'active', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;



DROP FUNCTION IF EXISTS public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  FOR v_item IN SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) - v_item.quantity;
    IF v_new_stock > 0 AND v_current_stock > 0 THEN
      v_new_avg := (v_current_stock * v_current_avg - v_item.quantity * v_item.unit_cost) / v_new_stock;
      IF v_new_avg < 0 THEN v_new_avg := 0; END IF;
    ELSE
      v_new_avg := v_current_avg;
    END IF;
    UPDATE products
    SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    -- Movimiento de retorno con fecha efectiva
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'return'::movement_type, -v_item.quantity, v_item.unit_cost,
            p_reason, v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'voided', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'active';
END;
$function$;



DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id, auth.uid(), p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date
    );

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC) LOOP
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;



DROP FUNCTION IF EXISTS public.confirm_transfer(uuid, uuid, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer RECORD;
    v_t_origin UUID;
    v_t_dest UUID;
    v_item RECORD;
    v_dest_product RECORD;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    SELECT origin_store_id, destination_store_id INTO v_t_origin, v_t_dest
    FROM public.transfers WHERE id = p_transfer_id;
    PERFORM public.validate_transfer_operation_date(p_operation_date, v_t_origin, v_t_dest);

    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id) LOOP
        SELECT * INTO v_dest_product FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
          AND store_id = v_transfer.destination_store_id FOR UPDATE;

        PERFORM public.register_stock_movement(
          p_product_id := v_item.product_id,
          p_store_id := v_transfer.origin_store_id,
          p_user_id := p_user_id,
          p_quantity := -v_item.quantity,
          p_movement_type := 'transfer_out',
          p_operation_date := v_effective_date
        );
        PERFORM public.register_stock_movement(
          p_product_id := v_dest_product.id,
          p_store_id := v_transfer.destination_store_id,
          p_user_id := p_user_id,
          p_quantity := v_item.quantity,
          p_movement_type := 'transfer_in',
          p_operation_date := v_effective_date
        );
    END LOOP;
    UPDATE public.transfers SET status = 'CONFIRMADA', updated_at = v_effective_date
    WHERE id = p_transfer_id;
    RETURN jsonb_build_object('status', 'ok');
END;
$function$;



DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_item RECORD;
    v_void_store_id UUID;
    v_current_stock INT;
    v_new_stock INT;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    SELECT store_id INTO v_void_store_id FROM public.transactions WHERE id = p_transaction_id;
    PERFORM public.validate_operation_date(p_operation_date, v_void_store_id);

    IF EXISTS (SELECT 1 FROM public.sales WHERE id = p_transaction_id AND status = 'voided') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transacción ya anulada');
    END IF;

    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_transaction_id
    LOOP
        SELECT stock_current INTO v_current_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;

        UPDATE public.products
        SET stock_current = v_new_stock, updated_at = v_effective_date
        WHERE id = v_item.product_id;

        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after, created_at)
        VALUES (v_item.product_id, 'ADJ_IN', v_item.quantity, p_transaction_id, p_user_id, v_new_stock, v_effective_date);
    END LOOP;

    UPDATE public.sales SET status = 'voided' WHERE id = p_transaction_id;

    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, metadata, created_at)
    VALUES (p_user_id, 'sales', p_transaction_id, 'VOID', jsonb_build_object('reason', p_reason), v_effective_date);

    RETURN jsonb_build_object('success', true);
END;
$function$;



DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_transaction RECORD;
    v_result JSONB;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date, v_transaction.store_id);

    SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NOT_FOUND'; END IF;
    IF v_transaction.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin')) THEN
        RAISE EXCEPTION 'ERR_PERMISSION_DENIED';
    END IF;

    -- Marcar como voided con la fecha efectiva
    UPDATE transactions
    SET status = 'voided',
        notes = COALESCE(notes, '') || ' | VOID: ' || p_reason,
        updated_at = v_effective_date,
        cancelled_at = v_effective_date
    WHERE id = p_transaction_id;

    -- Registrar movimientos de stock de reversión con fecha efectiva
    INSERT INTO stock_movements (product_id, store_id, quantity_change, movement_type, reference_doc, user_id, movement_date, created_at)
    SELECT ti.product_id, v_transaction.store_id, ti.quantity, 'adjustment',
           'VOID-' || p_transaction_id::TEXT, auth.uid(), v_effective_date, v_effective_date
    FROM transaction_items ti WHERE ti.transaction_id = p_transaction_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, created_at)
    VALUES (auth.uid(), 'VOID_TRANSACTION', 'transactions', p_transaction_id,
            to_jsonb(v_transaction),
            jsonb_build_object('status', 'voided', 'reason', p_reason),
            v_effective_date);

    RETURN jsonb_build_object('success', true);
END;
$function$;


