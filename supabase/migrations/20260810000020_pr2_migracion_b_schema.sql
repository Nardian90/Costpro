-- ============================================================================
-- PR-2 Migración B — Schema changes (C0 + C3 + C4 + C5 + C7 + correcciones C.3)
-- ============================================================================
-- NO ejecutar backfill (C.8). NO modificar datos de negocio.
-- Solo CREATE OR REPLACE FUNCTION + DROP + REVOKE/GRANT.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- C0: calculate_receipt_total_cup — autoridad única para total_cost en CUP
-- FALLA ante datos inválidos (no COALESCE silencioso)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.calculate_receipt_total_cup(
  p_receipt_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_total numeric;
  v_invalid_count integer;
BEGIN
  -- Verificar que todos los items tengan datos coherentes
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.receipt_items ri
  WHERE ri.receipt_id = p_receipt_id
    AND (
      -- Moneda NULL o no soportada
      ri.moneda_recepcion IS NULL
      OR ri.moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
      -- CUP con tasa != 1
      OR (ri.moneda_recepcion = 'CUP' AND ri.tasa_cambio_recepcion IS DISTINCT FROM 1.0)
      -- FX con tasa NULL o <= 1.5
      OR (ri.moneda_recepcion IN ('USD', 'EUR', 'MLC') AND (
        ri.tasa_cambio_recepcion IS NULL
        OR ri.tasa_cambio_recepcion <= 1.5
      ))
      -- cantidad inválida
      OR ri.quantity IS NULL OR ri.quantity <= 0
      -- unit_cost inválido
      OR ri.unit_cost IS NULL OR ri.unit_cost < 0
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_RECEIPT_DATA: % items con datos inválidos para receipt %',
      v_invalid_count, p_receipt_id;
  END IF;

  SELECT COALESCE(SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion), 0)
    INTO v_total
  FROM public.receipt_items ri
  WHERE ri.receipt_id = p_receipt_id;

  RETURN v_total;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_receipt_total_cup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_receipt_total_cup(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_receipt_total_cup(uuid) FROM anon;

COMMENT ON FUNCTION public.calculate_receipt_total_cup IS
  'PR-2 C0: autoridad única para calcular receipts.total_cost en CUP. FALLA ante datos inválidos.';

-- ════════════════════════════════════════════════════════════════════════════
-- C3: confirm_pending_reception — recalcular total_cost al confirmar
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS void
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
  v_unit_cost_cup NUMERIC;
  v_conversion_factor integer := 1;
  v_units_to_add integer;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  -- V2.5 H2c: autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  FOR v_item IN
    SELECT ri.product_id, ri.quantity, ri.unit_cost, ri.tasa_cambio_recepcion,
           ri.moneda_recepcion, ri.variant_id
    FROM receipt_items ri
    WHERE ri.receipt_id = p_receipt_id
  LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_add := v_item.quantity * v_conversion_factor;

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_units_to_add;

    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_unit_cost_cup) / v_new_stock
      ELSE v_unit_cost_cup END;

    -- PR-2 C.7-fix: NO actualizar stock_current aquí — los triggers de stock_movements
    -- (fn_sync_inventory_on_movement + sync_product_stock) son la fuente canónica de stock.
    -- Actualizar stock_current aquí causaba double-counting: el trigger leía el stock ya
    -- actualizado y sumaba quantity_change nuevamente.
    -- Solo actualizar cost_average (WAC) que no es manejado por los triggers de stock_movements.
    UPDATE products
    SET cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  -- PR-2 C3: recalcular total_cost en CUP al confirmar (usando calculate_receipt_total_cup)
  UPDATE receipts
  SET status = 'active',
      reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id),
      updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- C4: update_reception_items — usar calculate_receipt_total_cup + has_store_access_as
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_reception_items(
  p_receipt_id uuid,
  p_item_updates jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_status text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_deleted boolean;
  v_new_total numeric := 0;
  v_updated_count integer := 0;
  v_failed_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
  FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- PR-2 C4: alinear auth con patrón v2.12.12 (has_store_access_as + v_caller_uid)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_item_updates) LOOP
    v_item_id := (v_item->>'id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_deleted := COALESCE((v_item->>'deleted')::boolean, false);

    IF v_deleted THEN
      DELETE FROM public.receipt_items WHERE id = v_item_id AND receipt_id = p_receipt_id;
      v_updated_count := v_updated_count + 1;
    ELSE
      UPDATE public.receipt_items
      SET quantity = v_qty, unit_cost = v_cost
      WHERE id = v_item_id AND receipt_id = p_receipt_id;

      IF NOT FOUND THEN
        v_failed_count := v_failed_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- PR-2 C4: recalcular total_cost usando calculate_receipt_total_cup (con tasa)
  v_new_total := public.calculate_receipt_total_cup(p_receipt_id);

  UPDATE public.receipts SET total_cost = v_new_total, updated_at = NOW()
  WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_store_id, 'reception_items_updated', 'receipts', p_receipt_id,
    jsonb_build_object('updated', v_updated_count, 'failed', v_failed_count, 'new_total', v_new_total)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', v_updated_count,
    'failed_count', v_failed_count,
    'new_total', v_new_total
  );
