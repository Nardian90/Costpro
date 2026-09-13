-- DECLARED FINAL STATE (Git) de create_devolution_v2
-- fuente: 20260810000041_pr4_3_1_fixes.sql stmt#2

CREATE OR REPLACE FUNCTION public.create_devolution_v2(
  p_store_id uuid,
  p_items jsonb,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_original_transaction_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'cash',
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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
$function$
