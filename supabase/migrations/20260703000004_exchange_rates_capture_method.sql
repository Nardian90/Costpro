-- ════════════════════════════════════════════════════════════════════
-- F-01b: Columna `capture_method` en exchange_rates
-- ════════════════════════════════════════════════════════════════════
-- RED FLAG F-01b: las tasas etiquetadas como source='elToque' se calculaban
-- como `BCC_seg3 × 1.15` (estimación) pero no había forma de distinguir,
-- una vez en BD, cuáles provenían de scraping real de eltoque.com vs.
-- cuáles eran estimación.
--
-- Esta migración añade la columna `capture_method` con dos valores posibles:
--   'estimated' — BCC_seg3 × 1.15 (fallback actual, default)
--   'real'      — scraping real de eltoque.com (cuando esté disponible)
--
-- Reglas:
--   - Solo aplica a filas con source='elToque' (BCC siempre es 'real').
--   - El default es 'estimated' para preservar el comportamiento histórico.
--   - Backfill explícito de filas existentes con source='elToque' a 'estimated'
--     para consistencia (la columna nueva arranca NULL antes del backfill).
--   - Filas source='BCC' se marcan 'real' (son captura directa de la API del BCC).

ALTER TABLE exchange_rates
  ADD COLUMN IF NOT EXISTS capture_method TEXT;

-- Backfill de filas existentes:
--   - BCC → 'real' (la API del BCC es pública y se captura directamente)
--   - elToque → 'estimated' (todas las filas históricas son BCC×1.15)
UPDATE exchange_rates
  SET capture_method = CASE
    WHEN source = 'BCC' THEN 'real'
    WHEN source = 'elToque' THEN 'estimated'
    ELSE 'estimated'
  END
  WHERE capture_method IS NULL;

-- Default para futuros INSERTs que no especifiquen capture_method
ALTER TABLE exchange_rates
  ALTER COLUMN capture_method SET DEFAULT 'estimated';

-- CHECK constraint: solo valores válidos
ALTER TABLE exchange_rates
  ADD CONSTRAINT exchange_rates_capture_method_check
  CHECK (capture_method IN ('real', 'estimated'));

-- Índice para filtrar por método de captura (útil para reportes de monitoreo:
-- "cuántas capturas fueron reales vs estimadas en los últimos N días")
CREATE INDEX IF NOT EXISTS idx_exchange_rates_capture_method
  ON exchange_rates(capture_method);

-- Índice compuesto para queries de auditoría: "dame todas las tasas elToque
-- estimadas en los últimos 30 días"
CREATE INDEX IF NOT EXISTS idx_exchange_rates_source_method_date
  ON exchange_rates(source, capture_method, rate_date DESC);

COMMENT ON COLUMN exchange_rates.capture_method IS
  'Método de captura: ''real'' (scraping eltoque.com o API directa BCC) o ''estimated'' (BCC seg3 × 1.15). Solo aplica a source=''elToque''; las filas source=''BCC'' siempre son ''real''.';
