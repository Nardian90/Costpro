-- DECLARED FINAL STATE (Git) de prevent_cash_closure_edit
-- fuente: 20260911000000_rem_sec1_security_boundaries.sql stmt#1

CREATE OR REPLACE FUNCTION public.prevent_cash_closure_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'cerrado' AND COALESCE(current_setting('app.bypass_closure_lock', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'ERR_CASH_CLOSURE_LOCKED: Cannot modify closed cash closure. Use reopen_cash_shift RPC.';
  END IF;
  RETURN NEW;
END;
$function$
