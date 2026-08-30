-- ============================================================================
-- 06-df07-devolution-cap.sql — W6.2 LAB · DF-07 TOPE + RACE SERIALIZADA
-- Diseño: W62-04 DF-07 (respuestas literales del dueño). Requiere 01-05.
-- DOCTRINA (anti-patrón prohibido): NUNCA SELECT SUM + IF sin lock.
--   1. LOCK de la fila de la VENTA ORIGINAL (transactions FOR UPDATE) — PRIMER
--      statement de negocio, ANTES de leer cualquier acumulado.
--   2. leer acumulado (fresco post-lock; READ COMMITTED re-evalúa tras lock)
--   3. validar tope por (venta, producto)
--   4. registrar devolución
-- v1s bloqueadas para authenticated (transición DF-05/09; la app W8 migra a v2).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
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
  v_sold_qty numeric;
  v_devolved_qty numeric;
  v_locked_sale uuid;
BEGIN
  -- Idempotencia (igual que contrato congelado)
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

  -- ═══ DF-07: LOCK DE LA VENTA ORIGINAL — PRIMERO, ANTES DE LEER ACUMULADOS ═══
  -- (el tope no es verificable sin venta original: se exige vínculo)
  IF p_original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original';
  END IF;
  SELECT id INTO v_locked_sale FROM public.transactions
    WHERE id = p_original_transaction_id AND store_id = p_store_id
    FOR UPDATE;
  IF v_locked_sale IS NULL THEN
    RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
  END IF;

  -- ═══ DF-07: TOPE ACUMULADO por (venta, producto) — leído DESPUÉS del lock ═══
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: qty=%', v_qty;
    END IF;

    SELECT COALESCE(SUM(ti.quantity), 0) INTO v_sold_qty
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;

    -- acumulado: devoluciones {pending, completed}; voided/reversed EXCLUIDAS (liberan tope)
    SELECT COALESCE(SUM(di.quantity), 0) INTO v_devolved_qty
    FROM public.devolution_items di
    JOIN public.devolutions d ON d.id = di.devolution_id
    WHERE d.original_transaction_id = p_original_transaction_id
      AND di.product_id = v_pid
      AND d.status IN ('pending','completed');

    IF v_devolved_qty + v_qty > v_sold_qty THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CAP_EXCEEDED: producto % vendido=% devuelto=% solicitado=% (tope acumulado, lock de venta adquirido)',
        v_pid, v_sold_qty, v_devolved_qty, v_qty;
    END IF;
  END LOOP;

  -- ═══ Resto del contrato congelado (A1 neutral) ═══
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

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
      p_quantity := v_qty, p_movement_type := 'return',
      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(), p_skip_access_check := TRUE
    );
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items),
      'cap_lock_df07', true
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total
  );
END $fn$;

-- Transición v1 → v2 (doctrina W62-04 §DF-07 §4 "bloquear v1 y solo v2 se corrige")
-- 9-arg legacy (store,items,reason,user_id,original_tx,payment_method,customer_id,customer_name,notes)
REVOKE EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,uuid,text,uuid,text,text) FROM anon, authenticated;
-- 10-arg legacy (store,items,reason,original_tx,payment_method,customer_id,customer_name,notes,currency,exchange_rate)
REVOKE EXECUTE ON FUNCTION public.create_devolution(uuid,jsonb,text,uuid,text,uuid,text,text,text,numeric) FROM anon, authenticated;

\echo '06: DF-07 aplicado — lock venta original ANTES de leer acumulado + tope por producto; v1 bloqueadas'
