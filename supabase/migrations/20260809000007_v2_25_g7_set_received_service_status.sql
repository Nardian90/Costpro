-- ══════════════════════════════════════════════════════════════════════
-- F-30 G7 — RPC set_received_service_status (state machine server-side)
-- Resuelve: Iter 4 (4C+5A state machine), Iter 6 #5-8
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_received_service_status(
  p_service_id uuid,
  p_new_status text,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_store_id uuid;
  v_current text;
  v_service_number text;
  v_allowed text[];
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number
  INTO v_store_id, v_current, v_service_number
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_current = p_new_status THEN
    RETURN jsonb_build_object('status', 'no_change', 'service_status', v_current);
  END IF;

  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['active', 'cancelled']::text[]
    WHEN 'active'  THEN ARRAY['voided']::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current, p_new_status, array_to_string(v_allowed, ', ');
  END IF;

  PERFORM set_config('app.is_status_change_rpc', 'true', true);

  UPDATE received_services SET status = p_new_status, updated_at = NOW()
  WHERE id = p_service_id;

  PERFORM set_config('app.is_status_change_rpc', 'false', true);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_STATUS_CHANGED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'from_status', v_current, 'to_status', p_new_status, 'reason', p_reason
    ));

  RETURN jsonb_build_object('status', 'success', 'service_status', p_new_status, 'previous_status', v_current);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.set_received_service_status TO authenticated;
