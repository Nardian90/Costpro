-- ============================================================================
-- REM-PO-1 — production_orders security boundaries
-- (RECONSTRUCCIÓN RECOVERY-PO-1: workspace reseteado; commits 82e0f953/e2d8cc95/3d5ed7b9
--  y evidence pack original perdidos. Definiciones reconstruidas VERBATIM desde el
--  catálogo LIVE de Supabase (estado POST-remediación auditado: contract test 134/134,
--  0 violaciones). Fuente: pg_get_functiondef + proacl extraídos read-only.
-- ============================================================================
-- Guard V2.12.9: v_caller_uid := CASE WHEN auth.role() = 'service_role'
--   THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
-- La identidad del actor SIEMPRE server-side (auth.uid()); p_user_id solo se honra
-- para service_role (rutas servidor), nunca para clientes authenticated/anon.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICAL 1 — spoofing p_user_id en close (cross-store + audit spoof)
-- ────────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICAL 2 — spoofing p_user_id en receive (stock/WAC/movement suplantados)
-- ────────────────────────────────────────────────────────────────────────────
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
  v_unit_pt_cost NUMERIC;
  v_user_id UUID;
  v_order_status TEXT;
  v_order_store_id UUID;
  v_existing_result JSONB;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_param_hash TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || p_product_id::text || p_quantity::text || p_store_id::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_OUTPUT_RECEIVED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  SELECT status, store_id INTO v_order_status, v_order_store_id
  FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order_status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_IN_PROGRESS: status % is not in_progress', v_order_status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND store_id = v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE';
  END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_quantity must be > 0'; END IF;

  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items WHERE order_id = p_order_id AND actual_qty > 0;

  -- DF-05: PT nunca entra a 0 sin información válida (INV-06/E')
  IF v_total_materials_cost <= 0 THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: sin materiales server-side validos para orden %', p_order_id;
  END IF;

  v_unit_pt_cost := v_total_materials_cost / p_quantity;

  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id AND store_id = v_order_store_id FOR UPDATE;

  v_new_stock := COALESCE(v_current_stock,0) + p_quantity;

  -- DF-01: WAC vía escritor único; SIN espejo cost_price (D-02)
  v_new_cost := public.fn_recalc_wac(v_order_store_id, p_product_id, 'production_in',
                   p_quantity, v_unit_pt_cost,
                   jsonb_build_object('rpc','receive_production_output','order_id',p_order_id));

  UPDATE production_orders SET
    output_product_id = p_product_id, output_quantity = p_quantity,
    output_total_cost = v_total_materials_cost,
    output_unit_cost = v_unit_pt_cost, updated_at = now()
  WHERE id = p_order_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  -- DF-05: qty numérica sin truncamiento (D-11)
  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := p_quantity,
    p_movement_type := 'production_in',
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_unit_pt_cost,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid,
    p_skip_access_check := TRUE
  );

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_OUTPUT_RECEIVED', 'production_orders', p_order_id,
    jsonb_build_object(
      'product_id', p_product_id, 'quantity', p_quantity,
      'total_materials_cost', v_total_materials_cost,
      'unit_cost', v_unit_pt_cost, 'previous_wac', v_current_cost, 'new_wac', v_new_cost,
      'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'new_wac', v_new_cost, 'new_stock', v_new_stock)
    )
  );

  RETURN jsonb_build_object('status','success','new_wac',v_new_cost,'new_stock',v_new_stock,
    'total_materials_cost',v_total_materials_cost);
