-- DECLARED FINAL STATE (Git) de prevent_fiscal_closing_edit
-- fuente: 20260911000000_rem_sec1_security_boundaries.sql stmt#0

CREATE OR REPLACE FUNCTION public.prevent_fiscal_closing_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'locked' AND COALESCE(current_setting('app.bypass_fiscal_lock', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'ERR_FISCAL_CLOSING_LOCKED: Cannot modify locked fiscal closing.';
  END IF;
  RETURN NEW;
END;
$function$
