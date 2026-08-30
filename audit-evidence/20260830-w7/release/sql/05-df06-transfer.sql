-- ============================================================================
-- 05-df06-transfer.sql — W6.2 LAB · DF-06 TRANSFERENCIA CON BLEND D-01
-- Diseño: W62-04 DF-06. Requiere paquetes 01-04.
-- confirm_transfer: blend destino (transfer_in) con uc_transfer congelado, vía
--   fn_recalc_wac ANTES del movimiento dest-in (kardex ve ca_new).
-- reverse_transfer: reversa simétrica (transfer_reverse, q<0) reconstruida.
-- Invariante E-T: valor_origen_antes = transferido + valor_origen_restante;
--   ΔV_destino = q·uc_transfer (cero valor creado/destruido en el par).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
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
END $fn$;

CREATE OR REPLACE FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_ref_doc TEXT;
  v_mov JSONB;
  v_dest_stock NUMERIC;
  v_new_wac NUMERIC;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: estado actual: %', v_transfer.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;

  v_ref_doc := 'REVERSIÓN ' || UPPER(left(v_transfer.id::text, 8)) || ' [' || left(p_reason, 50) || ']';

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    IF v_item.destination_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_DEST_PRODUCT_NULL: item %', v_item.id;
    END IF;

    -- DF-06: reversa simétrica del blend destino (q<0 con uc congelado) ANTES de mover stock
    SELECT stock_current INTO v_dest_stock FROM public.products
      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id
      FOR UPDATE;
    IF COALESCE(v_dest_stock,0) - v_item.quantity > 0 THEN
      v_new_wac := public.fn_recalc_wac(
        v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_reverse',
        -v_item.quantity, v_item.unit_cost,
        jsonb_build_object('rpc','reverse_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));
    END IF;

    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, 'Reversión: devolución al origen', NOW(), TRUE
    );

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, 'Reversión: retiro del destino', NOW(), TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.transfers
    SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_transfer_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_reversed', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count, 'reference_doc', v_ref_doc,
      'dest_reverse_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END $fn$;

\echo '05: DF-06 aplicado — blend destino transfer_in/transfer_reverse vía fn_recalc_wac'