END $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICAL 3 — spoofing cross-store + anon void (CRIT-3a/3b)
-- ────────────────────────────────────────────────────────────────────────────
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
END $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICAL 4 — guard anti-spoofing (EXECUTE restringido postgres/service_role)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
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

  -- W9.5 B-10: capa normativa de rol. Politica congelada: puerta UI real del
  -- modulo (Costo: membership admin/manager/costo en la tienda de la orden) o
  -- admin global transversal. Observacion de producto registrada (02-policy).
  IF NOT public.can_reverse_document(v_caller_uid, v_order.store_id, 'production_order') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de orden de produccion requiere rol admin/manager/costo en la tienda';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_REVERSE'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_reverse',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','reverse_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Reversa producción: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='reversed', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_REVERSED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac,
      'old_status', v_order.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_PRODUCTION_ORDER'));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- CRITICAL 5 — guard anti-spoofing; overload deprecado sin EXECUTE a roles de app
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.withdraw_production_item_deprecated_6arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_qty_int INTEGER; v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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

-- ────────────────────────────────────────────────────────────────────────────
-- SUB-FIX §33 — guard variante p_created_by (atribución en audit)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_production_order_v2(p_store_id uuid, p_order_type text DEFAULT 'service'::text, p_customer_name text DEFAULT NULL::text, p_customer_ci text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_budget_total numeric DEFAULT 0, p_budget_currency text DEFAULT 'CUP'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_advance_amount numeric DEFAULT 0, p_advance_method text DEFAULT NULL::text, p_advance_currency text DEFAULT 'CUP'::text, p_created_by uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id uuid; v_order_number text; v_item jsonb; v_item_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_existing_result jsonb; v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_store_id::text || '|' || p_order_type || '|' || COALESCE(p_customer_name, '') || '|' ||
      COALESCE(p_customer_ci, '') || '|' || COALESCE(p_customer_phone, '') || '|' ||
      COALESCE(p_customer_address, '') || '|' || p_budget_total::text || '|' ||
      p_budget_currency || '|' || COALESCE(p_description, '') || '|' || COALESCE(p_notes, '') || '|' ||
      COALESCE(p_items::text, '[]') || '|' || p_advance_amount::text || '|' ||
      COALESCE(p_advance_method, '') || '|' || p_advance_currency || '|' || COALESCE(p_created_by::text, '')
    );
    v_existing_result := public.check_idempotency(p_idempotency_key, 'create_po', p_store_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_order_type NOT IN ('production', 'service', 'work') THEN
    RAISE EXCEPTION 'ERR_INVALID_ORDER_TYPE';
  END IF;

  INSERT INTO production_orders (
    store_id, order_type, status, budget_total, budget_currency,
    customer_name, customer_ci, customer_phone, customer_address,
    description, notes, created_by, paid_amount, payment_status,
    idempotency_key, advance_amount, advance_method, advance_currency
  ) VALUES (
    p_store_id, p_order_type, 'draft', p_budget_total, p_budget_currency,
    p_customer_name, p_customer_ci, p_customer_phone, p_customer_address,
    p_description, p_notes, v_caller_uid, 0, 'unpaid',
    p_idempotency_key, p_advance_amount, p_advance_method, p_advance_currency
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF NOT EXISTS (SELECT 1 FROM products WHERE id = (v_item->>'product_id')::uuid AND store_id = p_store_id) THEN
        RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: %', v_item->>'product_id';
      END IF;
      INSERT INTO production_order_items (order_id, product_id, variant_id, budgeted_qty, budgeted_unit_cost, status)
      VALUES (v_order_id, (v_item->>'product_id')::uuid, NULLIF(v_item->>'variant_id', '')::uuid,
        (v_item->>'budgeted_qty')::numeric, (v_item->>'budgeted_unit_cost')::numeric, 'pending');
      v_item_count := v_item_count + 1;
    END LOOP;
  END IF;

  IF p_advance_amount > 0 AND p_advance_method IS NOT NULL THEN
    PERFORM register_supplier_payment(p_store_id := p_store_id,
      p_ref_type := CASE WHEN p_order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := v_order_id, p_amount := p_advance_amount, p_payment_method := p_advance_method,
      p_paid_by := v_caller_uid, p_currency := p_advance_currency,
      p_idempotency_key := 'advance-' || v_order_id::text);
  END IF;

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'order_number', v_order_number, 'items_count', v_item_count);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'create_po', v_order_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'PRODUCTION_ORDER_CREATED', 'production_orders', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'order_type', p_order_type,
      'budget_total', p_budget_total, 'items_count', v_item_count,
      'advance_amount', p_advance_amount, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- MEDIUM — spoofing + REVOKE PUBLIC/anon (anon EXECUTE)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id     uuid;
  v_current      public.purchase_status_enum;
  v_po_number    text;
  v_allowed      text[];
  v_is_allowed   boolean := false;
BEGIN
  -- ─── 1. Cargar PO con lock exclusivo ───
  SELECT store_id, status, po_number
    INTO v_store_id, v_current, v_po_number
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Si no hay cambio, retornar success sin hacer nada ───
  IF v_current = p_new_status THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'po_status', v_current::text,
      'po_number', v_po_number
    );
  END IF;

  -- ─── 4. Definir transiciones permitidas (state machine) ───
  -- 'partial' y 'received' NUNCA son destino válido manualmente
  -- (solo vía receive_against_po).
  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'    THEN ARRAY['cancelled']
    WHEN 'partial' THEN ARRAY['cancelled']
    ELSE ARRAY[]::text[]  -- received, cancelled: terminal, no transitions
  END;

  -- ─── 5. Verificar transición permitida ───
  SELECT EXISTS(SELECT 1 FROM unnest(v_allowed) a WHERE a = p_new_status::text)
    INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current::text, p_new_status::text,
      CASE WHEN array_length(v_allowed, 1) IS NULL THEN 'none' ELSE array_to_string(v_allowed, ', ') END;
  END IF;

  -- ─── 6. Aplicar transición ───
  UPDATE public.purchase_orders
  SET status      = p_new_status,
      received_at = CASE WHEN p_new_status = 'received' THEN NOW() ELSE received_at END
  WHERE id = p_po_id;

  -- ─── 7. Auditoría (action = PO_STATUS_CHANGED) ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END, v_store_id, 'PO_STATUS_CHANGED', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'po_number', v_po_number,
      'from_status', v_current::text,
      'to_status', p_new_status::text,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', p_new_status::text,
    'po_number', v_po_number,
    'previous_status', v_current::text
  );
