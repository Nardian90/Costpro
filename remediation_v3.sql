-- AUDIT V3.0 REMEDIATION PATCH
BEGIN;

-- 1. UNIFY WAC SOURCE OF TRUTH (cost_average)
CREATE OR REPLACE FUNCTION public.update_product_wac()
RETURNS TRIGGER AS $$
DECLARE
    v_current_stock NUMERIC;
    v_current_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    -- CRITICAL: Lock the product row FOR UPDATE
    -- Using cost_average as the canonical WAC
    SELECT stock_current, cost_average INTO v_current_stock, v_current_cost
    FROM public.products
    WHERE id = NEW.product_id
    FOR UPDATE;

    v_current_stock := COALESCE(v_current_stock, 0);
    v_current_cost := COALESCE(v_current_cost, 0);

    v_new_stock := v_current_stock + NEW.quantity;

    IF v_new_stock > 0 THEN
        -- WAC formula: (current_value + incoming_value) / total_stock
        v_new_cost := ((v_current_stock * v_current_cost) + (NEW.quantity * NEW.unit_cost)) / v_new_stock;
    ELSE
        v_new_cost := NEW.unit_cost;
    END IF;

    UPDATE public.products
    SET cost_average = v_new_cost,
        updated_at = NOW()
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. ENHANCED CREATE_SALE V3.0 (Mixed Payments + Per-item Discounts)
CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_subtotal numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_items jsonb,
  p_applied_taxes jsonb DEFAULT '[]'::jsonb,
  p_tax_amount numeric DEFAULT 0,
  p_transaction_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_units_to_deduct integer;
  v_current_stock integer;
  v_product_name text;
  v_idempotent_res JSONB;
  v_cash_total numeric := 0;
  v_transfer_total numeric := 0;
  v_tenant_id uuid;
BEGIN
  -- Idempotency Check
  IF p_transaction_id IS NOT NULL THEN
      SELECT response_data INTO v_idempotent_res FROM public.idempotency_keys WHERE id = p_transaction_id;
      IF FOUND THEN RETURN (v_idempotent_res->>'id')::UUID; END IF;
  END IF;

  -- RBAC
  IF NOT (public.is_admin() OR public.has_role('clerk')) THEN
    RAISE EXCEPTION 'Access Denied: Required role Clerk or Admin';
  END IF;

  -- Store Isolation
  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_store_id;
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Access Denied to Store';
  END IF;

  v_transaction_id := COALESCE(p_transaction_id, gen_random_uuid());

  -- Calculate totals from items if mixed
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_cash_total := v_cash_total + COALESCE((v_item->>'cash_paid')::numeric, 0);
    v_transfer_total := v_transfer_total + COALESCE((v_item->>'transfer_paid')::numeric, 0);
  END LOOP;

  -- If not mixed, set totals based on payment method
  IF p_payment_method = 'cash' THEN
    v_cash_total := p_total_amount;
    v_transfer_total := 0;
  ELSIF p_payment_method = 'transfer' OR p_payment_method = 'card' THEN
    v_cash_total := 0;
    v_transfer_total := p_total_amount;
  END IF;

  -- Deterministic Locking
  FOR v_product_id IN
    SELECT DISTINCT (elem->>'product_id')::uuid FROM jsonb_array_elements(p_items) as elem ORDER BY 1
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

    SELECT quantity INTO v_current_stock FROM public.inventory
    WHERE store_id = p_store_id AND product_id = v_product_id FOR UPDATE;

    SELECT SUM((elem->>'quantity')::integer) INTO v_units_to_deduct
    FROM jsonb_array_elements(p_items) as elem
    WHERE (elem->>'product_id')::uuid = v_product_id;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: % (Disponible: %, Requerido: %)',
        COALESCE(v_product_name, 'Producto desconocido'), COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;
  END LOOP;

  -- Insert Transaction
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, subtotal, discount_type, discount_value,
    payment_method, status, tax_amount, applied_taxes, tenant_id, cash_amount, transfer_amount
  ) VALUES (
    v_transaction_id, p_store_id, p_seller_id, p_total_amount, p_subtotal,
    p_discount_type::public.discount_type_enum, p_discount_value,
    p_payment_method::public.payment_method_enum, 'completed'::public.transaction_status,
    p_tax_amount, p_applied_taxes, v_tenant_id, v_cash_total, v_transfer_total
  );

  -- Insert Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_units_to_deduct := (v_item->>'quantity')::integer;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, quantity, price_at_sale, cost_at_sale,
      discount_type, discount_value, cash_paid, transfer_paid
    ) VALUES (
      v_transaction_id, v_product_id, v_units_to_deduct,
      (v_item->>'price')::numeric, (v_item->>'cost')::numeric,
      (v_item->>'discount_type')::public.discount_type_enum,
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'cash_paid')::numeric, 0),
      COALESCE((v_item->>'transfer_paid')::numeric, 0)
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_user_id := p_seller_id,
      p_quantity := -v_units_to_deduct,
      p_movement_type := 'sale',
      p_reason := 'Venta #' || substring(v_transaction_id::text from 1 for 8),
      p_sale_id := v_transaction_id,
      p_unit_cost := COALESCE((v_item->>'cost')::numeric, 0)
    );
  END LOOP;

  -- Idempotency Log
  IF p_transaction_id IS NOT NULL THEN
      INSERT INTO public.idempotency_keys (id, user_id, request_path, payload_hash, response_data, status)
      VALUES (p_transaction_id, auth.uid(), 'create_sale', '', jsonb_build_object('id', v_transaction_id), 'completed');
  END IF;

  PERFORM public.log_audit_event('CREATE_SALE', jsonb_build_object('sale_id', v_transaction_id, 'total', p_total_amount), p_store_id);

  RETURN v_transaction_id;
