-- ============================================================================
-- W9.5 — B-10 · Autorización diferenciada para los 5 tipos restantes de
-- /api/reverse (receipt, transfer, adjustment, devolution, production_order)
-- Migración: 20260905000002 (versionada, idempotente, SIN DROP CASCADE)
--
-- Política congelada: audit-evidence/20260905-w9-b10/02-policy-matrix.md
--   - receipt:         membership admin/manager/encargado/warehouse (+*)
--   - transfer:        membership admin/manager/encargado/warehouse en ORIGEN
--                      (+ acceso DESTINO preexistente) (+*)
--   - adjustment:      membership admin/manager/encargado (+*) + FIX B-10-ADJ-1
--                      (inversión verdadera vía contra-documento)
--   - devolution:      membresía activa (C conservar, como su creación) (+*)
--                      + hardening: FOR UPDATE + estado 'completed' + audit
--   - production_order:membership admin/manager/costo (+*)
--
-- INVARIANTES: firmas/owner/SECURITY DEFINER/search_path/ACL de los RPC
-- existentes intactas; FOR UPDATE conservado/añadido; mecánica financiera
-- intacta (solo guards + audit aditivo). has_store_access_as sin cambios.
-- ROLLBACK: audit-evidence/20260905-w9-b10/rollback_b10.sql (cuerpos PRE).
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- 1. HELPER NORMATIVO ÚNICO (fuente de la política B-10 para los 5 tipos)
--    Espejo DB de la doctrina de src/lib/roles.ts; espejo UI:
--    canReverseDocumentInStore. STORE ACCESS ≠ OPERATION AUTHORIZATION.
--    Politica congelada: audit-evidence/20260905-w9-b10/02-policy-matrix.md
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL OR p_operation IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;
  IF v_membership_role IS NULL THEN RETURN false; END IF;
  IF v_membership_role = 'admin' THEN RETURN true; END IF;

  CASE p_operation
    WHEN 'receipt' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'transfer' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'adjustment' THEN
      RETURN v_membership_role IN ('manager','encargado');
    WHEN 'devolution' THEN
      RETURN true; -- cualquier membresía activa (simétrica a la creación; módulo dormant)
    WHEN 'production_order' THEN
      RETURN v_membership_role IN ('manager','costo');
    ELSE
      RETURN false;
  END CASE;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. reverse_inventory_adjustment_v2 (B-10-ADJ-1) — INVERSIÓN verdadera.
