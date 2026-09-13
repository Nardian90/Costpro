-- DECLARED FINAL STATE (Git) de reopen_cash_shift
-- fuente: 20260911000000_rem_sec1_security_boundaries.sql stmt#6

CREATE OR REPLACE FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: reason must be at least 3 characters';
  END IF;

  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'cerrado' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_CLOSED: status=%', v_closure.status;
  END IF;

  -- Auth: solo admin/manager del store
  IF v_caller_uid IS NULL OR NOT public.has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins/managers can reopen cash closures';
  END IF;

  -- Bypass del trigger de inmutabilidad
  PERFORM set_config('app.bypass_closure_lock', 'true', false);

  UPDATE public.cash_closures SET
    status = 'pendiente',
    notes = COALESCE(notes, '') || E'\n[REOPENED ' || NOW()::text || E'] ' || p_reason
  WHERE id = p_closure_id;

  PERFORM set_config('app.bypass_closure_lock', 'false', false);

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_REOPENED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', 'cerrado', 'reopened_at', NOW()));

  RETURN jsonb_build_object('status', 'success', 'closure_id', p_closure_id);
END;
$function$
