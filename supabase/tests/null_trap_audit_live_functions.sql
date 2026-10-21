CREATE OR REPLACE FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_cash_amount numeric DEFAULT NULL::numeric, p_transfer_amount numeric DEFAULT NULL::numeric, p_zelle_amount numeric DEFAULT NULL::numeric, p_sale_currency text DEFAULT NULL::text, p_sale_exchange_rate numeric DEFAULT NULL::numeric, p_items_price_adjustments jsonb DEFAULT NULL::jsonb, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_old_data JSONB;
  v_new_data JSONB;
  v_old_items JSONB;
  v_new_items JSONB;
  v_items_changed BOOLEAN := FALSE;
  v_payment_changed BOOLEAN := FALSE;
  v_new_subtotal NUMERIC := 0;
  v_new_total NUMERIC := 0;
  v_price_adj JSONB;
  v_adj_product_id UUID;
  v_adj_price NUMERIC;
  v_adj_price_cup NUMERIC;
  v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- V2.12.9 anti-spoofing
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar transacción
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  -- Verificar acceso a la store
  IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- No permitir ajustar ventas ya anuladas o reversadas
  IF v_tx.status IN ('voided', 'reversed', 'cancelled') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
  END IF;

  -- Snapshot BEFORE (transacción + items)
  SELECT jsonb_build_object(
    'total_amount', v_tx.total_amount,
    'subtotal', v_tx.subtotal,
    'payment_method', v_tx.payment_method,
    'cash_amount', v_tx.cash_amount,
    'transfer_amount', v_tx.transfer_amount,
    'zelle_amount', v_tx.zelle_amount,
    'sale_currency', v_tx.sale_currency,
    'sale_exchange_rate', v_tx.sale_exchange_rate,
    'discount_type', v_tx.discount_type,
    'discount_value', v_tx.discount_value
  ) INTO v_old_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_old_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_old_data := v_old_data || jsonb_build_object('items', v_old_items);

  -- 1. Ajustar payment_method si se proporciona
  IF p_payment_method IS NOT NULL AND p_payment_method <> v_tx.payment_method::text THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'payment_method');
  END IF;

  -- 2. Ajustar montos de pago
  IF p_cash_amount IS NOT NULL AND p_cash_amount <> COALESCE(v_tx.cash_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'cash_amount');
  END IF;
  IF p_transfer_amount IS NOT NULL AND p_transfer_amount <> COALESCE(v_tx.transfer_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'transfer_amount');
  END IF;
  IF p_zelle_amount IS NOT NULL AND p_zelle_amount <> COALESCE(v_tx.zelle_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'zelle_amount');
  END IF;
  IF p_sale_currency IS NOT NULL AND p_sale_currency <> v_tx.sale_currency THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_currency');
  END IF;
  IF p_sale_exchange_rate IS NOT NULL AND p_sale_exchange_rate <> v_tx.sale_exchange_rate THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_exchange_rate');
  END IF;
  IF p_discount_type IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_type');
  END IF;
  IF p_discount_value IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_value');
  END IF;

  -- 3. Ajustar precios de items (price_at_sale)
  IF p_items_price_adjustments IS NOT NULL THEN
    FOR v_price_adj IN SELECT * FROM jsonb_array_elements(p_items_price_adjustments)
    LOOP
      v_adj_product_id := (v_price_adj->>'product_id')::UUID;
      v_adj_price := (v_price_adj->>'price_at_sale')::NUMERIC;

      -- Validar: NO permitir cambiar quantity o cost_at_sale
      IF (v_price_adj ? 'quantity') OR (v_price_adj ? 'cost_at_sale') THEN
        RAISE EXCEPTION 'ERR_IMMUTABLE_FIELD: quantity y cost_at_sale no son ajustables (NIC 2)';
      END IF;

      -- Cargar item actual para validar que existe y obtener currency
      SELECT * INTO v_item FROM public.transaction_items
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: product_id=% no está en la transacción', v_adj_product_id;
      END IF;

      IF v_adj_price < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale no puede ser negativo';
      END IF;

      -- Recalcular price_at_sale_cup basado en sale_currency/exchange_rate
      v_adj_price_cup := CASE
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = v_item.price_currency THEN v_adj_price
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'CUP' AND v_item.price_currency = 'USD' THEN v_adj_price * COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'USD' AND v_item.price_currency = 'CUP' THEN v_adj_price / COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        ELSE v_adj_price
      END;

      UPDATE public.transaction_items
        SET price_at_sale = v_adj_price,
            price_at_sale_cup = v_adj_price_cup
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id;

      v_items_changed := TRUE;
      v_changes := array_append(v_changes, 'item_price:' || v_adj_product_id);
    END LOOP;
  END IF;

  -- 4. Recalcular subtotal y total_amount desde items (si se ajustaron precios)
  IF v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    SELECT COALESCE(SUM(price_at_sale_cup * quantity), 0) INTO v_new_subtotal
      FROM public.transaction_items WHERE transaction_id = p_transaction_id;

    -- Aplicar descuento
    DECLARE
      v_disc_type TEXT := COALESCE(p_discount_type, v_tx.discount_type::text, 'fixed');
      v_disc_val NUMERIC := COALESCE(p_discount_value, v_tx.discount_value, 0);
    BEGIN
      IF v_disc_type = 'percentage' THEN
        v_new_total := v_new_subtotal * (1 - (v_disc_val / 100.0));
      ELSE
        v_new_total := v_new_subtotal - v_disc_val;
      END IF;
      v_new_total := GREATEST(v_new_total, 0);
    END;
  ELSE
    v_new_subtotal := v_tx.subtotal;
    v_new_total := v_tx.total_amount;
  END IF;

  -- 5. Aplicar cambios de payment (si hay)
  IF v_payment_changed OR v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    UPDATE public.transactions
      SET
        payment_method = COALESCE(p_payment_method::public.payment_method_enum, payment_method),
        cash_amount = COALESCE(p_cash_amount, cash_amount),
        transfer_amount = COALESCE(p_transfer_amount, transfer_amount),
        zelle_amount = COALESCE(p_zelle_amount, zelle_amount),
        sale_currency = COALESCE(p_sale_currency, sale_currency),
        sale_exchange_rate = COALESCE(p_sale_exchange_rate, sale_exchange_rate),
        discount_type = COALESCE(p_discount_type::public.discount_type_enum, discount_type),
        discount_value = COALESCE(p_discount_value, discount_value),
        subtotal = v_new_subtotal,
        total_amount = v_new_total,
        updated_at = NOW()
      WHERE id = p_transaction_id;
  END IF;

  -- 6. Snapshot AFTER
  SELECT jsonb_build_object(
    'total_amount', v_new_total,
    'subtotal', v_new_subtotal,
    'payment_method', COALESCE(p_payment_method, v_tx.payment_method::text),
    'cash_amount', COALESCE(p_cash_amount, v_tx.cash_amount),
    'transfer_amount', COALESCE(p_transfer_amount, v_tx.transfer_amount),
    'zelle_amount', COALESCE(p_zelle_amount, v_tx.zelle_amount),
    'sale_currency', COALESCE(p_sale_currency, v_tx.sale_currency),
    'sale_exchange_rate', COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate),
    'discount_type', COALESCE(p_discount_type, v_tx.discount_type::text),
    'discount_value', COALESCE(p_discount_value, v_tx.discount_value)
  ) INTO v_new_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_new_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_new_data := v_new_data || jsonb_build_object('items', v_new_items);

  -- 7. Audit log (V2.12.17 — trazabilidad NIIF 15 + IAS 8)
  INSERT INTO public.audit_logs (
    action, table_name, record_id, store_id, user_id,
    old_data, new_data, metadata
  )
  VALUES (
    CASE WHEN v_items_changed THEN 'SALE_PRICE_ADJUST' ELSE 'SALE_PAYMENT_ADJUST' END,
    'transactions',
    p_transaction_id,
    v_tx.store_id,
    v_caller_uid,
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'changes', to_jsonb(v_changes),
      'reason', p_reason,
      'items_changed', v_items_changed,
      'payment_changed', v_payment_changed,
      'adjustment_timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'old_total', v_tx.total_amount,
    'new_total', v_new_total,
    'changes', to_jsonb(v_changes),
    'audit_logged', TRUE
  );
