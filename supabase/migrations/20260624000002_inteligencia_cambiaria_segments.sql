-- ════════════════════════════════════════════════════════════════════
-- IC-AUDIT: Tabla exchange_rates con soporte para 3 segmentos del BCC
-- ════════════════════════════════════════════════════════════════════
-- BCC tiene 3 segmentos:
--   tasaOficial (Segmento 1) — empresas estatales (~24 CUP)
--   tasaPublica  (Segmento 2) — CADECA (~120 CUP)
--   tasaEspecial (Segmento 3) — MIPYMES y personas naturales (DEFAULT, ~574 CUP)
--
-- elToque tiene un solo valor (informal).

ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_rate_date_currency_source_key;
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS exchange_rates_rate_date_currency_source_seg_key;

ALTER TABLE exchange_rates ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT '3';
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_segment_check
  CHECK (segment IN ('1', '2', '3'));

-- Constraint único actualizado: fecha + moneda + fuente + segmento
ALTER TABLE exchange_rates ADD CONSTRAINT exchange_rates_rate_date_currency_source_seg_key
  UNIQUE (rate_date, currency, source, segment);

-- Índice para filtrar por segmento
CREATE INDEX IF NOT EXISTS idx_exchange_rates_segment ON exchange_rates(segment);