END;
$func$;

-- ════════════════════════════════════════════════════════════════════════════
-- C5: reverse_receipt_v2 — idempotente + tasa + reset pago + marca payment_txn
-- ════════════════════════════════════════════════════════════════════════════

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

  -- PR-2 C5: idempotencia — si ya está voided, retornar success sin efectos
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

  -- Auth
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Loop sobre items
  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    v_stock := COALESCE(v_stock, 0);

    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %',
        v_item.product_id, v_stock, v_item.quantity;
    END IF;

    -- PR-2 C5: multiplicar unit_cost por tasa_cambio_recepcion (CUP-converted)
    v_unit_cost_cup := v_item.unit_cost * v_item.tasa_cambio_recepcion;

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

    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      reference_type, reference_id, reference_description, created_at, created_by
    ) VALUES (
      v_receipt.store_id, v_item.product_id, 'purchase_reverse', -v_item.quantity,
      v_unit_cost_cup, -v_item.quantity * v_unit_cost_cup,
      'reversal', p_receipt_id, 'Reverso de recepción: ' || COALESCE(p_reason, ''),
      NOW(), v_caller_uid
    );

    -- PR-2 C5: WAC recalc usando v_unit_cost_cup (no raw unit_cost)
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

  -- PR-2 C5: reset estado de pago (el trigger update_payment_status skip voided)
  UPDATE public.receipts
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = NOW()
  WHERE id = p_receipt_id;

  -- PR-2 C5: marcar payment_transactions como REVERSED (via notes)
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

