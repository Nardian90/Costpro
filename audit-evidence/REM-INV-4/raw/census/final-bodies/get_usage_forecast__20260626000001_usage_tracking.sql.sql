-- DECLARED FINAL STATE (Git) de get_usage_forecast
-- fuente: 20260626000001_usage_tracking.sql stmt#13

CREATE OR REPLACE FUNCTION public.get_usage_forecast()
 RETURNS TABLE (
  o_metric_type TEXT,
  o_service TEXT,
  o_today_usage DOUBLE PRECISION,
  o_avg_daily_7d DOUBLE PRECISION,
  o_month_so_far DOUBLE PRECISION,
  o_projected_monthly DOUBLE PRECISION,
  o_monthly_limit DOUBLE PRECISION,
  o_projected_pct DOUBLE PRECISION,
  o_unit TEXT,
  o_threshold_warning INTEGER,
  o_threshold_risk INTEGER,
  o_threshold_critical INTEGER
 ) AS $$
#variable_conflict use_column
DECLARE
  v_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_day_of_month INTEGER := EXTRACT(DAY FROM now());
  v_days_in_month INTEGER := EXTRACT(DAY FROM (date_trunc('month', now()) + INTERVAL '1 month - 1 day'));
  v_days_remaining INTEGER;
BEGIN
  v_days_remaining := v_days_in_month - v_day_of_month;

  RETURN QUERY
  SELECT
    t.metric_type,
    t.service,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(today.sum_value, 0)::DOUBLE PRECISION
      ELSE COALESCE(today.sum_count, 0)::DOUBLE PRECISION
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(last7.avg_daily_value, 0)::DOUBLE PRECISION
      ELSE COALESCE(last7.avg_daily_count, 0)::DOUBLE PRECISION
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(month_so_far.sum_value, 0)::DOUBLE PRECISION
      ELSE COALESCE(month_so_far.sum_count, 0)::DOUBLE PRECISION
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN
        (COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining)::DOUBLE PRECISION
      ELSE
        (COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining)::DOUBLE PRECISION
    END,
    t.monthly_limit,
    CASE
      WHEN t.monthly_limit > 0 THEN
        CASE
          WHEN t.unit IN ('bytes', 'ms') THEN
            ROUND(((COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining) / t.monthly_limit * 100)::numeric, 2)
          ELSE
            ROUND(((COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining) / t.monthly_limit * 100)::numeric, 2)
        END
      ELSE 0
    END::DOUBLE PRECISION,
    t.unit,
    t.warning_pct,
    t.risk_pct,
    t.critical_pct
  FROM public.usage_thresholds t
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION AS sum_count,
      SUM(sum_value)::DOUBLE PRECISION AS sum_value
    FROM public.usage_aggregates
    WHERE bucket_start >= date_trunc('day', now())
    GROUP BY metric_type
  ) today ON today.metric_type = t.metric_type
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION / 7.0 AS avg_daily_count,
      SUM(sum_value)::DOUBLE PRECISION / 7.0 AS avg_daily_value
    FROM public.usage_aggregates
    WHERE bucket_start >= now() - INTERVAL '7 days'
    GROUP BY metric_type
  ) last7 ON last7.metric_type = t.metric_type
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION AS sum_count,
      SUM(sum_value)::DOUBLE PRECISION AS sum_value
    FROM public.usage_aggregates
    WHERE bucket_start >= v_month_start
    GROUP BY metric_type
  ) month_so_far ON month_so_far.metric_type = t.metric_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
