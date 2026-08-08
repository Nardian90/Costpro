-- ══════════════════════════════════════════════════════════════════════
-- F-30 G6 — RPC void_received_service_with_reversal
-- Patron: void_reception_with_reversal v2.22.0
-- Resuelve: Iter 4 (4C+5A), Iter 6 (5C+8A), Iter 5 #3
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.void_received_service_with_reversal(
  p_service_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Anulacion con reversion',
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_payment_status text;
  v_paid_amount numeric;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
  v_eff_date timestamp with time zone := COALESCE(p_operation_date, NOW());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, payment_status, paid_amount
  INTO v_store_id, v_status, v_service_number, v_payment_status, v_paid_amount
  FROM received_services
  WHERE id = p_service_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  PERFORM set_config('app.is_void_rpc', 'true', true);

  DELETE FROM service_reception_links WHERE service_id = p_service_id;
  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;

  UPDATE received_services
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_service_id;

  UPDATE payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by service void ' || p_service_id::text || ' at ' || v_eff_date::text || ']'
  WHERE ref_type = 'service' AND ref_id = p_service_id;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_VOIDED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'reason', p_reason,
      'before_status', v_status,
      'after_status', 'voided',
      'before_payment_status', v_payment_status,
      'before_paid_amount', v_paid_amount,
      'payment_transactions_reversed', (SELECT COUNT(*) FROM payment_transactions WHERE ref_type='service' AND ref_id=p_service_id)
    ));

  PERFORM set_config('app.is_void_rpc', 'false', true);

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'new_status', 'voided'
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.void_received_service_with_reversal TO authenticated;
