-- DECLARED FINAL STATE (Git) de purge_expired_fc_pdf_cache
-- fuente: 20260615000004_create_fc_automation_support_tables.sql stmt#40

CREATE OR REPLACE FUNCTION public.purge_expired_fc_pdf_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM fc_pdf_cache WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$
