-- ============================================================================
-- MISIÓN POLÍTICA TEMPORAL (2026-10-18) — Coherencia de fechas de extremo a
-- extremo en documentos operativos, inventario, logística y caja.
--
-- Cambios (todos CREATE OR REPLACE, aditivos y reversibles):
--   1. validate_operation_date: tope superior hoy+1 → HOY (día de negocio
--      America/Havana). Piso histórico de 6 meses SIN cambios.
--   2. create_transfer: gate de fecha (llamado directo desde navegador).
--   3. confirm_transfer: gate de fecha antes de mover stock/Kardex.
--   4. register_supplier_payment: gate de fecha para payment_date histórica.
--
-- Los cuerpos base son pg_get_functiondef de la BD vigente (diferencia real =
-- solo el gate). Sin cambios de columnas, triggers, RLS ni grants.
-- Verificada en transacción BEGIN…ROLLBACK (evidencia en el informe de misión).
-- ============================================================================

-- ─── 1. Gate canónico: tope HOY ───

CREATE OR REPLACE FUNCTION public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today_business DATE;
  v_min_date_business DATE;
  v_max_date_business DATE;
  v_new_date_business DATE;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- PR-4.4E: comparar fechas de NEGOCIO (date-only) en timezone America/Havana
  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): tope superior HOY estricto (antes
  -- hoy+1): un documento «de mañana» envenenaba get_global_max_operation_date
  -- y bloqueaba las operaciones del mismo día de toda la tienda.
  v_today_business := (NOW() AT TIME ZONE 'America/Havana')::DATE;
  -- CAMBIO: 2 months → 6 months
  v_min_date_business := v_today_business - INTERVAL '6 months';
  v_max_date_business := v_today_business;
  v_new_date_business := (p_new_date AT TIME ZONE 'America/Havana')::DATE;

  IF v_new_date_business < v_min_date_business THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior al límite histórico permitido de 6 meses (mínimo: %). No se pueden registrar operaciones con más de 6 meses de antigüedad.',
      to_char(v_new_date_business, 'DD/MM/YYYY'),
      to_char(v_min_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_new_date_business > v_max_date_business THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT: La fecha % es posterior a la fecha actual del negocio (%). No se pueden registrar operaciones con fechas futuras.',
      to_char(v_new_date_business, 'DD/MM/YYYY'),
      to_char(v_today_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$


-- ─── 2. create_transfer: gate ───

CREATE OR REPLACE FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
  v_item JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_cost NUMERIC := 0;
  v_count INTEGER := 0;
  v_dest_product UUID;
  v_origin_product RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_origin_store RECORD;
  v_dest_store RECORD;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_origin_store FROM public.stores WHERE id = p_origin_store_id;
  SELECT * INTO v_dest_store FROM public.stores WHERE id = p_destination_store_id;
  IF NOT v_origin_store.is_active THEN RAISE EXCEPTION 'ERR_ORIGIN_STORE_INACTIVE'; END IF;
  IF NOT v_dest_store.is_active THEN RAISE EXCEPTION 'ERR_DEST_STORE_INACTIVE'; END IF;

  IF p_origin_store_id = p_destination_store_id THEN
    RAISE EXCEPTION 'ERR_SAME_STORE';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico de fechas. Este RPC
  -- se invoca DIRECTO desde el navegador (transfer-service), por lo que esta
  -- era la única capa de servidor posible: sin gate, cualquier fecha (futura
  -- incluida) persistía en transfers.created_at y en el MAX de la tienda.
  PERFORM public.validate_operation_date(v_effective_date, p_origin_store_id);

  INSERT INTO public.transfers (
    id, origin_store_id, destination_store_id, status, notes, total_cost,
    created_by, created_at
  ) VALUES (
    v_transfer_id, p_origin_store_id, p_destination_store_id, 'PENDIENTE', p_notes, 0,
    v_caller_uid, v_effective_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    PERFORM pg_advisory_xact_lock(hashtext('product:' || v_pid::text));

    SELECT p.id, p.stock_current, p.cost_average, p.sku, p.name, p.unit_of_measure,
           p.description, p.category, p.price, p.price_currency,
           p.stock_current - COALESCE(
             (SELECT SUM(r.quantity) FROM public.inventory_reservations r
              WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
             0
           ) AS stock_avail
    INTO v_origin_product
    FROM public.products p
    WHERE p.id = v_pid AND p.store_id = p_origin_store_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid; END IF;

    IF v_origin_product.stock_avail < v_qty THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: producto %, disponible %, solicitado %',
        v_origin_product.name, v_origin_product.stock_avail, v_qty;
    END IF;

    v_unit_cost := v_origin_product.cost_average;
    v_line_total := v_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_line_total;
    v_count := v_count + 1;

    -- H-049: Buscar producto destino por SKU
    SELECT id INTO v_dest_product
    FROM public.products
    WHERE sku = v_origin_product.sku AND store_id = p_destination_store_id
    LIMIT 1;

    -- H-049: Si no existe, crear producto espejo con MÁS campos copiados
    IF v_dest_product IS NULL THEN
      INSERT INTO public.products (
        store_id, sku, name, description, unit_of_measure,
        stock_current, cost_average, cost_price, price, price_currency,
        is_active, category
      ) VALUES (
        p_destination_store_id,
        v_origin_product.sku,
        v_origin_product.name,
        COALESCE(v_origin_product.description, v_origin_product.name),  -- H-049: descripción real
        v_origin_product.unit_of_measure,
        0,
        v_unit_cost,
        v_unit_cost,
        COALESCE(v_origin_product.price, v_unit_cost),  -- H-049: precio del origen
        COALESCE(v_origin_product.price_currency, 'CUP'),  -- H-049: moneda del origen
        true,
        COALESCE(v_origin_product.category, 'General')  -- H-049: categoría del origen
      ) RETURNING id INTO v_dest_product;
    END IF;

    INSERT INTO public.transfer_items (transfer_id, product_id, destination_product_id, quantity, unit_cost, total)
    VALUES (v_transfer_id, v_pid, v_dest_product, v_qty, v_unit_cost, v_line_total);

    INSERT INTO public.inventory_reservations (
      store_id, product_id, reference_type, reference_id,
      quantity, status, created_by, metadata
    ) VALUES (
      p_origin_store_id, v_pid, 'TRANSFER', v_transfer_id,
      v_qty, 'ACTIVE', v_caller_uid,
      jsonb_build_object('destination_store_id', p_destination_store_id, 'dest_product_id', v_dest_product)
    );
  END LOOP;

  UPDATE public.transfers SET total_cost = v_total_cost WHERE id = v_transfer_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_TRANSFER', 'transfers', v_transfer_id, p_origin_store_id, v_caller_uid,
    jsonb_build_object('dest', p_destination_store_id, 'total_cost', v_total_cost, 'items_count', v_count,
      'reservations_created', v_count));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id, 'total_cost', v_total_cost);
END;
$function$


-- ─── 3. confirm_transfer: gate ───

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
  v_new_wac NUMERIC;
  v_dest_before NUMERIC;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico — la fecha de
  -- recepción (p_operation_date) se valida ANTES de mover stock/Kardex.
  -- Antes la ruta /api/transfers/[id]/confirm la propagaba sin validación.
  PERFORM public.validate_operation_date(COALESCE(p_operation_date, NOW()), v_transfer.origin_store_id);

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

  -- DF-06: lock determinista de filas de producto (origen y destino) antes de mover valor
  FOR v_item IN
    SELECT product_id AS pid, origin_store_id AS sid FROM public.transfer_items ti
      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
    UNION
    SELECT destination_product_id AS pid, destination_store_id AS sid FROM public.transfer_items ti
      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
    ORDER BY sid, pid
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_item.pid AND store_id = v_item.sid FOR UPDATE;
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

    -- DF-06: blend D-01 en destino con uc_transfer congelado, ANTES del dest-in
    -- (kardex del destino lee ca_new). Semilla de destino nuevo = blend con S=0.
    SELECT stock_current INTO v_dest_before FROM public.products
      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id;
    v_new_wac := public.fn_recalc_wac(
      v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_in',
      v_item.quantity, v_item.unit_cost,
      jsonb_build_object('rpc','confirm_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));

    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id,
      'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED'),
      'reference_doc', v_ref_doc,
      'dest_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END $function$


-- ─── 4. register_supplier_payment: gate ───

CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost INTO v_doc_store_id, v_total
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount INTO v_doc_store_id, v_total
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total INTO v_doc_store_id, v_total
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico para la fecha
  -- financiera del pago. Se conservan las fechas históricas (V2.12.32)
  -- dentro del piso de 6 meses; NUNCA fechas futuras (tope HOY Habana).
  -- v_eff_payment_date = COALESCE(p_payment_date, now()) → NOW() siempre pasa.
  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- Calcular monto en CUP
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- R3: Validar overpay
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
  FROM public.payment_transactions
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  v_balance := v_total - v_paid;
  IF v_amount_cup > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_cup, v_balance;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

