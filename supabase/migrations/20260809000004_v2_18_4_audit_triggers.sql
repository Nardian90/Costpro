-- ============================================================================
-- Migration: 20260809000004_v2_18_4_audit_triggers.sql
-- Iteración 11.4 — Fix H-5 (audit gaps)
-- ============================================================================
-- Triggers de audit en:
--   cash_closures (INSERT/UPDATE/DELETE)
--   commission_payments (INSERT/UPDATE/DELETE)
--   fiscal_closings (INSERT/UPDATE)
-- Audit en register_supplier_payment RPC (añadir INSERT INTO audit_logs en body)
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Trigger audit cash_closures
CREATE OR REPLACE FUNCTION public.audit_cash_closures_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_action text;
  v_record_id text;
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'CASH_CLOSURE_CREATED';
    v_record_id := NEW.id::text;
    v_store_id := NEW.store_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'CASH_CLOSURE_UPDATED';
    v_record_id := NEW.id::text;
    v_store_id := NEW.store_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'CASH_CLOSURE_DELETED';
    v_record_id := OLD.id::text;
    v_store_id := OLD.store_id;
  END IF;

  -- No duplicar audit si ya viene de close_cash_shift o reopen_cash_shift
  -- (esos RPCs ya escriben su propio audit log atómico)
  IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'cerrado' AND OLD.status = 'pendiente' THEN
    -- close_cash_shift ya escribió el audit — skip
    RETURN NEW;
  END IF;
  IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'pendiente' AND OLD.status = 'cerrado' THEN
    -- reopen_cash_shift ya escribió el audit — skip
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'cash_closures', v_record_id, v_store_id, v_user_id,
    jsonb_build_object(
      'tg_op', TG_OP,
      'old_status', CASE WHEN TG_OP != 'INSERT' THEN OLD.status ELSE NULL END,
      'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
    ));

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_cash_closures ON public.cash_closures;
CREATE TRIGGER trg_audit_cash_closures
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_closures
  FOR EACH ROW EXECUTE FUNCTION public.audit_cash_closures_changes();

-- 2. Trigger audit commission_payments
CREATE OR REPLACE FUNCTION public.audit_commission_payments_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'COMMISSION_PAYMENT_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip si el cambio viene del trigger de flag (ya tiene su propio audit)
    IF NEW.status = 'flagged_for_review' AND OLD.status IN ('approved', 'paid') THEN
      RETURN NEW;
    END IF;
    v_action := 'COMMISSION_PAYMENT_UPDATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'COMMISSION_PAYMENT_DELETED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'commission_payments',
    CASE WHEN TG_OP != 'DELETE' THEN NEW.id::text ELSE OLD.id::text END,
    CASE WHEN TG_OP != 'DELETE' THEN NEW.store_id ELSE OLD.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'worker_id', CASE WHEN TG_OP != 'DELETE' THEN NEW.worker_id ELSE OLD.worker_id END,
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END,
      'amount', CASE WHEN TG_OP != 'DELETE' THEN NEW.final_amount ELSE OLD.final_amount END
    ));

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_commission_payments ON public.commission_payments;
CREATE TRIGGER trg_audit_commission_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_commission_payments_changes();

-- 3. Trigger audit fiscal_closings
CREATE OR REPLACE FUNCTION public.audit_fiscal_closings_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'FISCAL_CLOSING_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'FISCAL_CLOSING_UPDATED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'fiscal_closings',
    CASE WHEN TG_OP = 'INSERT' THEN NEW.id::text ELSE NEW.id::text END,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.store_id ELSE NEW.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'year', CASE WHEN TG_OP != 'DELETE' THEN NEW.year ELSE NULL END,
      'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.month ELSE NULL END,
      'status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
    ));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_fiscal_closings ON public.fiscal_closings;
CREATE TRIGGER trg_audit_fiscal_closings
  AFTER INSERT OR UPDATE ON public.fiscal_closings
  FOR EACH ROW EXECUTE FUNCTION public.audit_fiscal_closings_changes();

-- 4. Trigger audit payment_transactions (reemplaza modificación directa de register_supplier_payment)
CREATE OR REPLACE FUNCTION public.audit_payment_transactions_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    CASE WHEN TG_OP = '''INSERT''' THEN '''SUPPLIER_PAYMENT_REGISTERED''' ELSE '''PAYMENT_TRANSACTION_UPDATED''' END,
    '''payment_transactions''',
    NEW.id::text,
    NEW.store_id,
    NEW.created_by,
    jsonb_build_object(
      '''tg_op''', TG_OP,
      '''ref_type''', NEW.ref_type,
      '''ref_id''', NEW.ref_id,
      '''amount''', NEW.amount,
      '''amount_cup''', NEW.amount_cup,
      '''payment_method''', NEW.payment_method,
      '''currency''', NEW.currency
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_payment_transactions ON public.payment_transactions;
CREATE TRIGGER trg_audit_payment_transactions
  AFTER INSERT OR UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_transactions_changes();

COMMENT ON FUNCTION public.audit_payment_transactions_changes() IS '''Iteración 11.4 (H-5): Audit trigger for payment_transactions. Replaces direct audit in register_supplier_payment body.''';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_audit_cash_closures ON public.cash_closures;
-- DROP FUNCTION IF EXISTS public.audit_cash_closures_changes();
-- DROP TRIGGER IF EXISTS trg_audit_commission_payments ON public.commission_payments;
-- DROP FUNCTION IF EXISTS public.audit_commission_payments_changes();
-- DROP TRIGGER IF EXISTS trg_audit_fiscal_closings ON public.fiscal_closings;
-- DROP FUNCTION IF EXISTS public.audit_fiscal_closings_changes();
-- -- register_supplier_payment: restaurar versión anterior sin audit_logs
-- ============================================================================