END;
$function$;
;
CREATE OR REPLACE FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_rule RECORD;
  v_tenant_id UUID;
  v_has_approver_role BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;

  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
  END IF;

  IF NOT v_transfer.requires_approval THEN
    RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
  END IF;

  IF v_transfer.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_APPROVED';
  END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el caller tiene rol de aprobador
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = v_transfer.origin_store_id;

    SELECT * INTO v_rule FROM public.transfer_approval_rules
    WHERE is_active = true
      AND (
        (store_id = v_transfer.origin_store_id) OR
        (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
      )
      ORDER BY store_id NULLS LAST
      LIMIT 1;

    IF v_rule.id IS NOT NULL THEN
      v_has_approver_role := v_user_role = ANY(v_rule.approver_roles) OR v_user_role = 'admin';
      IF NOT v_has_approver_role THEN
        RAISE EXCEPTION 'ERR_NOT_APPROVER: tu rol (%) no está autorizado para aprobar (requerido: %)', v_user_role, v_rule.approver_roles;
      END IF;
    END IF;
  END IF;

  -- Marcar como aprobada
  UPDATE public.transfers
    SET approved_by = v_caller_uid,
        approved_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'approved_by', v_caller_uid,
    'approved_at', NOW()
  );
END;
$function$;
;
CREATE OR REPLACE FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL::text, p_final_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_output_product_id uuid DEFAULT NULL::uuid, p_output_quantity numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
  -- ─── 0. Idempotencia — DF-08 FIX: record_id = p_order_id (uuid=uuid, sin ::text) ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
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

  -- ─── 2. Idempotencia de estado ───
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

  -- PATH A: PRODUCCIÓN → receive consolidado (paquetes 01/03: server-side)
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

  -- PATH B: SERVICIO
  ELSIF v_order.order_type = 'service' THEN
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

    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
    );

    UPDATE public.payment_transactions
      SET transaction_id = v_transaction_id
      WHERE ref_type IN ('production_order', 'work')
        AND ref_id = p_order_id
        AND transaction_id IS NULL;

    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_transaction_id;

    IF v_sum_payments > v_order.budget_total + 0.01 THEN
      RAISE EXCEPTION 'ERR_OT_OVERPAID: payments=% > budget_total=%', v_sum_payments, v_order.budget_total;
    END IF;

    IF ABS(v_sum_payments - v_order.budget_total) > 0.01 THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'OT_SALDO_PENDING', 'transactions', v_transaction_id, v_order.store_id, v_caller_uid,
        jsonb_build_object('order_id', p_order_id, 'budget_total', v_order.budget_total,
          'sum_payments_cup', v_sum_payments, 'saldo', v_order.budget_total - v_sum_payments)
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
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id),
      'df08_uuid_fix', true
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'transaction_id', v_transaction_id
  );
END $function$;


