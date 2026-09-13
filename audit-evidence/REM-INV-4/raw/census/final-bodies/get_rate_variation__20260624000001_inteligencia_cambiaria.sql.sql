-- DECLARED FINAL STATE (Git) de get_rate_variation
-- fuente: 20260624000001_inteligencia_cambiaria.sql stmt#10

CREATE OR REPLACE FUNCTION get_rate_variation(
  p_currency TEXT,
  p_source TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  start_rate NUMERIC,
  end_rate NUMERIC,
  absolute_change NUMERIC,
  percent_change NUMERIC,
  daily_avg_growth NUMERIC,
  monthly_avg_growth NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH start_val AS (
    SELECT rate FROM exchange_rates
    WHERE currency = p_currency AND source = p_source AND rate_date <= p_start_date
    ORDER BY rate_date DESC LIMIT 1
  ),
  end_val AS (
    SELECT rate FROM exchange_rates
    WHERE currency = p_currency AND source = p_source AND rate_date <= p_end_date
    ORDER BY rate_date DESC LIMIT 1
  )
  SELECT
    COALESCE(sv.rate, 0) AS start_rate,
    COALESCE(ev.rate, 0) AS end_rate,
    (COALESCE(ev.rate, 0) - COALESCE(sv.rate, 0)) AS absolute_change,
    CASE WHEN sv.rate IS NOT NULL AND sv.rate > 0 THEN ((ev.rate - sv.rate) / sv.rate * 100) ELSE 0 END AS percent_change,
    CASE WHEN sv.rate IS NOT NULL AND sv.rate > 0 AND ev.rate IS NOT NULL AND ev.rate > 0 AND p_end_date > p_start_date
      THEN (POWER(ev.rate::FLOAT / sv.rate::FLOAT, 1.0 / EXTRACT(EPOCH FROM (p_end_date - p_start_date)) * 86400) - 1) * 100
      ELSE 0 END AS daily_avg_growth,
    CASE WHEN sv.rate IS NOT NULL AND sv.rate > 0 AND ev.rate IS NOT NULL AND ev.rate > 0 AND p_end_date > p_start_date
      THEN (POWER(ev.rate::FLOAT / sv.rate::FLOAT, 30.44 / EXTRACT(EPOCH FROM (p_end_date - p_start_date)) * 86400) - 1) * 100
      ELSE 0 END AS monthly_avg_growth
  FROM start_val sv, end_val ev;
$$
