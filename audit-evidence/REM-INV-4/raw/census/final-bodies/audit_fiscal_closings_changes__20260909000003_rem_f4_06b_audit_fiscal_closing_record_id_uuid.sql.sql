-- DECLARED FINAL STATE (Git) de audit_fiscal_closings_changes
-- fuente: 20260909000003_rem_f4_06b_audit_fiscal_closing_record_id_uuid.sql stmt#1

CREATE OR REPLACE FUNCTION public.audit_fiscal_closings_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.store_id ELSE NEW.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'year', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_year ELSE NULL END,
      'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_month ELSE NULL END,
      'status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
    ));

  RETURN NEW;
END;
$function$