-- ════════════════════════════════════════════════════════════════════════════
-- C7: update_receipt_item_tasa — RPC transaccional
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_receipt_item_tasa(
  p_receipt_item_id uuid,
  p_new_tasa_cambio_recepcion numeric,
  p_new_moneda_recepcion text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_item RECORD;
  v_store_id uuid;
  v_receipt_id uuid;
  v_old_tasa numeric;
  v_old_moneda text;
  v_effective_moneda text;
  v_new_total numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  -- (1) Lock item + receipt
  SELECT
    ri.id AS item_id,
    ri.receipt_id,
    ri.quantity,
    ri.unit_cost,
    ri.moneda_recepcion,
    ri.tasa_cambio_recepcion,
    r.store_id,
    r.status AS receipt_status
  INTO v_item
  FROM public.receipt_items ri
  JOIN public.receipts r ON r.id = ri.receipt_id
  WHERE ri.id = p_receipt_item_id
  FOR UPDATE OF ri, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_ITEM_NOT_FOUND';
  END IF;

  v_store_id := v_item.store_id;
  v_receipt_id := v_item.receipt_id;
  v_old_tasa := v_item.tasa_cambio_recepcion;
  v_old_moneda := v_item.moneda_recepcion;

  -- (2) Authorization
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- (3) Status guard
  IF v_item.receipt_status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED';
  END IF;
  IF v_item.receipt_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  -- (4) Validación coherencia moneda ↔ tasa
  IF p_new_moneda_recepcion IS NOT NULL
     AND p_new_moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
  THEN
    RAISE EXCEPTION 'ERR_UNSUPPORTED_CURRENCY: % no soportada', p_new_moneda_recepcion;
  END IF;

  v_effective_moneda := COALESCE(p_new_moneda_recepcion, v_old_moneda);

  -- CUP = tasa 1 (estricto)
  IF v_effective_moneda = 'CUP'
     AND p_new_tasa_cambio_recepcion IS DISTINCT FROM 1.0
  THEN
    RAISE EXCEPTION 'ERR_CUP_RATE_MUST_BE_1: moneda CUP requiere tasa=1, recibido %',
      p_new_tasa_cambio_recepcion;
  END IF;

  -- FX = tasa > 1.5
  IF v_effective_moneda <> 'CUP' THEN
    IF p_new_tasa_cambio_recepcion IS NULL OR p_new_tasa_cambio_recepcion <= 1.5 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: moneda % requiere tasa > 1.5, recibido %',
        v_effective_moneda, COALESCE(p_new_tasa_cambio_recepcion::text, 'NULL');
    END IF;
    IF p_new_tasa_cambio_recepcion < 0.01 OR p_new_tasa_cambio_recepcion > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa % fuera de rango [0.01, 10000]',
        p_new_tasa_cambio_recepcion;
    END IF;
  END IF;

  -- (5) No-op guard
  IF v_old_tasa IS NOT DISTINCT FROM p_new_tasa_cambio_recepcion
     AND (p_new_moneda_recepcion IS NULL OR v_old_moneda = p_new_moneda_recepcion)
  THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'receipt_item_id', p_receipt_item_id,
      'receipt_id', v_receipt_id
    );
  END IF;

  -- (6) Audit BEFORE mutating
  INSERT INTO public.receipt_tasa_audit (
    receipt_item_id, valor_anterior, valor_nuevo,
    moneda_anterior, moneda_nueva, modificado_por, modificado_at, motivo
  ) VALUES (
    p_receipt_item_id,
    v_old_tasa,
    p_new_tasa_cambio_recepcion,
    v_old_moneda,
    COALESCE(p_new_moneda_recepcion, v_old_moneda),
    v_caller_uid,
    NOW(),
    COALESCE(p_motivo, 'update_receipt_item_tasa RPC')
  );

  -- (7) Mutate receipt_items
  UPDATE public.receipt_items
    SET
      tasa_cambio_recepcion = p_new_tasa_cambio_recepcion,
      moneda_recepcion = COALESCE(p_new_moneda_recepcion, moneda_recepcion),
      updated_at = NOW()
    WHERE id = p_receipt_item_id;

  -- (8) Recalcular total_cost — UNA sola llamada
  v_new_total := public.calculate_receipt_total_cup(v_receipt_id);

  UPDATE public.receipts
    SET
      total_cost = v_new_total,
      updated_at = NOW()
    WHERE id = v_receipt_id;

  -- (9) Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'UPDATE_RECEIPT_ITEM_TASA', 'receipt_items', p_receipt_item_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'valor_anterior', v_old_tasa,
      'valor_nuevo', p_new_tasa_cambio_recepcion,
      'moneda_anterior', v_old_moneda,
      'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
      'motivo', p_motivo
    )
  );

  -- (10) Return
  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_item_id', p_receipt_item_id,
    'receipt_id', v_receipt_id,
    'valor_anterior', v_old_tasa,
    'valor_nuevo', p_new_tasa_cambio_recepcion,
    'moneda_anterior', v_old_moneda,
    'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
    'new_total_cost', v_new_total
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_receipt_item_tasa(uuid, numeric, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_receipt_item_tasa(uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_receipt_item_tasa(uuid, numeric, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.update_receipt_item_tasa IS
  'PR-2 C7: actualiza tasa/moneda de un receipt_item. SECURITY DEFINER. Solo pending.';

-- ════════════════════════════════════════════════════════════════════════════
-- Corrección C.3: REVOKE FROM anon en register_reception
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid, uuid) FROM anon;

-- ════════════════════════════════════════════════════════════════════════════
-- Corrección C.3: eliminar wrapper roto register_reception_wrapper
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.register_reception_wrapper(jsonb);
