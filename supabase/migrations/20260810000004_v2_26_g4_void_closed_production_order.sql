-- ══════════════════════════════════════════════════════════════════════
-- F-16 G4 — Fix void_closed_production_order
--
-- Cambios:
-- 1. Usar register_stock_movement en vez de UPDATE directo de products
-- 2. WAC reversal usando output_total_cost snapshot (no recalcular desde items)
-- 3. Validar stock suficiente antes de revertir output (ERR_PRODUCTION_OUTPUT_ALREADY_CONSUMED)
-- 4. Reset payment_status = 'unpaid', paid_amount = 0
-- 5. Marcar payment_transactions como REVERSED (notes)
-- 6. Idempotencia: si ya está voided, retornar success
-- 7. audit_logs global
-- 8. SELECT FOR UPDATE
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.void_closed_production_order(
  p_order_id uuid,
  p_reason text DEFAULT 'Anulación',
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_count INTEGER := 0;
  v_reversed_payments INTEGER := 0;
BEGIN
  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  -- ─── 2. Idempotencia: si ya está voided, retornar success ───
  IF v_order.status = 'voided' THEN
    RETURN jsonb_build_object('status', 'already_voided', 'order_id', p_order_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Solo permitir anular OTs cerradas ───
  IF v_order.status != 'closed' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED: status actual %', v_order.status;
  END IF;

  -- ─── 5. Si tiene transaction_id (venta), marcarla como voided ───
  IF v_order.transaction_id IS NOT NULL THEN
    UPDATE public.transactions
      SET status = 'voided'
      WHERE id = v_order.transaction_id AND status = 'completed';
  END IF;

  -- ─── 6. Validar stock suficiente para revertir output ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0 THEN

    SELECT stock_current, COALESCE(cost_average, 0)
      INTO v_output_stock, v_output_wac
    FROM products WHERE id = v_order.output_product_id FOR UPDATE;

    IF v_output_stock < v_order.output_quantity THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_OUTPUT_ALREADY_CONSUMED: stock (%) < output_quantity (%). Revertir la venta primero.',
        v_output_stock, v_order.output_quantity;
    END IF;
  END IF;

  -- ─── 7. Reabastecer insumos via register_stock_movement ───
  FOR v_item IN
    SELECT poi.*, p.store_id as p_store_id
    FROM production_order_items poi
    JOIN products p ON p.id = poi.product_id
    WHERE poi.order_id = p_order_id AND poi.actual_qty > 0
    ORDER BY poi.id
  LOOP
    PERFORM register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.actual_qty,
      p_movement_type := 'production_reverse',
      p_reason := 'Anulación OT ' || v_order.order_number || ' - devolución insumo',
      p_unit_cost := 0,
      p_notes := 'void:' || p_order_id::text,
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 8. Descontar output product via register_stock_movement ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0 THEN

    PERFORM register_stock_movement(
      p_product_id := v_order.output_product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_order.output_quantity,
      p_movement_type := 'production_reverse',
      p_reason := 'Anulación OT ' || v_order.order_number || ' - retirar output',
      p_unit_cost := 0,
      p_notes := 'void:' || p_order_id::text,
      p_skip_access_check := TRUE
    );

    -- ─── 9. WAC reversal usando snapshot output_total_cost ───
    v_new_stock := v_output_stock - v_order.output_quantity;
    IF v_new_stock > 0 THEN
      v_new_wac := (v_output_stock * v_output_wac - v_order.output_total_cost) / v_new_stock;
      v_new_wac := GREATEST(v_new_wac, 0);
    ELSE
      v_new_wac := 0;
    END IF;

    UPDATE products SET
      cost_average = v_new_wac,
      cost_price = v_new_wac,
      updated_at = now()
    WHERE id = v_order.output_product_id;

    v_count := v_count + 1;
  END IF;

  -- ─── 10. Marcar payment_transactions como REVERSED ───
  UPDATE payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by void OT ' || p_order_id::text || ' at ' || now()::text || ']'
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id
  RETURNING id INTO v_item; -- just to count

  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- ─── 11. Marcar OT como voided + reset payment_status ───
  UPDATE production_orders
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      reversed_at = now(),
      reversed_by = v_caller_uid,
      reversal_reason = p_reason
  WHERE id = p_order_id;

  -- ─── 12. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_VOIDED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', p_reason,
      'items_reversed', v_count,
      'payments_reversed', v_reversed_payments,
      'output_total_cost_snapshot', v_order.output_total_cost,
      'wac_before', v_output_wac,
      'wac_after', v_new_wac
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'items_reversed', v_count,
    'payments_reversed', v_reversed_payments
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid, text, uuid) TO authenticated;
