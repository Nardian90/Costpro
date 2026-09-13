-- DECLARED FINAL STATE (Git) de cleanup_old_aggregates
-- fuente: 20260626000001_usage_tracking.sql stmt#14

CREATE OR REPLACE FUNCTION public.cleanup_old_aggregates(
  p_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.usage_aggregates WHERE bucket_start < now() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