-- @contract-function name=close_service_order_as_sale args="p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_current_status text;
BEGIN
  -- ─── 1. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 3. Idempotencia: si ya está closed con transaction, retornar ───
  IF v_order.status = 'closed' AND v_order.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_closed', 'transaction_id', v_order.transaction_id);
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- ─── 4. Calcular desglose de pagos ───
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  v_effective_method := p_payment_method;
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

  -- ─── 5. Crear venta ───
  INSERT INTO transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at, completed_at,
    customer_name, customer_phone, customer_ci, customer_address,
    subtotal, cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    v_effective_method::public.payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(), now(),
    v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
    v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
  ) RETURNING id INTO v_transaction_id;

  -- ─── 6. Crear item de venta — cost_at_sale = 0 (regla congelada: servicios no tienen WAC) ───
  INSERT INTO transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- ─── 7. Transición de estados (inline, no sub-LLamada) ───
  SELECT status INTO v_current_status FROM production_orders WHERE id = p_order_id;

  IF v_current_status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_current_status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'PRODUCTION_CLOSED_AS_SALE', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'transaction_id', v_transaction_id,
      'budget_total', v_order.budget_total,
      'cost_at_sale', 0,
      'effective_method', v_effective_method
    )
  );

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id);
END;
$function$;
;
CREATE OR REPLACE FUNCTION public.reset_store_data(target_store_id uuid, p_keep_catalog boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_validation JSONB;
  v_blockers TEXT;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- SECURITY H2: require management role (admin/manager/encargado) for destructive ops
  IF NOT public.has_management_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_MANAGEMENT_ACCESS_REQUIRED: reset requires admin/manager/encargado role';
  END IF;

  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(target_store_id, 'reset');
  IF NOT (v_validation->>'can_modify')::boolean THEN
    SELECT string_agg(blocker->>'message', '; ')
    INTO v_blockers
    FROM jsonb_array_elements(v_validation->'blockers') AS blocker
    WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions');
    IF v_blockers IS NOT NULL AND v_blockers != '' THEN
      RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', v_blockers;
    END IF;
  END IF;

  -- Enable restore_mode locally so that triggers with bypass pattern allow DELETEs.
  -- This is the canonical pattern for maintenance RPCs (see restore_transaction_snapshot).
  -- The setting is LOCAL to this transaction and does NOT affect other sessions.
  PERFORM set_config('app.restore_mode', 'true', true);

  -- ── 1. Borrar TODAS las tablas operacionales ──

  -- FIX: payment_transactions FIRST (FK ON DELETE RESTRICT to transactions)
  DELETE FROM payment_transactions WHERE store_id = target_store_id;

  -- Hijas de transactions (now safe — payment_transactions already deleted)
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- Hijas de receipts
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- Devoluciones
  DELETE FROM devolution_items WHERE devolution_id IN (
    SELECT id FROM devolutions WHERE store_id = target_store_id
  );
  DELETE FROM devolutions WHERE store_id = target_store_id;

  -- Cotizaciones
  DELETE FROM quotation_items WHERE quotation_id IN (
    SELECT id FROM quotations WHERE store_id = target_store_id
  );
  DELETE FROM quotations WHERE store_id = target_store_id;

  -- Clientes
  DELETE FROM customers WHERE store_id = target_store_id;

  -- Bancos
  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
    SELECT id FROM bank_statements WHERE store_id = target_store_id
  );
  DELETE FROM bank_statements WHERE store_id = target_store_id;

  -- Kardex
  DELETE FROM kardex_entries WHERE store_id = target_store_id;

  -- Conteos físicos
  DELETE FROM physical_count_items WHERE count_id IN (
    SELECT id FROM physical_counts WHERE store_id = target_store_id
  );
  DELETE FROM physical_counts WHERE store_id = target_store_id;

  -- Stock movements
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- Cash
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  DELETE FROM cash_sessions WHERE store_id = target_store_id;
  DELETE FROM cash_movements WHERE store_id = target_store_id;
  DELETE FROM cash_register_sessions WHERE store_id = target_store_id;

  -- Inventory adjustments
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;

  -- Transfers
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;
  DELETE FROM transfer_approval_rules WHERE store_id = target_store_id;

  -- Purchase orders
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- Production orders
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- Workers + commissions
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;

  -- Sales transactions (legacy table if exists)
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;

  -- Exchange rates
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- V4-2 fix: NULLificar category_id antes de borrar categories
  UPDATE products SET category_id = NULL WHERE store_id = target_store_id;
  DELETE FROM suppliers WHERE store_id = target_store_id;
  DELETE FROM categories WHERE store_id = target_store_id;

  -- Warehouse
  DELETE FROM warehouse_stock WHERE store_id = target_store_id;
  DELETE FROM warehouses WHERE store_id = target_store_id;

  -- Inventory
  DELETE FROM inventory WHERE store_id = target_store_id;
  DELETE FROM inventory_batches WHERE store_id = target_store_id;
  DELETE FROM inventory_snapshots WHERE store_id = target_store_id;

  -- Analytics
  DELETE FROM abc_classifications WHERE store_id = target_store_id;
  DELETE FROM price_change_history WHERE store_id = target_store_id;
  DELETE FROM price_commit_log WHERE store_id = target_store_id;
  DELETE FROM tax_configurations WHERE store_id = target_store_id;

  -- Services
  DELETE FROM received_services WHERE store_id = target_store_id;
  DELETE FROM service_types WHERE store_id = target_store_id;

  -- Fiscal
  DELETE FROM fiscal_closings WHERE store_id = target_store_id;

  -- Catalog (conditional)
  IF p_keep_catalog THEN
    UPDATE products SET stock_current = 0, cost_average = 0, updated_at = NOW() WHERE store_id = target_store_id;
    DELETE FROM product_lots WHERE store_id = target_store_id;
  ELSE
    DELETE FROM product_lots WHERE store_id = target_store_id;
    DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE store_id = target_store_id);
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    DELETE FROM store_cost_templates WHERE store_id = target_store_id;
    DELETE FROM cost_sheet_templates WHERE store_id = target_store_id;
    DELETE FROM products WHERE store_id = target_store_id;
  END IF;

  -- Messaging
  DELETE FROM whatsapp_messages WHERE store_id = target_store_id;
  DELETE FROM whatsapp_invitations WHERE store_id = target_store_id;
  DELETE FROM whatsapp_contacts WHERE store_id = target_store_id;
  DELETE FROM whatsapp_risk_state WHERE store_id = target_store_id;
  DELETE FROM whatsapp_configs WHERE store_id = target_store_id;
  DELETE FROM telegram_messages WHERE store_id = target_store_id;
  DELETE FROM telegram_invitations WHERE store_id = target_store_id;
  DELETE FROM telegram_contacts WHERE store_id = target_store_id;
  DELETE FROM telegram_configs WHERE store_id = target_store_id;

  -- Notifications + snapshots
  DELETE FROM store_notifications WHERE store_id = target_store_id;
  DELETE FROM store_reset_snapshots WHERE store_id = target_store_id;

  -- Audit
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES ('store_reset_completed', 'stores', target_store_id, target_store_id,
    jsonb_build_object('reset_by', v_caller_uid, 'reset_at', now(), 'keep_catalog', p_keep_catalog));
