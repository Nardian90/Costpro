-- ════════════════════════════════════════════════════════════════════════
-- V2.3.1 — FIX: bypass auth check en reverse_* cuando v_uid es NULL
-- (caller es service_role desde /api/reverse endpoint server-side)
-- ════════════════════════════════════════════════════════════════════════

-- reverse_receipt
CREATE OR REPLACE FUNCTION public.reverse_receipt(
  p_receipt_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_receipt.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_receipt.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_receipt_id, 'Reversión de recepción', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.receipts
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_receipt_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'receipt_id', p_receipt_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reverse_receipt TO authenticated, service_role;

-- reverse_transfer
CREATE OR REPLACE FUNCTION public.reverse_transfer(
  p_transfer_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN RAISE EXCEPTION 'ERR_NOT_CONFIRMED: Solo se pueden revertir transferencias confirmadas'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    UPDATE public.products SET stock_current = stock_current + v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_transfer.origin_store_id;
    UPDATE public.products SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_transfer.destination_store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_transfer.origin_store_id, v_item.product_id, 'transfer_in', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_transfer_id, 'Reversión de transferencia', v_uid
    FROM public.products p WHERE p.id = v_item.product_id AND p.store_id = v_transfer.origin_store_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.transfers
    SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reverse_transfer TO authenticated, service_role;

-- reverse_adjustment
CREATE OR REPLACE FUNCTION public.reverse_adjustment(
  p_adjustment_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity_change FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    UPDATE public.products
      SET stock_current = stock_current - v_item.quantity_change, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_adj.store_id, v_item.product_id, 'adjustment', ABS(v_item.quantity_change), 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_adjustment_id, 'Reversión de ajuste', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'adjustment_id', p_adjustment_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reverse_adjustment TO authenticated, service_role;

-- reverse_devolution
CREATE OR REPLACE FUNCTION public.reverse_devolution(
  p_devolution_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
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

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reverse_devolution TO authenticated, service_role;

-- reverse_production_order
CREATE OR REPLACE FUNCTION public.reverse_production_order(
  p_order_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_order.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use reverse solo en órdenes avanzadas'; END IF;
  IF v_order.status IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: no se puede revertir una orden sin avance (use void)';
  END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, actual_qty, variant_id
    FROM public.production_order_items
    WHERE order_id = p_order_id AND actual_qty > 0
  LOOP
    UPDATE public.products
      SET stock_current = stock_current + v_item.actual_qty, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_order.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_order.store_id, v_item.product_id, 'devolution_in', v_item.actual_qty, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_order_id, 'Reversión de orden: insumo devuelto', v_uid
    FROM public.products p WHERE p.id = v_item.product_id AND p.store_id = v_order.store_id;

    v_count := v_count + 1;
  END LOOP;

  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_order.output_quantity), updated_at = now()
      WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_order.store_id, v_order.output_product_id, 'out', v_order.output_quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_order_id, 'Reversión de orden: output retirado', v_uid
    FROM public.products p WHERE p.id = v_order.output_product_id AND p.store_id = v_order.store_id;

    v_count := v_count + 1;
  END IF;

  UPDATE public.production_orders
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'order_id', p_order_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reverse_production_order TO authenticated, service_role;
