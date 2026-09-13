-- DECLARED FINAL STATE (Git) de get_usage_summary
-- fuente: 20260626000001_usage_tracking.sql stmt#12

CREATE OR REPLACE FUNCTION public.get_usage_summary(
  p_hours INTEGER DEFAULT 24
) RETURNS TABLE (
  metric_type TEXT,
  service TEXT,
  total_count BIGINT,
  total_sum DOUBLE PRECISION,
  bucket_count BIGINT,
  first_bucket TIMESTAMPTZ,
  last_bucket TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ua.metric_type,
    ua.service,
    SUM(ua.count)::BIGINT AS total_count,
    SUM(ua.sum_value) AS total_sum,
    COUNT(*)::BIGINT AS bucket_count,
    MIN(ua.bucket_start) AS first_bucket,
    MAX(ua.bucket_start) AS last_bucket
  FROM public.usage_aggregates ua
  WHERE ua.bucket_start >= now() - (p_hours || ' hours')::INTERVAL
  GROUP BY ua.metric_type, ua.service
  ORDER BY ua.metric_type, ua.service;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