END;
$$;

-- 3. UPDATED LOG_AUDIT_EVENT (Deterministic Chaining)
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_payload JSONB,
    p_store_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_prev_hash TEXT;
    v_payload_hash TEXT;
    v_event_hash TEXT;
    v_event_id UUID;
    v_tenant_id UUID;
    v_role TEXT;
    v_timestamp TIMESTAMPTZ;
BEGIN
    v_timestamp := (now() AT TIME ZONE 'utc');
    SELECT tenant_id, role::text INTO v_tenant_id, v_role FROM public.profiles WHERE id = auth.uid();

    -- Get most recent event for this tenant/store to link the chain
    SELECT event_hash INTO v_prev_hash
    FROM public.audit_events
    ORDER BY utc_timestamp DESC, id DESC LIMIT 1;

    v_payload_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
    -- Chaining formula: SHA256(payload_hash + previous_hash + timestamp)
    v_event_hash := encode(extensions.digest(v_payload_hash || COALESCE(v_prev_hash, '') || v_timestamp::text, 'sha256'), 'hex');

    INSERT INTO public.audit_events (
        actor_id, role, tenant_id, store_id, action, payload_hash, previous_event_hash, event_hash, utc_timestamp
    ) VALUES (
        auth.uid(), v_role, v_tenant_id, p_store_id, p_action, v_payload_hash, v_prev_hash, v_event_hash, v_timestamp
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 4. VERIFY_AUDIT_CHAIN Implementation
CREATE OR REPLACE FUNCTION public.verify_audit_chain()
RETURNS JSONB AS $$
DECLARE
    v_event RECORD;
    v_prev_hash TEXT := NULL;
    v_calculated_hash TEXT;
    v_errors JSONB := '[]'::jsonb;
    v_count INTEGER := 0;
BEGIN
    FOR v_event IN SELECT * FROM public.audit_events ORDER BY utc_timestamp ASC, id ASC LOOP
        -- Recalculate hash using stored timestamp
        v_calculated_hash := encode(extensions.digest(v_event.payload_hash || COALESCE(v_prev_hash, '') || v_event.utc_timestamp::text, 'sha256'), 'hex');

        IF v_event.event_hash != v_calculated_hash THEN
            v_errors := v_errors || jsonb_build_object(
                'event_id', v_event.id,
                'error', 'Hash mismatch',
                'expected', v_calculated_hash,
                'found', v_event.event_hash
            );
        END IF;

        IF v_event.previous_event_hash IS DISTINCT FROM v_prev_hash THEN
             v_errors := v_errors || jsonb_build_object(
                'event_id', v_event.id,
                'error', 'Chain broken',
                'expected_prev', v_prev_hash,
                'found_prev', v_event.previous_event_hash
            );
        END IF;

        v_prev_hash := v_event.event_hash;
        v_count := v_count + 1;
    END LOOP;

    IF jsonb_array_length(v_errors) > 0 THEN
        RETURN jsonb_build_object('status', 'error', 'count', v_count, 'errors', v_errors);
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'verified_events', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 5. REGISTER_RECEPTION Idempotency Fix
CREATE OR REPLACE FUNCTION public.register_reception(
    p_store_id UUID,
    p_supplier TEXT,
    p_reception_date DATE,
    p_invoice_number TEXT,
    p_items JSONB,
    p_transaction_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_reception_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_unit_cost NUMERIC;
    v_total_cost NUMERIC := 0;
    v_user_id UUID;
    v_idempotent_res JSONB;
BEGIN
    -- Idempotency
    IF p_transaction_id IS NOT NULL THEN
        SELECT response_data INTO v_idempotent_res FROM public.idempotency_keys WHERE id = p_transaction_id;
        IF FOUND THEN RETURN (v_idempotent_res->>'id')::UUID; END IF;
    END IF;

    -- RBAC
    IF NOT (public.is_admin() OR public.has_role('warehouse')) THEN
        RAISE EXCEPTION 'Access Denied: Required role Warehouse or Admin';
    END IF;

    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    IF NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'Invalid store_id for user';
    END IF;

    v_reception_id := COALESCE(p_transaction_id, gen_random_uuid());

    -- Deterministic Locking
    FOR v_product_id IN
        SELECT DISTINCT (elem->>'product_id')::uuid FROM jsonb_array_elements(p_items) as elem ORDER BY 1
    LOOP
        PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;
    END LOOP;

    INSERT INTO public.receipts (
        id, user_id, total_cost, reference_doc, created_at, status, store_id, supplier, reception_date, tenant_id
    ) VALUES (
        v_reception_id, v_user_id, 0, FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)), now(), 'active', p_store_id, p_supplier, p_reception_date, (SELECT tenant_id FROM public.stores WHERE id = p_store_id)
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_reception_id, v_product_id, v_quantity, v_unit_cost, now());

        PERFORM public.register_stock_movement(
            p_store_id := p_store_id,
            p_product_id := v_product_id,
            p_variant_id := NULL,
            p_quantity := v_quantity::integer,
            p_movement_type := 'purchase',
            p_reason := 'Factura: ' || p_invoice_number,
            p_user_id := v_user_id,
            p_unit_cost := v_unit_cost,
            p_sale_id := v_reception_id
        );

        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_reception_id;

    -- Idempotency Log
    IF p_transaction_id IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (id, user_id, request_path, payload_hash, response_data, status)
        VALUES (p_transaction_id, v_user_id, 'register_reception', '', jsonb_build_object('id', v_reception_id), 'completed');
    END IF;

    PERFORM public.log_audit_event('REGISTER_RECEPTION', jsonb_build_object('id', v_reception_id, 'total', v_total_cost), p_store_id);

    RETURN v_reception_id;
