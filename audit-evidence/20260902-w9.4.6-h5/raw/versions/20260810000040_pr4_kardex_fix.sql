-- ============================================================================
-- PR-4.3 — Fix productivo: trigger CASE + eliminar double-writers + devolución + REVOKE
-- ============================================================================
-- NO toca datos históricos. NO elimina duplicados. NO modifica movement_type existentes.
-- Solo cambia comportamiento futuro.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- A. Actualizar trigger auto_kardex_on_stock_movement — CASE map
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id UUID;
    v_movement_type TEXT;
    v_qty NUMERIC;
    v_unit_cost NUMERIC;
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
    IF v_store_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- PR-4.3: CASE map actualizado con los 3 valores faltantes
    v_movement_type := CASE
        WHEN NEW.movement_type IN ('sale', 'void', 'sale_void') THEN 'out'
        WHEN NEW.movement_type IN ('purchase', 'initial') THEN 'in'
        WHEN NEW.movement_type = 'adjustment' THEN 'adjustment'
        WHEN NEW.movement_type = 'return' THEN 'devolution_in'
        WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
        WHEN NEW.movement_type IN ('transfer', 'transfer_out') THEN 'transfer_out'
        WHEN NEW.movement_type IN ('production_in', 'production_out') THEN 'adjustment'
        -- PR-4.3: nuevos branches para reverse types
        WHEN NEW.movement_type = 'purchase_reverse' THEN 'purchase_reverse'
        WHEN NEW.movement_type = 'sale_reverse' THEN 'sale_reverse'
        WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'
        ELSE 'adjustment'
    END;

    v_qty := ABS(NEW.quantity_change);
    v_unit_cost := COALESCE(NEW.unit_cost, 0);

    INSERT INTO public.kardex_entries (
        store_id, product_id, movement_type, quantity, unit_cost, total_value,
        balance_quantity, balance_unit_cost, balance_total_value,
        reference_type, reference_id, reference_description, created_by
    )
    SELECT
        v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
        p.stock_current, p.cost_average, p.stock_current * p.cost_average,
        'stock_movement', NEW.id, COALESCE(NEW.reference_doc, NEW.movement_type), NEW.created_by
    FROM public.products p
    WHERE p.id = NEW.product_id;

    RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- B. Eliminar INSERT directos a kardex_entries de los 4 double-writers
-- ════════════════════════════════════════════════════════════════════════════

-- B1. reverse_receipt_v2 — eliminar INSERT directo a kardex (líneas 312-320 del PR-2)
-- El trigger ya genera la kardex entry con el costo CUP correcto via register_stock_movement
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

-- B2. reverse_transaction_v2 — eliminar INSERT directo a kardex
CREATE OR REPLACE FUNCTION public.reverse_transaction_v2(
  p_transaction_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_units_to_restore numeric;
  v_total_restored numeric := 0;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  IF v_tx.status = 'voided' THEN
    RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
  END IF;

  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only completed transactions can be reversed (status=%)', v_tx.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT ti.product_id, ti.quantity, ti.cost_at_sale
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_transaction_id AND ti.product_id IS NOT NULL
  LOOP
    v_units_to_restore := v_item.quantity;

    -- register_stock_movement genera el stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_reverse'::text,
      p_sale_id := p_transaction_id,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Reverso de venta'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO

    v_total_restored := v_total_restored + v_units_to_restore;
  END LOOP;

  UPDATE public.transactions
  SET status = 'voided',
      updated_at = NOW()
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_TRANSACTION_V2', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'units_restored', v_total_restored
  );
END;
$function$;

-- B3. create_devolution_v2 — eliminar INSERT directo + usar cost_at_sale
CREATE OR REPLACE FUNCTION public.create_devolution_v2(
  p_store_id uuid,
  p_items jsonb,
  p_reason text DEFAULT 'Devolución',
  p_user_id uuid DEFAULT NULL,
  p_original_transaction_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_devolution_id uuid := gen_random_uuid();
  v_dev_number text;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost_at_sale numeric;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT next_document_number('credit_note') INTO v_dev_number;

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes,
    processed_by, idempotency_key, created_at
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
    -- El trigger ahora genera la kardex con el costo correcto (v_devolution_cost)
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total
  );
END;
$function$;

-- B4. duplicate_inventory_adjustment_v2 — eliminar INSERT directo a kardex
CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment_v2(
  p_original_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_new_id uuid;
  v_diff numeric;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  INSERT INTO public.inventory_adjustments (store_id, adjustment_type, reason, status, created_by)
  VALUES (v_original.store_id, v_original.adjustment_type, 'Duplicación: ' || v_original.reason, 'confirmed', v_caller_uid)
  RETURNING id INTO v_new_id;

  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_original_id
  LOOP
    v_diff := v_item.expected_qty - v_item.counted_qty;
    IF v_diff = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_qty, counted_qty, difference)
    VALUES (v_new_id, v_item.product_id, v_item.expected_qty, v_item.counted_qty, v_diff);

    -- register_stock_movement genera stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_new_id,
      p_unit_cost := 0,
      p_reason := 'Duplicación de ajuste'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
  END LOOP;

  RETURN jsonb_build_object('status', 'success', 'new_adjustment_id', v_new_id);
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- D. REVOKE EXECUTE FROM authenticated en void_reception_with_reversal
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone) FROM authenticated;
