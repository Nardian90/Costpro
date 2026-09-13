-- DECLARED FINAL STATE (Git) de prevent_z_report_edit
-- fuente: 20260810000002_v2_19_2_z_reports.sql stmt#7

CREATE OR REPLACE FUNCTION public.prevent_z_report_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ERR_Z_REPORT_LOCKED: Z Reports are immutable and cannot be modified.';
END;
$function$
