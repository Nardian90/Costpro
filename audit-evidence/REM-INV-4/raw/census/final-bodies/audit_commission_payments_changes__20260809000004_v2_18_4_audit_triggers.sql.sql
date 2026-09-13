-- DECLARED FINAL STATE (Git) de audit_commission_payments_changes
-- fuente: 20260809000004_v2_18_4_audit_triggers.sql stmt#3

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
$function$
