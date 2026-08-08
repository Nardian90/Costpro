-- ══════════════════════════════════════════════════════════════════════
-- F-16 G5 — Fix reverse_production_order
--
-- Mismo patrón que G4 void_closed_production_order:
-- 1. Usar register_stock_movement en vez de UPDATE directo
-- 2. WAC reversal usando output_total_cost snapshot
-- 3. Validar stock suficiente (ERR_PRODUCTION_OUTPUT_ALREADY_CONSUMED)
-- 4. Idempotencia: si ya está reversed, retornar success
-- 5. audit_logs global
-- 6. SELECT FOR UPDATE
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reverse_production_order(
  p_order_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
BEGIN
  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia ───
  IF v_order.status = 'reversed' THEN
    RETURN jsonb_build_object('status', 'already_reversed', 'order_id', p_order_id);
  END IF;

  -- ─── 3. Validaciones ───
  IF v_order.status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use void, no reverse';
  END IF;
  IF v_order.status IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: no se puede revertir una orden sin avance (use void)';
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar stock suficiente para revertir output ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    SELECT stock_current, COALESCE(cost_average, 0)
      INTO v_output_stock, v_output_wac
    FROM products WHERE id = v_order.output_product_id FOR UPDATE;

    IF v_output_stock < v_order.output_quantity THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_OUTPUT_ALREADY_CONSUMED: stock (%) < output_quantity (%). Revertir la venta primero.',
        v_output_stock, v_order.output_quantity;
    END IF;
  END IF;

  -- ─── 5. Devolver insumos via register_stock_movement ───
  FOR v_item IN
    SELECT product_id, actual_qty, variant_id
    FROM production_order_items
    WHERE order_id = p_order_id AND actual_qty > 0
    ORDER BY id
  LOOP
    PERFORM register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_uid,
      p_quantity := v_item.actual_qty,
      p_movement_type := 'production_reverse',
      p_reason := 'Reversión de orden: insumo devuelto',
      p_unit_cost := 0,
      p_notes := 'reverse:' || p_order_id::text,
      p_variant_id := v_item.variant_id,
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 6. Retirar output product via register_stock_movement + WAC reversal ───
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    PERFORM register_stock_movement(
      p_product_id := v_order.output_product_id,
      p_store_id := v_order.store_id,
      p_user_id := v_uid,
      p_quantity := -v_order.output_quantity,
      p_movement_type := 'production_reverse',
      p_reason := 'Reversión de orden: output retirado',
      p_unit_cost := 0,
      p_notes := 'reverse:' || p_order_id::text,
      p_skip_access_check := TRUE
    );

    -- WAC reversal usando snapshot
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

  -- ─── 7. Marcar orden como reversed ───
  UPDATE production_orders
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_uid, v_order.store_id, 'PRODUCTION_REVERSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'reason', p_reason,
      'items_reversed', v_count,
      'output_total_cost_snapshot', v_order.output_total_cost,
      'wac_before', v_output_wac,
      'wac_after', v_new_wac
    )
  );

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'order_id', p_order_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.reverse_production_order(uuid, text, uuid) TO authenticated;