--    El path activo de /api/reverse para 'adjustment' era
--    duplicate_inventory_adjustment_v2 (re-aplica el MISMO delta). El
--    contrato del producto (tooltip del botón, comentario del hook, V1) es
--    INVERTIR. Esta función crea un CONTRA-DOCUMENTO con items esperado<->​
--    contado intercambiados y aplica -diff vía register_stock_movement.
--    El botón "Duplicar" conserva duplicate_inventory_adjustment_v2 intacto.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_counter_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_original.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_original.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo ajustes confirmed pueden revertirse (status=%)', v_original.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.can_reverse_document(v_caller_uid, v_original.store_id, 'adjustment') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de ajuste requiere rol admin/manager/encargado en la tienda';
  END IF;

  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_counter_id, v_original.store_id, 'confirmed',
    v_original.reason, v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);
    IF v_diff = 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_counter_id, v_item.product_id, v_item.counted_quantity, v_item.expected_quantity
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_counter_id,
      p_unit_cost := 0,
      p_reason := 'Reversión de ajuste: ' || COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = NOW(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_ADJUSTMENT_V2', 'inventory_adjustments', p_adjustment_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'counter_adjustment_id', v_counter_id,
      'items_reversed', v_count, 'old_status', v_original.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_ADJUSTMENT'));

  RETURN jsonb_build_object('status', 'success', 'adjustment_id', p_adjustment_id,
    'counter_adjustment_id', v_counter_id, 'items_reversed', v_count);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. reverse_receipt_v2 (cuerpo live dd3f3276 + capa de rol + audit aditivo)
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  -- R1/R6: real caller identity. service_role callers are server-side actors
  -- (/api/reverse injects session.user.id); every other role is pinned to
  -- auth.uid() so p_user_id cannot forge authorship.
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
  v_current_stock numeric;
  v_new_stock numeric;
  v_unit_cost_cup numeric;
  v_items_processed int := 0;
  v_reversed_payments int := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: status=%', v_receipt.status;
  END IF;

  -- R1 [P1]: tenant/store isolation. Mirrors V1 model + PR-4 guard.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa de rol (fuente unica can_reverse_document).
  -- Politica congelada: operadores de recepciones (membership admin/manager/
  -- encargado/warehouse en la tienda del receipt) o admin global transversal.
  IF NOT public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de recepcion requiere rol admin/manager/encargado/warehouse en la tienda';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_current_stock
    FROM public.products
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id
    FOR UPDATE;
    v_current_stock := COALESCE(v_current_stock, 0);

    -- R2: exact inverse. fn_recalc_wac raises ERR_WAC_REVERSE_NEGATIVE_STOCK
    -- when S + q <= 0 (detection over silence — W7 D-01 / PR-4 / B-12 contract).
    -- fn_recalc_wac locks the product row and updates cost_average with the
    -- app.wac_writer token (single writer).
    PERFORM public.fn_recalc_wac(
      v_receipt.store_id, v_item.product_id, 'reception_reverse',
      -v_item.quantity, v_unit_cost_cup,
      jsonb_build_object('rpc', 'reverse_receipt_v2', 'receipt_id', p_receipt_id));

    v_new_stock := v_current_stock - v_item.quantity;

    UPDATE public.products
    SET stock_current = v_new_stock, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.stock_movements
      (product_id, store_id, movement_type, quantity_change, unit_cost,
       reference_doc, created_at, created_by, movement_date)
    VALUES
      (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type,
       -v_item.quantity, v_unit_cost_cup,
       'Reversión recepción: ' || COALESCE(p_reason, ''), now(), v_caller_uid, now());

    v_items_processed := v_items_processed + 1;
  END LOOP;

  UPDATE public.receipts
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = v_caller_uid,
      reversal_reason = p_reason,
      -- R3: payment reset (PR-4 / void_pending_reception canonical pattern)
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL
  WHERE id = p_receipt_id;

  -- R3: mark related payment transactions (notes marker, canonical pattern)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by reverse_receipt_v2 '
              || p_receipt_id::text || ' at ' || now()::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- R4/R6: unified historical action string + real caller identity
  INSERT INTO public.audit_logs
    (user_id, store_id, action, table_name, record_id, metadata)
  VALUES
    (v_caller_uid, v_receipt.store_id, 'REVERSE_RECEIPT_V2', 'receipts', p_receipt_id,
     jsonb_build_object('reason', p_reason,
                        'items_processed', v_items_processed,
                        'payments_reversed', v_reversed_payments,
                        'old_status', v_receipt.status, 'new_status', 'reversed',
                        'operation', 'ADMIN_REVERSE_RECEIPT',
                        'v2_reverse', true));

  RETURN jsonb_build_object('status', 'success',
                            'receipt_id', p_receipt_id,
                            'items_processed', v_items_processed,
                            'payments_reversed', v_reversed_payments);
END
$function$
;

-- ═══════════════════════════════════════════════════════════════════
-- 4. reverse_transfer (cuerpo live + capa de rol en ORIGEN + audit aditivo)
-- ═══════════════════════════════════════════════════════════════════
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
;

-- ═══════════════════════════════════════════════════════════════════
-- 5. reverse_devolution (cuerpo live + FOR UPDATE + estado + rol + audit)
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  -- W9.5 B-10: guard de estado explicito (GATE G) — solo completed reversible.
  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa (fuente unica). Politica congelada (C conservar):
  -- cualquier membresia ACTIVA en la tienda, simetrica a la creacion de
  -- devoluciones (modulo dormant, sin puerta de navegacion).
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_dev.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_devolution_id, 'Reversión de devolución', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  -- W9.5 B-10 (GATE J): la operacion deja audit explicito (antes: cero rastro
  -- en audit_logs; solo reversed_by/reversal_reason en la fila).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════
-- 6. reverse_production_order (cuerpo live + capa de rol + audit aditivo)
-- ═══════════════════════════════════════════════════════════════════
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
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
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
END $function$
;

-- ═══════════════════════════════════════════════════════════════════
-- 5. ACL (patrón F06 / B-8)
-- ═══════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.can_reverse_document(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_reverse_document(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.can_reverse_document(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_reverse_document(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) TO service_role;
