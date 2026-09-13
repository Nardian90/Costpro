-- DECLARED FINAL STATE (Git) de confirm_transfer
-- fuente: 20260802000005_v2_12_44_transfer_confirm_remediation.sql stmt#0

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
$function$
