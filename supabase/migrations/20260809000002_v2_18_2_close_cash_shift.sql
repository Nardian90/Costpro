-- ============================================================================
-- Migration: 20260809000002_v2_18_2_close_cash_shift.sql
-- Iteración 11.4 — Fix H-3, M-8, M-9, M-CR4
-- ============================================================================
-- RPCs:
--   close_cash_shift: recalcula system_expected_total server-side (con Zelle),
--     advisory lock, SELECT FOR UPDATE, audit atómico.
--   reopen_cash_shift: admin/manager + reason + audit log. Usa variable de
--     sesión app.bypass_closure_lock para bypassar el trigger de inmutabilidad.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. close_cash_shift
DROP FUNCTION IF EXISTS public.close_cash_shift;

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_closure_id uuid,
  p_declared_cash numeric,
  p_declared_vouchers numeric,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_payments numeric := 0;
  v_cash_commissions numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
BEGIN
  -- 1. SELECT FOR UPDATE + validar status
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'pendiente' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status;
  END IF;

  -- 2. Auth
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Advisory lock por store (M-CR4)
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- 4. Recalcular system_expected_total server-side (M-8)
  -- Fórmula: (opening_balance + cash_sales - cash_payments - cash_commissions) + transfer_sales + zelle_sales

  -- Cash sales
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Transfer sales
  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Zelle sales (corrección solicitada)
  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Cash payments to suppliers
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_payments
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- Cash commissions paid
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND paid_at > v_closure.created_at
      AND paid_at <= NOW();

  -- Calcular totales
  v_system_cash := COALESCE(v_closure.opening_balance, 0) + v_cash_sales - v_cash_payments - v_cash_commissions;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (p_declared_cash + p_declared_vouchers) - v_system_expected_total;

  -- 5. UPDATE closure con valores recalculados
  UPDATE public.cash_closures SET
    status = 'cerrado',
    closed_at = NOW(),
    declared_cash = p_declared_cash,
    declared_vouchers = p_declared_vouchers,
    declared_total = p_declared_cash + p_declared_vouchers,
    system_expected_total = v_system_expected_total,
    difference = v_difference,
    notes = p_notes,
    updated_at = NOW()
  WHERE id = p_closure_id;

  -- 6. Audit log atómico (M-9 — reemplaza fire-and-forget)
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object(
      'declared_cash', p_declared_cash,
      'declared_vouchers', p_declared_vouchers,
      'system_expected_total', v_system_expected_total,
      'difference', v_difference,
      'opening_balance', COALESCE(v_closure.opening_balance, 0),
      'cash_sales', v_cash_sales,
      'transfer_sales', v_transfer_sales,
      'zelle_sales', v_zelle_sales,
      'cash_payments', v_cash_payments,
      'cash_commissions', v_cash_commissions,
      'v2_close', true
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'closure_id', p_closure_id,
    'system_expected_total', v_system_expected_total,
    'difference', v_difference
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_cash_shift FROM anon;
GRANT EXECUTE ON FUNCTION public.close_cash_shift TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift TO service_role;

-- 2. reopen_cash_shift
DROP FUNCTION IF EXISTS public.reopen_cash_shift;

CREATE OR REPLACE FUNCTION public.reopen_cash_shift(
  p_closure_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
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
    notes = COALESCE(notes, '') || E'\n[REOPENED ' || NOW()::text || E'] ' || p_reason,
    updated_at = NOW()
  WHERE id = p_closure_id;

  PERFORM set_config('app.bypass_closure_lock', 'false', false);

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_REOPENED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', 'cerrado', 'reopened_at', NOW()));

  RETURN jsonb_build_object('status', 'success', 'closure_id', p_closure_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reopen_cash_shift FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_cash_shift TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_cash_shift TO service_role;

COMMENT ON FUNCTION public.close_cash_shift IS
  'Iteración 11.4 (H-3, M-8, M-9, M-CR4): Closes cash shift with server-side recalculation (including Zelle), advisory lock, atomic audit.';
COMMENT ON FUNCTION public.reopen_cash_shift IS
  'Iteración 11.4 (H-3): Reopens closed cash shift. Requires admin/manager + reason. Uses app.bypass_closure_lock session variable.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.close_cash_shift;
-- DROP FUNCTION IF EXISTS public.reopen_cash_shift;
-- ============================================================================
