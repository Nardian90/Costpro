-- DECLARED FINAL STATE (Git) de set_audit_log_trace_id
-- fuente: 20260811000002_v2_20_2_rpc_trace_id.sql stmt#0

CREATE OR REPLACE FUNCTION public.set_audit_log_trace_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_trace_id text;
BEGIN
  v_trace_id := current_setting('app.trace_id', true);
  IF v_trace_id IS NOT NULL AND v_trace_id <> '' THEN
    NEW.trace_id := v_trace_id;
  END IF;
  RETURN NEW;
END;
$function$
