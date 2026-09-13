-- DECLARED FINAL STATE (Git) de reverse_vale_salida
-- fuente: 20260817000001_vale_salida.sql stmt#45

CREATE OR REPLACE FUNCTION public.reverse_vale_salida(
  p_slip_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid;
  v_store_id uuid;
  v_slip_number text;
  v_production_order_id uuid;
  v_item RECORD;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                        THEN COALESCE(p_user_id, auth.uid())
                        ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT store_id INTO v_store_id FROM issue_slips WHERE id = p_slip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));

  IF NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- V-03 DEFENSE 1: status must be 'completed' (no double reversal)
  -- V-03 DEFENSE 2: slip must have at least one original movement (issue_slip_out or production_out)
  -- The second defense is redundant with the first but protects against data corruption
  -- and future modifications that might break the status check.
  IF NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_id::text = p_slip_id::text
      AND movement_type IN ('issue_slip_out', 'production_out')
  ) THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: no original movement found (issue_slip_out or production_out)';
  END IF;

  UPDATE issue_slips
  SET status = 'reversed',
      voided_at = now(),
      voided_by = v_caller_uid,
      void_reason = p_reason
  WHERE id = p_slip_id
    AND status = 'completed'
  RETURNING slip_number, production_order_id INTO v_slip_number, v_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: status must be completed';
  END IF;

  FOR v_item IN
    SELECT si.product_id, si.variant_id, si.production_order_item_id,
           si.quantity, si.unit_cost
    FROM issue_slip_items si
    WHERE si.slip_id = p_slip_id
    ORDER BY si.created_at
  LOOP
    DECLARE
      v_reverse_type text;
    BEGIN
      IF v_item.production_order_item_id IS NOT NULL THEN
        v_reverse_type := 'production_reverse';
        UPDATE production_order_items
        SET actual_qty = actual_qty - v_item.quantity,
            status = CASE
              WHEN actual_qty - v_item.quantity <= 0 THEN 'pending'
              ELSE 'partial'
            END,
            updated_at = now()
        WHERE id = v_item.production_order_item_id;
      ELSE
        v_reverse_type := 'issue_slip_reverse';
      END IF;

      PERFORM register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := v_store_id,
        p_user_id := v_caller_uid,
        p_quantity := v_item.quantity,
        p_movement_type := v_reverse_type,
        p_sale_id := p_slip_id,
        p_unit_cost := v_item.unit_cost,
        p_reason := 'Reversion Vale de Salida ' || v_slip_number,
        p_notes := COALESCE(p_reason, 'Reversion'),
        p_variant_id := v_item.variant_id,
        p_skip_access_check := TRUE
      );
    END;
  END LOOP;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'REVERSE_VALE_SALIDA', 'issue_slips', p_slip_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'slip_number', v_slip_number,
      'reason', p_reason,
      'reversed_at', now(),
      'production_order_id', v_production_order_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'slip_id', p_slip_id,
    'slip_number', v_slip_number,
    'new_status', 'reversed'
  );
END;
$function$
