-- ============================================================================
-- Migration: 20260810000002_v2_19_2_z_reports.sql
-- Iteración Fiscal — Fix F-C2 (Z Report persistido e inmutable)
-- ============================================================================
-- Tabla z_reports + trigger inmutabilidad + extensión de close_cash_shift.
-- Aclaración 2: extensión estrictamente aditiva al final del body.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Tabla z_reports
CREATE TABLE IF NOT EXISTS public.z_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_closure_id uuid NOT NULL REFERENCES public.cash_closures(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  z_report_number text NOT NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  total_sales numeric NOT NULL DEFAULT 0,
  total_cash numeric NOT NULL DEFAULT 0,
  total_transfer numeric NOT NULL DEFAULT 0,
  total_zelle numeric NOT NULL DEFAULT 0,
  total_tax numeric NOT NULL DEFAULT 0,
  total_devolutions numeric NOT NULL DEFAULT 0,
  total_commissions_paid numeric NOT NULL DEFAULT 0,
  total_payments_suppliers numeric NOT NULL DEFAULT 0,
  opening_balance numeric NOT NULL DEFAULT 0,
  declared_cash numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS z_reports_z_report_number_idx ON public.z_reports (z_report_number);
CREATE INDEX IF NOT EXISTS z_reports_store_date_idx ON public.z_reports (store_id, report_date DESC);
CREATE INDEX IF NOT EXISTS z_reports_cash_closure_idx ON public.z_reports (cash_closure_id);

ALTER TABLE public.z_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "z_reports_select_own" ON public.z_reports;
CREATE POLICY "z_reports_select_own" ON public.z_reports
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_store_role(store_id, ARRAY['admin', 'manager', 'encargado']));
-- No INSERT/UPDATE/DELETE policies — solo via RPC SECURITY DEFINER

-- 2. Trigger inmutabilidad
CREATE OR REPLACE FUNCTION public.prevent_z_report_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ERR_Z_REPORT_LOCKED: Z Reports are immutable and cannot be modified.';
END;
$function$;

DROP TRIGGER IF EXISTS prevent_z_report_edit ON public.z_reports;
CREATE TRIGGER prevent_z_report_edit
  BEFORE UPDATE OR DELETE ON public.z_reports
  FOR EACH ROW EXECUTE FUNCTION public.prevent_z_report_edit();

-- 3. Extensión de close_cash_shift (Aclaración 2: aditivo al final del body)
-- Reescribimos la función completa con el bloque Z Report añadido al final
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
    notes = p_notes, updated_at = NOW()
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
$function$;

REVOKE EXECUTE ON FUNCTION public.close_cash_shift FROM anon;
GRANT EXECUTE ON FUNCTION public.close_cash_shift TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift TO service_role;

COMMENT ON FUNCTION public.close_cash_shift IS
  'Iteración 11.4 + Fiscal: Closes cash shift with server-side recalculation, atomic audit, AND Z Report generation (F-C2).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.close_cash_shift;
-- -- Restaurar versión de 11.4 sin Z Report (pegar body de 20260809000002)
-- DROP TRIGGER IF EXISTS prevent_z_report_edit ON public.z_reports;
-- DROP FUNCTION IF EXISTS public.prevent_z_report_edit();
-- DROP TABLE IF EXISTS public.z_reports CASCADE;
-- ============================================================================
