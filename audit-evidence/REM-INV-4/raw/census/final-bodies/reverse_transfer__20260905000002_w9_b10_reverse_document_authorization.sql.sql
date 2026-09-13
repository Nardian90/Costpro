-- DECLARED FINAL STATE (Git) de reverse_transfer
-- fuente: 20260905000002_w9_b10_reverse_document_authorization.sql stmt#3

CREATE OR REPLACE FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- W9.5 B-10: capa normativa de rol resuelta en la tienda ORIGEN (duena del
  -- documento y del audit). El acceso al DESTINO sigue siendo requisito
  -- adicional (naturaleza bidireccional de la transferencia).
  IF NOT public.can_reverse_document(v_caller_uid, v_transfer.origin_store_id, 'transfer') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de transferencia requiere rol admin/manager/encargado/warehouse en la tienda de origen';
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
      'old_status', v_transfer.status, 'new_status', 'REVERSADA',
      'operation', 'ADMIN_REVERSE_TRANSFER',
      'dest_reverse_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END $function$
