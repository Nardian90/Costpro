-- DECLARED FINAL STATE (Git) de get_latest_rate
-- fuente: 20260624000001_inteligencia_cambiaria.sql stmt#8

CREATE OR REPLACE FUNCTION get_latest_rate(p_currency TEXT, p_source TEXT)
RETURNS TABLE(rate NUMERIC, rate_date DATE, captured_at TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
  SELECT rate, rate_date, captured_at
  FROM exchange_rates
  WHERE currency = p_currency AND source = p_source
  ORDER BY rate_date DESC, captured_at DESC
  LIMIT 1;
$$
