-- ════════════════════════════════════════════════════════════════════
-- IC: Inteligencia Cambiaria — Tabla de histórico de tasas de cambio
-- ════════════════════════════════════════════════════════════════════
-- Almacena tasas oficiales (BCC) e informales (elToque) diarias.
-- No se sobrescriben registros — trazabilidad histórica completa.

CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fecha del registro (sin hora — una tasa por día por moneda por fuente)
  rate_date DATE NOT NULL,
  -- Hora de captura (para saber cuándo se actualizó ese día)
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Moneda: USD, EUR, MLC
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'MLC')),
  -- Fuente: 'BCC' (oficial Banco Central de Cuba) o 'elToque' (informal)
  source TEXT NOT NULL CHECK (source IN ('BCC', 'elToque')),
  -- Valor de la tasa en CUP
  rate NUMERIC(10,2) NOT NULL CHECK (rate > 0),
  -- Variaciones calculadas (se actualizan via trigger o cron)
  variation_daily NUMERIC(10,2) DEFAULT 0,
  variation_weekly NUMERIC(10,2) DEFAULT 0,
  variation_monthly NUMERIC(10,2) DEFAULT 0,
  variation_yearly NUMERIC(10,2) DEFAULT 0,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: una tasa por día por moneda por fuente
  UNIQUE (rate_date, currency, source)
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_source ON exchange_rates(currency, source);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_source_date ON exchange_rates(source, rate_date DESC);

-- RLS
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
-- Todos los usuarios autenticados pueden leer tasas (son datos públicos)
CREATE POLICY "exchange_rates_read" ON exchange_rates FOR SELECT TO authenticated USING (true);
-- Solo service_role puede insertar (API route captura automática)
CREATE POLICY "exchange_rates_insert" ON exchange_rates FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "exchange_rates_update" ON exchange_rates FOR UPDATE TO service_role USING (true);

-- ════════════════════════════════════════════════════════════════════
-- Función: obtener la última tasa de una moneda/fuente
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_latest_rate(p_currency TEXT, p_source TEXT)
RETURNS TABLE(rate NUMERIC, rate_date DATE, captured_at TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
  SELECT rate, rate_date, captured_at
  FROM exchange_rates
  WHERE currency = p_currency AND source = p_source
  ORDER BY rate_date DESC, captured_at DESC
  LIMIT 1;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Función: obtener histórico de tasas en un rango
-- ════════════════════════════════════════════════════════════════════
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
$$;

-- ════════════════════════════════════════════════════════════════════
-- Función: calcular variación entre dos fechas
-- ════════════════════════════════════════════════════════════════════
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
    sv.rate AS start_rate,
    ev.rate AS end_rate,
    (ev.rate - sv.rate) AS absolute_change,
    CASE WHEN sv.rate > 0 THEN ((ev.rate - sv.rate) / sv.rate * 100) ELSE 0 END AS percent_change,
    CASE WHEN sv.rate > 0 AND ev.rate > 0 AND p_end_date > p_start_date
      THEN (POWER(ev.rate::FLOAT / sv.rate::FLOAT, 1.0 / EXTRACT(EPOCH FROM (p_end_date - p_start_date)) * 86400) - 1) * 100
      ELSE 0 END AS daily_avg_growth,
    CASE WHEN sv.rate > 0 AND ev.rate > 0 AND p_end_date > p_start_date
      THEN (POWER(ev.rate::FLOAT / sv.rate::FLOAT, 30.44 / EXTRACT(EPOCH FROM (p_end_date - p_start_date)) * 86400) - 1) * 100
      ELSE 0 END AS monthly_avg_growth
  FROM start_val sv, end_val ev;
$$;
