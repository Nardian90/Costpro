-- ============================================================================
-- Migration: 20260811000003_v2_20_3_fix_close_cash_shift_updated_at.sql
-- Hot-test patch (Iteración 11.5): fix pre-existing bug in close_cash_shift
-- ============================================================================
-- BUG: close_cash_shift RPC tried to UPDATE cash_closures.updated_at, but that
-- column does NOT exist (only closed_at and created_at exist). This caused
-- every close_cash_shift call to fail with:
--   "column \"updated_at\" of relation \"cash_closures\" does not exist"
--
-- FIX: remove `updated_at = NOW()` from the UPDATE - `closed_at = NOW()` is
-- already set on the same line and is semantically correct for closures.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text DEFAULT NULL, p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

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
  v_tax_total numeric := 0;
  v_devolutions_total numeric := 0;
  v_z_number text;
  v_z_id uuid;
  v_tx_count int := 0;
BEGIN
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND'; END IF;
  IF v_closure.status <> 'pendiente' THEN RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- Recalcular (mismo código de 11.4)
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_payments FROM public.payment_transactions WHERE store_id = v_closure.store_id AND payment_method = 'cash' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions FROM public.commission_payments WHERE store_id = v_closure.store_id AND status = 'paid' AND paid_at > v_closure.created_at AND paid_at <= NOW();
  SELECT COUNT(*) INTO v_tx_count FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();

  v_system_cash := COALESCE(v_closure.opening_balance, 0) + v_cash_sales - v_cash_payments - v_cash_commissions;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (p_declared_cash + p_declared_vouchers) - v_system_expected_total;

  UPDATE public.cash_closures SET
    status = 'cerrado', closed_at = NOW(),
    declared_cash = p_declared_cash, declared_vouchers = p_declared_vouchers,
    declared_total = p_declared_cash + p_declared_vouchers,
    system_expected_total = v_system_expected_total, difference = v_difference,
    notes = p_notes
  WHERE id = p_closure_id;

  -- Audit log del cierre (mismo de 11.4)
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('declared_cash', p_declared_cash, 'declared_vouchers', p_declared_vouchers,
      'system_expected_total', v_system_expected_total, 'difference', v_difference,
      'opening_balance', COALESCE(v_closure.opening_balance, 0),
      'cash_sales', v_cash_sales, 'transfer_sales', v_transfer_sales, 'zelle_sales', v_zelle_sales,
      'cash_payments', v_cash_payments, 'cash_commissions', v_cash_commissions, 'v2_close', true));

  -- ═══════════════════════════════════════════════════════════════════════
  -- Iteración Fiscal (F-C2): Generar Z Report atómicamente (Aclaración 2)
  -- Estrictamente aditivo — no modifica la lógica anterior.
  -- Si este bloque falla, el error es específico para que el cajero sepa
  -- que el problema es el Z Report, no el cierre en sí.
  -- ═══════════════════════════════════════════════════════════════════════
  BEGIN
    -- Generar número secuencial
    v_z_number := public.next_document_number(v_closure.store_id, 'z_report', v_caller_uid);

    -- Agregar datos fiscales adicionales
    SELECT COALESCE(SUM(tax_amount), 0) INTO v_tax_total
      FROM public.transactions
      WHERE store_id = v_closure.store_id AND status = 'completed'
        AND created_at > v_closure.created_at AND created_at <= NOW();

    SELECT COALESCE(SUM(total_amount), 0) INTO v_devolutions_total
      FROM public.devolutions
      WHERE store_id = v_closure.store_id AND status = 'completed'
        AND created_at > v_closure.created_at AND created_at <= NOW();

    -- INSERT Z Report
    INSERT INTO public.z_reports (
      cash_closure_id, store_id, z_report_number, report_date,
      total_sales, total_cash, total_transfer, total_zelle, total_tax,
      total_devolutions, total_commissions_paid, total_payments_suppliers,
      opening_balance, declared_cash, difference, metadata, generated_by
    ) VALUES (
      p_closure_id, v_closure.store_id, v_z_number, CURRENT_DATE,
      v_cash_sales + v_transfer_sales + v_zelle_sales,
      v_cash_sales, v_transfer_sales, v_zelle_sales, v_tax_total,
      v_devolutions_total, v_cash_commissions, v_cash_payments,
      COALESCE(v_closure.opening_balance, 0), p_declared_cash, v_difference,
      jsonb_build_object('transaction_count', v_tx_count, 'cash_closure_id', p_closure_id),
      v_caller_uid
    )
    RETURNING id INTO v_z_id;

    -- Audit log del Z Report
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('Z_REPORT_GENERATED', 'z_reports', v_z_id, v_closure.store_id, v_caller_uid,
      jsonb_build_object('z_report_number', v_z_number, 'cash_closure_id', p_closure_id,
        'total_sales', v_cash_sales + v_transfer_sales + v_zelle_sales, 'total_tax', v_tax_total));

  EXCEPTION WHEN OTHERS THEN
    -- Aclaración 2: error específico para Z Report
    RAISE EXCEPTION 'ERR_Z_REPORT_GENERATION_FAILED: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', 'success', 'closure_id', p_closure_id,
    'system_expected_total', v_system_expected_total, 'difference', v_difference,
    'z_report_number', v_z_number, 'z_report_id', v_z_id
  );
END;

$$;

COMMENT ON FUNCTION public.close_cash_shift IS
  'Iteracion 11.5 hot-test patch: removed updated_at = NOW() (column does not exist). closed_at = NOW() is already set on the same UPDATE line.';
