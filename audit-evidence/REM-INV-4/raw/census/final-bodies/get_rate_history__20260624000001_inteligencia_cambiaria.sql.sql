-- DECLARED FINAL STATE (Git) de get_rate_history
-- fuente: 20260624000001_inteligencia_cambiaria.sql stmt#9

CREATE OR REPLACE FUNCTION get_rate_history(
  p_currency TEXT,
  p_source TEXT,
  p_days INT DEFAULT 30
)
RETURNS TABLE(rate_date DATE, rate NUMERIC, variation_daily NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT rate_date, rate, variation_daily
  FROM exchange_rates
  WHERE currency = p_currency AND source = p_source
    AND rate_date >= CURRENT_DATE - p_days
  ORDER BY rate_date ASC;
$$