END;
$$;

-- 6. SECURITY: ENFORCE RLS ON CRITICAL TABLES
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Deny direct writes to audit_events (system only)
DROP POLICY IF EXISTS "Deny direct writes to audit_events" ON public.audit_events;
CREATE POLICY "Deny direct writes to audit_events" ON public.audit_events
FOR INSERT WITH CHECK (false);

COMMIT;

-- 7. CONSISTENT TRANSFERS WITH IDEMPOTENCY
CREATE OR REPLACE FUNCTION public.create_transfer(
    p_origin_store_id UUID,
    p_destination_store_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL,
    p_transaction_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer_id UUID;
    v_item RECORD;
    v_idempotent_res JSONB;
BEGIN
    IF p_transaction_id IS NOT NULL THEN
        SELECT response_data INTO v_idempotent_res FROM public.idempotency_keys WHERE id = p_transaction_id;
        IF FOUND THEN RETURN (v_idempotent_res->>'id')::UUID; END IF;
    END IF;

    IF NOT public.has_store_access(p_origin_store_id) THEN
        RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
    END IF;

    v_transfer_id := COALESCE(p_transaction_id, gen_random_uuid());

    INSERT INTO public.transfers (id, origin_store_id, destination_store_id, created_by, notes, tenant_id)
    VALUES (v_transfer_id, p_origin_store_id, p_destination_store_id, auth.uid(), p_notes, (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id));

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER, unit_cost NUMERIC)
    LOOP
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost);
    END LOOP;

    IF p_transaction_id IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (id, user_id, request_path, payload_hash, response_data, status)
        VALUES (p_transaction_id, auth.uid(), 'create_transfer', '', jsonb_build_object('id', v_transfer_id), 'completed');
    END IF;

    PERFORM public.log_audit_event('CREATE_TRANSFER', jsonb_build_object('transfer_id', v_transfer_id), p_origin_store_id);

    RETURN v_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id UUID, p_user_id UUID, p_transaction_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product RECORD;
    v_stock_actual_dest INTEGER;
    v_costo_total_actual_dest NUMERIC;
    v_nuevo_stock_dest INTEGER;
    v_nuevo_costo_total_dest NUMERIC;
    v_nuevo_costo_unitario_dest NUMERIC;
    v_idempotent_res JSONB;
