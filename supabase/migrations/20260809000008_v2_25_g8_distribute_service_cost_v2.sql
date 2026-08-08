-- ══════════════════════════════════════════════════════════════════════
-- F-30 G8 — RPC distribute_service_cost_v2 (atomica, SELECT FOR UPDATE, recalcula WAC)
-- Reemplaza distribute/route.ts
-- Resuelve: Iter 2 #1,4 (no atomica, no FOR UPDATE), Iter 9 #3
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.distribute_service_cost_v2(
  p_service_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_status text;
  v_total_amount numeric;
  v_service received_services%ROWTYPE;
  v_method text;
  v_link service_reception_links%ROWTYPE;
  v_item receipt_items%ROWTYPE;
  v_total_value numeric := 0;
  v_total_qty numeric := 0;
  v_allocated numeric;
  v_dist_count integer := 0;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT * INTO v_service FROM received_services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  v_store_id := v_service.store_id;
  v_status := v_service.status;
  v_total_amount := v_service.total_amount;
  v_method := v_service.distribution_method;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_ACTIVE: status % is not active', v_status;
  END IF;

  IF v_method = 'manual' THEN
    RAISE EXCEPTION 'ERR_MANUAL_METHOD: use link_receipts_to_service for manual distribution';
  END IF;

  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;

  FOR v_link IN SELECT * FROM service_reception_links WHERE service_id = p_service_id AND allocated_amount > 0 ORDER BY receipt_id LOOP
    v_allocated := v_link.allocated_amount;

    IF v_method = 'amount' THEN
      SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total_value
      FROM receipt_items WHERE receipt_id = v_link.receipt_id;
      IF v_total_value > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_link.receipt_id ORDER BY id LOOP
          INSERT INTO service_cost_distributions
            (service_id, receipt_id, receipt_item_id, product_id, distribution_amount, distribution_percentage)
          VALUES
            (p_service_id, v_link.receipt_id, v_item.id, v_item.product_id,
             v_allocated * (v_item.quantity * v_item.unit_cost / v_total_value),
             (v_item.quantity * v_item.unit_cost / v_total_value) * 100);
          v_dist_count := v_dist_count + 1;
        END LOOP;
      END IF;

    ELSIF v_method = 'quantity' THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
      FROM receipt_items WHERE receipt_id = v_link.receipt_id;
      IF v_total_qty > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_link.receipt_id ORDER BY id LOOP
          INSERT INTO service_cost_distributions
            (service_id, receipt_id, receipt_item_id, product_id, distribution_amount, distribution_percentage)
          VALUES
            (p_service_id, v_link.receipt_id, v_item.id, v_item.product_id,
             v_allocated * (v_item.quantity / v_total_qty),
             (v_item.quantity / v_total_qty) * 100);
          v_dist_count := v_dist_count + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Forzar recalculo de WAC para cada producto afectado
  UPDATE receipt_items SET updated_at = NOW()
  WHERE product_id IN (SELECT DISTINCT product_id FROM service_cost_distributions WHERE service_id = p_service_id);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_DISTRIBUTED', 'received_services', p_service_id,
    jsonb_build_object('rows_distributed', v_dist_count, 'method', v_method, 'total_amount', v_total_amount));

  RETURN jsonb_build_object('status', 'success', 'distributed_rows', v_dist_count);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.distribute_service_cost_v2 TO authenticated;
