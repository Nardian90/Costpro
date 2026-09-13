-- DECLARED FINAL STATE (Git) de audit_cash_closures_changes
-- fuente: 20260809000004_v2_18_4_audit_triggers.sql stmt#0

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
$function$
