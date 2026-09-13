-- DECLARED FINAL STATE (Git) de upsert_usage_aggregate
-- fuente: 20260626000001_usage_tracking.sql stmt#11

CREATE OR REPLACE FUNCTION public.upsert_usage_aggregate(
  p_bucket_start TIMESTAMPTZ,
  p_bucket_end TIMESTAMPTZ,
  p_metric_type TEXT,
  p_service TEXT DEFAULT 'api',
  p_endpoint TEXT DEFAULT NULL,
  p_count INTEGER DEFAULT 1,
  p_sum_value DOUBLE PRECISION DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.usage_aggregates
    (bucket_start, bucket_end, metric_type, service, endpoint, count, sum_value, created_at, updated_at)
  VALUES
    (p_bucket_start, p_bucket_end, p_metric_type, p_service, p_endpoint, p_count, p_sum_value, now(), now())
  ON CONFLICT (bucket_start, metric_type, service, COALESCE(endpoint, ''))
  DO UPDATE SET
    count = usage_aggregates.count + EXCLUDED.count,
    sum_value = usage_aggregates.sum_value + EXCLUDED.sum_value,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
