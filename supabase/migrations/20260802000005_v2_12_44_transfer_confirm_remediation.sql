-- ════════════════════════════════════════════════════════════════════════
-- V2.12.44 — Remediación Transfer Confirm (Épicas TC-1, TC-2, TC-3)
--
-- TC-1: H-039 validación stock_available + H-041 consumo obligatorio
-- TC-2: H-050 destination_product_id en reverse + H-051 register_stock_movement + H-052 permisos
-- TC-3: H-045 reference_doc legible + H-049 producto espejo mejorado
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- TC-1: confirm_transfer con get_available_stock + consumo obligatorio
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_transfer(
  p_transfer_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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

  -- Autorización: caller debe tener acceso al destino
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Approval check
  IF COALESCE(v_transfer.requires_approval, false) = true AND v_transfer.approved_at IS NULL THEN
    RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
  END IF;

  -- H-039: Validar stock disponible usando get_available_stock
  -- stock_available = stock_current - SUM(reservas ACTIVE)
  -- La reserva de ESTA transferencia está incluida en las ACTIVE,
  -- así que stock_available ya refleja que estas unidades están comprometadas.
  -- Si stock_available >= qty, hay suficiente para consumir la reserva.
  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    SELECT * INTO v_stock_info FROM public.get_available_stock(v_transfer.origin_store_id, v_item.product_id);

    IF NOT (v_stock_info->>'found')::boolean THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_AT_CONFIRM: %', v_item.product_id;
    END IF;

    v_available := (v_stock_info->>'stock_available')::numeric;
    -- v_available ya incluye la resta de la reserva de esta transferencia
    -- Si v_available < 0, significa que otras operaciones consumieron el stock físico
    IF v_available < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, stock_fisico=%, reservado=%, disponible=%, solicitado=%',
        v_item.product_id,
        (v_stock_info->>'stock_current'),
        (v_stock_info->>'stock_reserved'),
        v_available,
        v_item.quantity;
    END IF;
  END LOOP;

  -- Actualizar estado
  UPDATE public.transfers
    SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = v_caller_uid
    WHERE id = p_transfer_id;

  -- TC-3 H-045: reference_doc legible
  v_ref_doc := 'TRANSFERENCIA ' || UPPER(left(v_transfer.id::text, 8)) || ' ' ||
               left(v_transfer.origin_store_id::text, 8) || '→' ||
               left(v_transfer.destination_store_id::text, 8);

  -- Procesar items: consumir reserva + mover stock
  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP

    -- H-041: Consumir reserva — validar que afectó exactamente 1 fila
    UPDATE public.inventory_reservations
      SET status = 'CONSUMED', consumed_at = NOW()
      WHERE reference_type = 'TRANSFER'
        AND reference_id = p_transfer_id
        AND product_id = v_item.product_id
        AND status = 'ACTIVE';

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE EXCEPTION 'ERR_RESERVATION_NOT_FOUND: No hay reserva ACTIVE para transferencia % producto %',
        p_transfer_id, v_item.product_id;
    END IF;

    -- Descontar stock del origen (transfer_out)
    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL, NULL,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);

    -- Añadir stock al destino (transfer_in) — usar destination_product_id
    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL, NULL,
      v_item.unit_cost, NULL, p_operation_date, FALSE
    );
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id, 'at', NOW(),
      'requires_approval_was', COALESCE(v_transfer.requires_approval, false),
      'was_approved', v_transfer.approved_at IS NOT NULL,
      'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED'),
      'reference_doc', v_ref_doc));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- TC-2: reverse_transfer refactorizado con register_stock_movement
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_transfer(
  p_transfer_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: Solo se pueden revertir transferencias confirmadas (estado actual: %)', v_transfer.status;
  END IF;

  -- H-052: Validar acceso a AMBAS tiendas
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;

  -- TC-3 H-045: reference_doc legible
  v_ref_doc := 'REVERSIÓN ' || UPPER(left(v_transfer.id::text, 8)) || ' ' ||
               left(v_transfer.origin_store_id::text, 8) || '→' ||
               left(v_transfer.destination_store_id::text, 8) || ' [' || left(p_reason, 50) || ']';

  -- Procesar items: devolver stock al origen + quitar del destino
  FOR v_item IN
    SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- H-050: Validar destination_product_id no es NULL
    IF v_item.destination_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_DEST_PRODUCT_NULL: transfer_item % no tiene destination_product_id', v_item.id;
    END IF;

    -- 1. Devolver stock al ORIGEN (transfer_in — cantidad positiva)
    -- Usa register_stock_movement para garantirar: stock_movements + inventory + kardex + business_events
    v_mov := public.register_stock_movement(
      v_item.product_id,           -- producto origen
      v_transfer.origin_store_id,  -- tienda origen
      v_item.quantity,             -- cantidad POSITIVA (devolver)
      'transfer_in',               -- movimiento de entrada
      v_ref_doc,                   -- reference_doc legible
      v_caller_uid,
      NULL, NULL,
      v_item.unit_cost,
      'Reversión: devolución al origen',
      NOW(),
      TRUE                         -- skip_access_check (ya validado arriba)
    );

    -- 2. Quitar stock del DESTINO (transfer_out — cantidad negativa)
    -- H-050: Usa destination_product_id (NO product_id)
    v_mov := public.register_stock_movement(
      v_item.destination_product_id,  -- H-050: producto DESTINO (no origen)
      v_transfer.destination_store_id,
      -v_item.quantity,               -- cantidad NEGATIVA (quitar)
      'transfer_out',                 -- movimiento de salida
      v_ref_doc,
      v_caller_uid,
      NULL, NULL,
      v_item.unit_cost,
      'Reversión: retiro del destino',
      NOW(),
      TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  -- Actualizar estado de la transferencia
  UPDATE public.transfers
    SET status = 'REVERSADA',
        reversed_at = now(),
        reversed_by = v_caller_uid,
        reversal_reason = p_reason
    WHERE id = p_transfer_id;

  -- Audit log completo
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_transfer.origin_store_id,
    'transfer_reversed', 'transfers', p_transfer_id,
    jsonb_build_object(
      'reason', p_reason,
      'reversed_at', now(),
      'reversed_by', v_caller_uid,
      'origin_store', v_transfer.origin_store_id,
      'destination_store', v_transfer.destination_store_id,
      'items_reversed', v_count,
      'reference_doc', v_ref_doc,
      'stock_movements_generated', v_count * 2
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'items_reversed', v_count,
    'transfer_id', p_transfer_id,
    'reference_doc', v_ref_doc
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer(uuid, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reverse_transfer(uuid, text, uuid) FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- TC-3: Mejorar create_transfer — producto espejo con más campos
-- ────────────────────────────────────────────────────────────────────────────
-- H-049: Copiar category, description, price, price_currency del origen

CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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
$function$;