END;
$function$;

-- ============================================================================
-- ACLs — reproducen proacl LIVE (REVOKE PUBLIC + GRANT explícito por rol)
-- ============================================================================
REVOKE ALL ON FUNCTION public.close_production_order_v2(uuid, uuid, uuid, numeric, text, text, numeric, uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_production_order_v2(uuid, uuid, uuid, numeric, text, text, numeric, uuid, numeric, uuid, text) TO postgres, authenticated, service_role;

REVOKE ALL ON FUNCTION public.receive_production_output(uuid, uuid, numeric, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid, uuid, numeric, uuid, uuid, text) TO postgres, authenticated, service_role;

REVOKE ALL ON FUNCTION public.void_closed_production_order(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid, text, uuid) TO postgres, authenticated, service_role;

REVOKE ALL ON FUNCTION public.reverse_production_order(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid, text, uuid) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.withdraw_production_item_deprecated_6arg(uuid, numeric, numeric, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item_deprecated_6arg(uuid, numeric, numeric, uuid, uuid, text) TO postgres;

REVOKE ALL ON FUNCTION public.create_production_order_v2(uuid, text, text, text, text, text, numeric, text, text, text, jsonb, numeric, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_order_v2(uuid, text, text, text, text, text, numeric, text, text, text, jsonb, numeric, text, text, uuid, text) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.set_purchase_order_status(uuid, purchase_status_enum, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(uuid, purchase_status_enum, uuid, text) TO postgres, authenticated, service_role;

REVOKE ALL ON FUNCTION public.receive_against_po(uuid, jsonb, uuid, timestamp with time zone, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_against_po(uuid, jsonb, uuid, timestamp with time zone, text) TO postgres, authenticated, service_role;