BEGIN
    IF p_transaction_id IS NOT NULL THEN
        SELECT response_data INTO v_idempotent_res FROM public.idempotency_keys WHERE id = p_transaction_id;
        IF FOUND THEN RETURN v_idempotent_res; END IF;
    END IF;

    IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Permisos insuficientes');
    END IF;

    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'message', 'Transferencia no encontrada'); END IF;
    IF v_transfer.status != 'PENDIENTE' THEN RETURN jsonb_build_object('status', 'error', 'message', 'La transferencia ya ha sido procesada'); END IF;

    IF NOT (public.has_store_access(v_transfer.origin_store_id) AND public.has_store_access(v_transfer.destination_store_id)) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Sin acceso a las tiendas involucradas');
    END IF;

    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id ORDER BY product_id) LOOP
        SELECT * INTO v_dest_product FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
        AND store_id = v_transfer.destination_store_id
        FOR UPDATE;

        IF v_dest_product.id IS NULL THEN RAISE EXCEPTION 'SKU % no existe en destino', v_item.product_id; END IF;

        SELECT COALESCE(quantity, 0) INTO v_stock_actual_dest
        FROM public.inventory WHERE store_id = v_transfer.destination_store_id AND product_id = v_dest_product.id FOR UPDATE;

        v_costo_total_actual_dest := v_stock_actual_dest * COALESCE(v_dest_product.cost_average, 0);
        v_nuevo_stock_dest := v_stock_actual_dest + v_item.quantity;
        v_nuevo_costo_total_dest := v_costo_total_actual_dest + (v_item.quantity * v_item.unit_cost);
        v_nuevo_costo_unitario_dest := CASE WHEN v_nuevo_stock_dest > 0 THEN v_nuevo_costo_total_dest / v_nuevo_stock_dest ELSE 0 END;

        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id, p_store_id := v_transfer.origin_store_id, p_user_id := p_user_id,
            p_quantity := -v_item.quantity, p_movement_type := 'transfer_out', p_reason := 'Transferencia ' || v_transfer.id,
            p_unit_cost := v_item.unit_cost
        );

        PERFORM public.register_stock_movement(
            p_product_id := v_dest_product.id, p_store_id := v_transfer.destination_store_id, p_user_id := p_user_id,
            p_quantity := v_item.quantity, p_movement_type := 'transfer_in', p_reason := 'Transferencia ' || v_transfer.id,
            p_unit_cost := v_item.unit_cost
        );

        UPDATE public.products SET cost_average = v_nuevo_costo_unitario_dest, updated_at = now() WHERE id = v_dest_product.id;
    END LOOP;

    UPDATE public.transfers SET status = 'CONFIRMADA', updated_at = now() WHERE id = p_transfer_id;

    v_idempotent_res := jsonb_build_object('status', 'ok', 'message', 'Transferencia confirmada');

    IF p_transaction_id IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (id, user_id, request_path, payload_hash, response_data, status)
        VALUES (p_transaction_id, p_user_id, 'confirm_transfer', '', v_idempotent_res, 'completed');
    END IF;

    PERFORM public.log_audit_event('CONFIRM_TRANSFER', jsonb_build_object('transfer_id', p_transfer_id), v_transfer.destination_store_id);

    RETURN v_idempotent_res;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb, jsonb, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, date, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain() TO authenticated;

COMMIT;
