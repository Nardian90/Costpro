-- ============================================================================
-- FIX: audit_payment_transactions_changes — NEW.created_by → NEW.paid_by + record_id cast
-- ============================================================================
-- BUG 1: Trigger references NEW.created_by, but payment_transactions has 'paid_by'.
-- BUG 2: NEW.id::text passed to audit_logs.record_id (uuid) causes type mismatch.
--
-- FIX: Use NEW.paid_by (not created_by) and pass NEW.id directly (not ::text).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_payment_transactions_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'SUPPLIER_PAYMENT_REGISTERED' ELSE 'PAYMENT_TRANSACTION_UPDATED' END,
    'payment_transactions',
    NEW.id,
    NEW.store_id,
    NEW.paid_by,
    jsonb_build_object(
      'tg_op', TG_OP,
      'ref_type', NEW.ref_type,
      'ref_id', NEW.ref_id,
      'amount', NEW.amount,
      'amount_cup', NEW.amount_cup,
      'payment_method', NEW.payment_method,
      'currency', NEW.currency
    )
  );
  RETURN NEW;
END;
$function$;
