-- DECLARED FINAL STATE (Git) de audit_payment_transactions_changes
-- fuente: 20260817000004_fix_audit_payment_created_by.sql stmt#0

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
$function$
