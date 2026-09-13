-- DECLARED FINAL STATE (Git) de adjust_total_amount
-- fuente: 20260812000001_pr4_4i_payment_transactions_hardening.sql stmt#23

CREATE OR REPLACE FUNCTION public.adjust_total_amount(
  p_transaction_id uuid,
  p_new_total numeric,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_actor uuid;
  v_old_total numeric;
  v_store_id uuid;
  v_paid_total numeric;
  v_lock_key bigint;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: p_reason cannot be empty' USING ERRCODE = 'PT013';
  END IF;

  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_TOTAL: p_new_total must be >= 0 and non-null, got %', p_new_total
      USING ERRCODE = 'PT012';
  END IF;

  v_lock_key := hashtextextended(p_transaction_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT total_amount, store_id
    INTO v_old_total, v_store_id
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016';
  END IF;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total
  FROM public.payment_transactions
  WHERE transaction_id = p_transaction_id;

  IF v_paid_total > p_new_total + 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS: existing payments=% > new_total=%. Cannot violate I1a.',
      v_paid_total, p_new_total
      USING ERRCODE = 'PT002';
  END IF;

  IF v_old_total = p_new_total THEN
    INSERT INTO public.audit_logs (
      action, table_name, record_id, store_id, user_id, metadata
    ) VALUES (
      'ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object(
        'total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP',
        'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor
      )
    );
    RETURN true;
  END IF;

  UPDATE public.transactions
    SET total_amount = p_new_total
    WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (
    action, table_name, record_id, store_id, user_id, metadata
  ) VALUES (
    'ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
    jsonb_build_object(
      'old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason,
      'paid_total_at_time', v_paid_total,
      'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor
    )
  );

  RETURN true;
END;
$function$