END;

$function$;
;
CREATE OR REPLACE FUNCTION public.get_cash_flow_summary(
  p_store_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_shift RECORD;
  -- R4: FOUND tras SELECT INTO (la nulidad compuesta de RECORD no sirve:
  -- cash_closures.session_reference es NULL en las filas reales y
  -- `<record> IS NOT NULL` exige TODOS los campos no-nulos ⇒ siempre falso).
  v_has_shift boolean := false;
  v_window_start timestamptz;
  v_opening numeric := 0;
  v_total_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
  v_fondo numeric := 0;
  v_fondo_in numeric := 0;
  v_fondo_out numeric := 0;
  v_from timestamptz;
  v_to timestamptz;
  v_period_in_cup numeric := 0;
  v_period_out_cup numeric := 0;
  v_period_in_cup_cup numeric := 0;
  v_period_in_usd numeric := 0;
  v_period_out_cup_usd numeric := 0;
  v_period_out_usd numeric := 0;
  v_period_in_count integer := 0;
  v_period_out_count integer := 0;
  v_annulled_count integer := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- REM-R2-READ: barrera de autorización (service_role mantiene su capacidad
  -- interna; los humanos necesitan acceso activo a la tienda).
  IF auth.role() <> 'service_role' THEN
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ventana del turno (idéntica a get_cash_shift_expected v2.21.0)
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;
  v_has_shift := FOUND;
  IF v_has_shift THEN
    v_window_start := v_shift.created_at;
    v_opening := COALESCE(v_shift.opening_balance, 0);
  ELSE
    SELECT closed_at INTO v_window_start FROM public.cash_closures
      WHERE store_id = p_store_id AND status = 'cerrado'
      ORDER BY closed_at DESC LIMIT 1;
    v_window_start := COALESCE(v_window_start, '1970-01-01 00:00:00+00'::timestamptz);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(zelle_amount), 0)
    INTO v_total_sales, v_cash_sales, v_transfer_sales, v_zelle_sales
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_window_start AND created_at <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_window_start AND paid_at <= now();

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start AND payment_date <= now();

  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales;

  -- Fondo de cambio vigente (misma definición que create_cash_flow_document)
  SELECT
    COALESCE(SUM(CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN doc_type = 'egreso' THEN amount_cup ELSE 0 END), 0)
    INTO v_fondo_in, v_fondo_out
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_window_start
      AND operation_date <= now();
  v_fondo := v_opening + v_fondo_in - v_fondo_out;

  -- Período solicitado (default: día de negocio Habana en curso)
  v_from := COALESCE(p_date_from, date_trunc('day', now() AT TIME ZONE 'America/Havana') AT TIME ZONE 'America/Havana');
  v_to := COALESCE(p_date_to, v_from + INTERVAL '1 day' - INTERVAL '1 microsecond');

  SELECT
    COALESCE(SUM(CASE WHEN currency = 'CUP' AND doc_type = 'ingreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'CUP' AND doc_type = 'egreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' AND doc_type = 'ingreso' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN currency = 'USD' AND doc_type = 'egreso' THEN amount ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE doc_type = 'ingreso'),
    COUNT(*) FILTER (WHERE doc_type = 'egreso')
    INTO v_period_in_cup, v_period_out_cup, v_period_in_usd, v_period_out_usd,
         v_period_in_count, v_period_out_count
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND operation_date >= v_from AND operation_date <= v_to;

  SELECT COUNT(*) INTO v_annulled_count
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'anulado'
      AND annulled_at >= v_from AND annulled_at <= v_to;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'has_pending_shift', v_has_shift,
    'opening_balance', v_opening,
    'total_sales', v_total_sales,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total,
    'fondo_vigente', v_fondo,
    'fondo_ingresado', v_fondo_in,
    'fondo_devuelto', v_fondo_out,
    'period', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'in_cup', v_period_in_cup,
      'out_cup', v_period_out_cup,
      'in_usd', v_period_in_usd,
      'out_usd', v_period_out_usd,
      'ingresos_count', v_period_in_count,
      'egresos_count', v_period_out_count,
      'annulled_count', v_annulled_count
    )
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_closure_id uuid,
  p_declared_cash numeric,
  p_declared_vouchers numeric,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
BEGIN
  -- 1. SELECT FOR UPDATE + validar status
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'pendiente' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status;
  END IF;

  -- 2. Auth (actor-explícito, sin cambios respecto a v2.18.2)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Advisory lock por store
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- 4. Fórmula v2.21.0 — Efectivo esperado =
  --      Fondo inicial + Entradas de efectivo − Salidas de efectivo
  --    Entradas: ventas cobradas en efectivo (parte cash de ventas mixtas
  --      incluida) + anticipos de órdenes de producción/trabajo en efectivo
  --      + ingresos de caja documentados (fondo de cambio y otros —
  --      ref_type='cash_flow', MISIÓN 2026-10-20).
  --    Salidas: pagos a proveedores en efectivo (recepciones + servicios
  --      recibidos) + comisiones pagadas en efectivo + egresos de caja
  --      documentados (devolución del fondo y otros — ref_type='cash_flow').
  --    NO son efectivo: transferencias y zelle (van a su propio lado del
  --      arqueo); pagos pendientes de documentos (no hay salida de dinero);
  --      cobros de ventas (ref_type='sale') — ya están contados como ventas.
  --    La anulación de un documento inserta fila contraria: el efecto neto
  --      de un documento anulado es CERO en esta fórmula (in + out mismo
  --    importe), sin excluir filas por estado — el ledger siempre manda.

  -- Ventas por canal (columnas de desglose: soportan pago 'mixed')
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Egresos reales de caja — pagos a proveedores en efectivo (recepciones y
  -- servicios recibidos). Excluye ref_type='sale' (cobros de ventas — doble
  -- conteo), 'production_order'/'work' (anticipos = ingresos) y 'commission'.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Anticipos de producción/trabajo EN EFECTIVO son ENTRADAS de caja.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Comisiones SOLO en efectivo.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_closure.created_at
      AND paid_at <= NOW();

  -- MISIÓN 2026-10-20: documentos Ingresos/Egresos de caja (fondo de cambio
  -- y otros autorizados). direction in = entrada de efectivo, out = salida.
  -- Los anulados aportan fila original + fila contra ⇒ neto cero.
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- Calcular totales
  v_system_cash := COALESCE(v_closure.opening_balance, 0)
                 + v_cash_sales + v_cash_production + v_cash_flow_in
                 - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0)) - v_system_expected_total;

  -- 5. UPDATE closure con valores recalculados (R5: sin updated_at — la
  --    tabla cash_closures NO tiene esa columna; v2.18.0 vivo la referenciaba
  --    y el cierre de turno rebotaba en runtime desde 2026-10-10)
  UPDATE public.cash_closures SET
    status = 'cerrado',
    closed_at = NOW(),
    declared_cash = p_declared_cash,
    declared_vouchers = p_declared_vouchers,
    declared_total = COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0),
    system_expected_total = v_system_expected_total,
    difference = v_difference,
    notes = p_notes
  WHERE id = p_closure_id;

  -- 6. Audit log atómico
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_closure.store_id, 'CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id,
    jsonb_build_object(
      'system_cash', v_system_cash,
      'expected_total', v_system_expected_total,
      'difference', v_difference,
      'formula', 'v2.21.0',
      'cash_sales', v_cash_sales,
      'cash_production_income', v_cash_production,
      'cash_outflows_suppliers', v_cash_outflows,
      'cash_commissions', v_cash_commissions,
      'cash_flow_in', v_cash_flow_in,
      'cash_flow_out', v_cash_flow_out,
      'transfer_sales', v_transfer_sales,
      'zelle_sales', v_zelle_sales
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'system_cash', v_system_cash,
    'system_expected_total', v_system_expected_total,
    'difference', v_difference,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_shift_expected(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_window_start timestamptz;
  v_pending RECORD;
  -- R4: FOUND tras SELECT INTO (la nulidad compuesta de RECORD no sirve:
  -- cash_closures.session_reference es NULL en las filas reales y
  -- `<record> IS NOT NULL` exige TODOS los campos no-nulos ⇒ siempre falso).
  v_has_pending boolean := false;
  v_opening numeric := 0;
  v_total_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- Ventana del turno: si hay turno PENDIENTE (abierto), desde su created_at
  -- (idéntico a close_cash_shift); si no, desde el último cierre cerrado
  -- (fallback histórico: epoch).
  SELECT * INTO v_pending FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;
  v_has_pending := FOUND;

  IF v_has_pending THEN
    v_window_start := v_pending.created_at;
    v_opening := COALESCE(v_pending.opening_balance, 0);
  ELSE
    SELECT closed_at INTO v_window_start FROM public.cash_closures
      WHERE store_id = p_store_id AND status = 'cerrado'
      ORDER BY closed_at DESC LIMIT 1;
    v_window_start := COALESCE(v_window_start, '1970-01-01 00:00:00+00'::timestamptz);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(zelle_amount), 0)
    INTO v_total_sales, v_cash_sales, v_transfer_sales, v_zelle_sales
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_window_start
      AND created_at <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_window_start
      AND paid_at <= NOW();

  -- MISIÓN 2026-10-20: documentos Ingresos/Egresos de caja (fondo de cambio
  -- y otros). Anulados = neto cero (fila original + fila contra).
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'has_pending_shift', v_has_pending,
    'opening_balance', v_opening,
    'total_sales', v_total_sales,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total
  );
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_cash_report(
  p_store_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '1 day',
  p_end_date TIMESTAMPTZ DEFAULT now(),
  p_include_all_dates BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_commissions JSON;
  v_production JSON;
  v_cash_flow_groups JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
  v_production_total_cup NUMERIC := 0;
  v_cash_flow_in_total_cup NUMERIC := 0;
  v_cash_flow_out_total_cup NUMERIC := 0;
BEGIN
  -- Ventas por método y moneda (siempre filtradas por fecha)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT payment_method, sale_currency AS currency, COUNT(*) AS transaction_count,
      SUM(total_amount) AS total,
      SUM(total_amount) AS total_cup
    FROM transactions
    WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided'
    GROUP BY payment_method, sale_currency ORDER BY payment_method, sale_currency
  ) t;

  -- Pagos a Proveedores
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('receipt', 'service')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Comisiones
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT payment_method, currency, COUNT(*) AS commission_count, SUM(final_amount) AS total, SUM(amount_cup) AS total_cup
    FROM commission_payments
    WHERE store_id = p_store_id AND status = 'paid'
      AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date))
      AND payment_method IS NOT NULL
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- Órdenes de Producción/Servicios
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_production
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('production_order', 'work')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- MISIÓN 2026-10-20: Ingresos/Egresos de caja documentados (fondo de cambio
  -- y otros). GRUPOS agregados por moneda+dirección (las FILAS del ledger
  -- las enriquece /api/cash-report como `cash_flows` — nombres distintos a
  -- propósito para no confundir grupos con detalle). Un documento anulado
  -- aporta original + contra (movimientos físicos reales por fecha), igual
  -- criterio que el arqueo v2.21.0.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_cash_flow_groups
  FROM (
    SELECT payment_method, currency, direction, COUNT(*) AS flow_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type = 'cash_flow'
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, direction ORDER BY currency, direction
  ) t;

  -- Totales
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_sales_total_cup FROM transactions
  WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided';

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('receipt', 'service')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments WHERE store_id = p_store_id AND status = 'paid'
  AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_production_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('production_order', 'work')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in_total_cup, v_cash_flow_out_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type = 'cash_flow'
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'production_total_cup', v_production_total_cup,
    'cash_flow_in_total_cup', v_cash_flow_in_total_cup,
    'cash_flow_out_total_cup', v_cash_flow_out_total_cup,
    'balance_cup', v_sales_total_cup + v_production_total_cup
                   + v_cash_flow_in_total_cup
                   - v_payments_total_cup - v_commissions_total_cup - v_cash_flow_out_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'commissions', v_commissions,
    'production', v_production, 'cash_flow_groups', v_cash_flow_groups, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date,
    'include_all_dates', p_include_all_dates
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.create_cash_flow_document(
  p_store_id uuid,
  p_doc_type text,
  p_concept text,
  p_amount numeric,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT NULL,
  p_operation_date timestamptz DEFAULT NULL,
  p_counterparty text DEFAULT NULL,
  p_justification text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_related_document_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc_type text := lower(btrim(p_doc_type));
  v_concept text := lower(btrim(COALESCE(p_concept, '')));
  v_amount numeric;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CUP')));
  v_rate numeric;
  v_rate_effective timestamptz;
  v_amount_cup numeric;
  v_op_date timestamptz := COALESCE(p_operation_date, now());
  v_justification text;
  v_shift RECORD;
  v_number text;
  v_doc_id uuid;
  v_payment_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_fondo numeric := 0;
  v_param_hash text;
  v_idem jsonb;
  v_result jsonb;
  v_related public.cash_flow_documents%ROWTYPE;
BEGIN
  -- 1. AUTH actor-explícito (fail-closed) + rol con autoridad para registrar
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado', 'clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda';
  END IF;

  -- 2. Validación del documento
  IF v_doc_type NOT IN ('ingreso', 'egreso') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOC_TYPE: %', p_doc_type;
  END IF;
  IF v_concept = '' THEN
    RAISE EXCEPTION 'ERR_CONCEPT_REQUIRED';
  END IF;
  IF NOT (
       (v_doc_type = 'ingreso' AND v_concept IN ('constitucion_fondo', 'reposicion_fondo', 'otro_ingreso'))
    OR (v_doc_type = 'egreso'  AND v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso'))
  ) THEN
    RAISE EXCEPTION 'ERR_CONCEPT_TYPE_MISMATCH: concepto % no válido para tipo %', v_concept, v_doc_type;
  END IF;
  v_justification := btrim(COALESCE(p_justification, ''));
  IF v_justification = '' THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_REQUIRED';
  END IF;
  IF length(v_justification) > 500 THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_TOO_LONG';
  END IF;

  v_amount := COALESCE(p_amount, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: %', p_amount;
  END IF;
  IF v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;
  IF v_currency NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;

  -- 3. Tasa de cambio (D8): resolución SERVER-SIDE exclusiva. La tasa del
  --    cliente NO tiene autoridad financiera (se ignora, como en ventas).
  IF v_currency = 'CUP' THEN
    v_rate := 1;
  ELSE
    v_rate := NULL;
    v_rate_effective := NULL;
    SELECT ser.rate, ser.updated_at INTO v_rate, v_rate_effective
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'elToque'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL OR v_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda antes de operar en esa moneda';
    END IF;
    IF v_rate_effective < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: effective=%', v_rate_effective;
    END IF;
  END IF;

  v_amount_cup := CASE WHEN v_currency = 'CUP' THEN v_amount ELSE v_amount * v_rate END;

  -- 4. Advisory lock por tienda: serializa creaciones/anulaciones concurrentes
  --    sobre la misma caja (evita doble gasto y carreras sobre el fondo).
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 5. IDEMPOTENCIA (replay seguro ante reintentos de red)
  v_param_hash := md5(
    p_store_id::text || '|' || v_caller_uid::text || '|' || v_doc_type || '|' || v_concept || '|'
    || v_amount::text || '|' || v_currency || '|' || COALESCE(p_operation_date, 'now')::text || '|'
    || COALESCE(btrim(p_counterparty), '') || '|' || v_justification || '|'
    || COALESCE(btrim(p_notes), '') || '|' || COALESCE(p_related_document_id::text, '')
  );
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT ir.result INTO v_idem
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'create_cash_flow_document'
      LIMIT 1;
    IF v_idem IS NOT NULL THEN
      SELECT ir.param_hash INTO v_param_hash
        FROM public.idempotency_registry ir
        WHERE ir.idempotency_key = p_idempotency_key
          AND ir.operation = 'create_cash_flow_document'
        LIMIT 1;
      IF v_param_hash IS NULL OR v_idem IS NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      -- hash idéntico ⇒ devolver el resultado original (reintento benigno)
      RETURN v_idem;
    END IF;
  END IF;

  -- 6. TURNO ABIERTO obligatorio (D5): sin sesión pendiente no se opera.
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: la caja no tiene un turno abierto — abra el turno en Caja antes de registrar ingresos o egresos';
  END IF;

  -- 7. FECHA OPERATIVA: política temporal global (piso 6 meses, no futuro,
  --    días hábiles Habana) + ventana del turno (doctrina caja FIJA).
  PERFORM public.validate_operation_date(v_op_date, p_store_id);
  IF v_op_date <= v_shift.created_at OR v_op_date > now() THEN
    RAISE EXCEPTION 'ERR_DATE_OUTSIDE_SHIFT: la fecha operativa debe caer dentro del turno abierto (apertura %)', v_shift.created_at;
  END IF;

  -- 8. SALDO Y FONDO VIGENTES — misma fórmula v2.21.0 que el cierre calculará
  --    (una sola fuente de verdad; se recalcula AHORA bajo advisory lock).
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_shift.created_at AND created_at <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_shift.created_at AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_shift.created_at AND payment_date <= now();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_shift.created_at AND paid_at <= now();

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_shift.created_at AND payment_date <= now();

  v_opening := COALESCE(v_shift.opening_balance, 0);
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out;

  -- Fondo de cambio vigente (D2): apertura + constituciones/reposiciones −
  -- devoluciones (documentos CONFIRMADOS de fondo en la ventana del turno).
  SELECT COALESCE(SUM(
           CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE -amount_cup END
         ), 0)
    INTO v_fondo
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_shift.created_at
      AND operation_date <= now();
  v_fondo := v_opening + v_fondo;

  -- 9. REGLAS DE NEGOCIO por tipo
  IF v_doc_type = 'egreso' THEN
    -- Imposibilidad de egresar más efectivo del disponible (canonical CUP)
    IF v_amount_cup > v_expected_cash + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: disponible=%, egreso=%', round(v_expected_cash, 2), round(v_amount_cup, 2);
    END IF;
    -- Devolución de fondo: nunca más del fondo vigente (5.000 − 2.000 ⇒ quedan 3.000)
    IF v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
      IF v_amount_cup > v_fondo + 0.005 THEN
        RAISE EXCEPTION 'ERR_FUND_INSUFFICIENT: fondo vigente=%, devolución=%', round(v_fondo, 2), round(v_amount_cup, 2);
      END IF;
    END IF;
  END IF;

  -- 10. Vínculo opcional devolución → documento de fondo que la origina
  IF p_related_document_id IS NOT NULL THEN
    IF v_concept NOT IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_NOT_ALLOWED: solo las devoluciones de fondo pueden vincular un documento origen';
    END IF;
    SELECT * INTO v_related FROM public.cash_flow_documents
      WHERE id = p_related_document_id AND store_id = p_store_id
      FOR UPDATE;
    IF NOT FOUND
       OR v_related.status <> 'confirmado'
       OR v_related.doc_type <> 'ingreso'
       OR v_related.concept NOT IN ('constitucion_fondo', 'reposicion_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_INVALID: el documento origen debe ser una constitución/reposición de fondo confirmada de la misma tienda';
    END IF;
  END IF;

  -- 11. NUMERACIÓN (atómica: FOR UPDATE dentro de esta misma transacción)
  v_number := public.next_document_number(p_store_id, 'cash_flow', v_caller_uid);

  -- 12. INSERT documento (confirmado — D4) + efecto financiero UNA vez (D1)
  INSERT INTO public.cash_flow_documents (
    store_id, document_number, doc_type, concept,
    amount, currency, exchange_rate, payment_method,
    operation_date, status, closure_id, responsible_user_id,
    counterparty, justification, notes, related_document_id,
    created_by, confirmed_by, idempotency_key
  ) VALUES (
    p_store_id, v_number, v_doc_type, v_concept,
    v_amount, v_currency, v_rate, 'cash',
    v_op_date, 'confirmado', v_shift.id, v_caller_uid,
    NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
    v_justification,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_related_document_id,
    v_caller_uid, v_caller_uid,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), '')
  )
  RETURNING id INTO v_doc_id;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    p_store_id, 'cash_flow', v_doc_id, v_amount, 'cash',
    v_currency, v_rate, v_op_date,
    v_number || ' · ' || v_concept || ': ' || v_justification,
    v_caller_uid,
    'cf-' || v_doc_id::text,
    CASE v_doc_type WHEN 'ingreso' THEN 'in' ELSE 'out' END
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.cash_flow_documents
    SET payment_transaction_id = v_payment_id
    WHERE id = v_doc_id;

  -- 13. AUDITORÍA atómica (misma transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'CASH_FLOW_CREATED', 'cash_flow_documents', v_doc_id,
    jsonb_build_object(
      'document_number', v_number,
      'doc_type', v_doc_type,
      'concept', v_concept,
      'amount', v_amount,
      'currency', v_currency,
      'exchange_rate', v_rate,
      'amount_cup', round(v_amount_cup, 2),
      'operation_date', v_op_date,
      'closure_id', v_shift.id,
      'counterparty', NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
      'justification', v_justification,
      'related_document_id', p_related_document_id,
      'cash_before', round(v_expected_cash, 2),
      'fondo_before', round(v_fondo, 2),
      'payment_transaction_id', v_payment_id,
      'formula', 'v2.21.0'
    )
  );

  v_result := jsonb_build_object(
    'status', 'success',
    'document_id', v_doc_id,
    'document_number', v_number,
    'doc_type', v_doc_type,
    'concept', v_concept,
    'amount', v_amount,
    'currency', v_currency,
    'exchange_rate', v_rate,
    'amount_cup', round(v_amount_cup, 2),
    'operation_date', v_op_date,
    'status_doc', 'confirmado',
    'payment_transaction_id', v_payment_id,
    'cash_before', round(v_expected_cash, 2),
    'cash_after', round(v_expected_cash + CASE WHEN v_doc_type = 'ingreso' THEN v_amount_cup ELSE -v_amount_cup END, 2),
    'fondo_before', round(v_fondo, 2),
    'fondo_after', round(
      v_fondo + CASE
        WHEN v_concept IN ('constitucion_fondo', 'reposicion_fondo') THEN v_amount_cup
        WHEN v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN -v_amount_cup
        ELSE 0
      END, 2)
  );

  -- 14. Registro de idempotencia (después del éxito — patrón v2.26)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (btrim(p_idempotency_key), 'create_cash_flow_document', v_doc_id, v_param_hash, v_result)
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document(
  p_document_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc public.cash_flow_documents%ROWTYPE;
  v_reason text;
  v_contra_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_expected_cash numeric := 0;
  v_shift RECORD;
BEGIN
  -- 1. Documento con lock de fila (evita doble anulación concurrente)
  SELECT * INTO v_doc FROM public.cash_flow_documents
    WHERE id = p_document_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_DOCUMENT_NOT_FOUND';
  END IF;

  -- 2. AUTH actor-explícito contra la tienda del documento + rol superior
  --    (anular exige admin/manager/encargado — doctrina de reversas)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_doc.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, v_doc.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: anular requiere admin, manager o encargado';
  END IF;

  -- 3. Motivo obligatorio (>= 3 caracteres, como el resto de reversas)
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_TOO_LONG';
  END IF;

  -- 4. Advisory lock por tienda (serializa contra creaciones concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(v_doc.store_id::text));

  -- 5. Estado: solo un confirmado puede anularse (idempotencia de anulación)
  IF v_doc.status <> 'confirmado' THEN
    RAISE EXCEPTION 'ERR_ALREADY_ANNULLED: status=%', v_doc.status;
  END IF;

  -- 6. Anular un INGRESO saca dinero de la caja (fila contra 'out'): exigir
  --    efectivo disponible suficiente para absorber la reversión. Anular un
  --    EGRESO devuelve dinero ('in'): siempre físicamente posible.
  IF v_doc.doc_type = 'ingreso' THEN
    SELECT * INTO v_shift FROM public.cash_closures
      WHERE store_id = v_doc.store_id AND status = 'pendiente'
      ORDER BY created_at DESC LIMIT 1;
    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: no hay turno abierto para registrar la reversión del efectivo';
    END IF;
    SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
      FROM public.transactions
      WHERE store_id = v_doc.store_id AND status = 'completed'
        AND created_at > v_shift.created_at AND created_at <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('receipt', 'service')
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('production_order', 'work')
        AND payment_date > v_shift.created_at AND payment_date <= now();
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
      FROM public.commission_payments
      WHERE store_id = v_doc.store_id AND status = 'paid' AND payment_method = 'cash'
        AND paid_at > v_shift.created_at AND paid_at <= now();
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
      INTO v_cash_flow_in, v_cash_flow_out
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'cash_flow'
        AND payment_date > v_shift.created_at AND payment_date <= now();
    v_opening := COALESCE(v_shift.opening_balance, 0);
    v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                       - v_cash_outflows - v_cash_commissions - v_cash_flow_out;
    IF v_doc.amount_cup > v_expected_cash + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: anular este ingreso dejaría el efectivo esperado en negativo (disponible=%, reversión=%)', round(v_expected_cash, 2), round(v_doc.amount_cup, 2);
    END IF;
  END IF;

  -- 7. Fila CONTRARIA en el ledger (nunca DELETE ni UPDATE de importes; la
  --    corrección física ocurre AHORA — payment_date = now()). Si el documento
  --    original pertenecía a un turno ya cerrado, ese cierre histórico queda
  --    intacto (sus sumas están congeladas) y la reversión entra a la ventana
  --    del turno actual: procedimiento de corrección sin reabrir historia.
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    v_doc.store_id, 'cash_flow', v_doc.id, v_doc.amount, 'cash',
    v_doc.currency, v_doc.exchange_rate, now(),
    'Anulación ' || v_doc.document_number || ': ' || v_reason,
    v_caller_uid,
    'cf-anul-' || v_doc.id::text,
    CASE v_doc.doc_type WHEN 'ingreso' THEN 'out' ELSE 'in' END
  )
  RETURNING id INTO v_contra_id;

  -- 8. Estado terminal + trazabilidad completa de la anulación
  UPDATE public.cash_flow_documents SET
    status = 'anulado',
    annulled_at = now(),
    annulled_by = v_caller_uid,
    annulment_reason = v_reason,
    annulment_payment_transaction_id = v_contra_id
  WHERE id = v_doc.id;

  -- 9. Auditoría atómica
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_doc.store_id, 'CASH_FLOW_ANNULLED', 'cash_flow_documents', v_doc.id,
    jsonb_build_object(
      'document_number', v_doc.document_number,
      'doc_type', v_doc.doc_type,
      'concept', v_doc.concept,
      'amount', v_doc.amount,
      'currency', v_doc.currency,
      'amount_cup', v_doc.amount_cup,
      'reason', v_reason,
      'before_status', v_doc.status,
      'after_status', 'anulado',
      'annulment_payment_transaction_id', v_contra_id,
      'original_payment_transaction_id', v_doc.payment_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'document_id', v_doc.id,
    'document_number', v_doc.document_number,
    'status_doc', 'anulado',
    'annulled_at', now(),
    'annulled_by', v_caller_uid,
    'annulment_payment_transaction_id', v_contra_id
  );
END;
$function$;


