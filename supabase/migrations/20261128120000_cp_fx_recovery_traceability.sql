-- ══════════════════════════════════════════════════════════════════
-- CP-FX-PREMIUM-DASHBOARD-AND-HISTORICAL-DATA-RECOVERY-001 (2026-11-28)
-- Trazabilidad de la recuperación histórica de la serie informal USD
-- ══════════════════════════════════════════════════════════════════
-- Contexto (auditoría CP-FX-001 sobre exchange_rates):
--   - Serie informal unificada USD: 201/339 días con dato (59.3%).
--   - Zona muerta 2026-07-29 → 2026-10-24 (88 días): solucionescuba.com
--     caído y Diviza aún no capturaba.
--   - ~50 días sueltos en la era elToque (2025-12-25 → 2026-07-28).
-- Recuperación (misión FASE 3/4):
--   - Fuente recuperada: Cuba Clara «Dólar en la calle» (cubaclara.org),
--     CC BY 4.0, mediana propia diaria (compra/venta/medio) — cubre
--     2026-10-06 → 2026-11-23 (19 días de la zona muerta).
--   - Días irrecuperables: interpolación lineal identificada (estimada).
--
-- CAMBIOS (idempotentes, reversibles, sin tocar rutas vivas):
--   1. CHECK exchange_rates_source_check ampliado a
--      ('BCC','elToque','Diviza','Cuba Clara') — mismo patrón idempotente
--      de la migración 20261027000000_inteligencia_diviza_source.sql.
--      'Cuba Clara' es fuente RECUPERADA (archivo histórico verificable):
--      jamás participa en la vigencia (la app la excluye de informal_latest,
--      carry-forward y respuestas por defecto vía src/lib/exchange-sources.ts).
--   2. Columnas de trazabilidad (FASE 4.5 de la misión) — todas NULLABLE,
--      sin NOT NULL: cero impacto en captura cron, refresh, manual y bulk
--      upload existentes. Solo las filas de recuperación/importación las
--      rellenan.
--   3. Índice parcial de trazabilidad para auditoría de lotes de importación.
--
-- DATOS: esta migración NO inserta, actualiza ni re-atribuye filas. Las
-- observaciones originales (BCC/elToque/Diviza capture_method='real')
-- permanecen intactas — la escritura de recuperación la realiza el canal
-- gobernado scripts/fx-apply-recovery.mjs (respaldo + dry-run + apply +
-- verificación), NUNCA esta migración.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) CHECK de fuente: ampliar a ('BCC','elToque','Diviza','Cuba Clara') ──
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'exchange_rates_source_check'
      AND t.relname = 'exchange_rates'
      AND n.nspname = 'public'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%Cuba Clara%'
  ) THEN
    ALTER TABLE public.exchange_rates DROP CONSTRAINT exchange_rates_source_check;
    ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_source_check
      CHECK (source IN ('BCC', 'elToque', 'Diviza', 'Cuba Clara'));
  END IF;
END
$do$;

COMMENT ON CONSTRAINT exchange_rates_source_check ON public.exchange_rates IS
  'Fuente de la tasa: BCC (oficial por segmento), elToque (serie informal histórica 2025-12→2026-07), Diviza (informal vigente desde 2026-10-26, cubadivisas.com), Cuba Clara (fuente recuperada CP-FX-001, cubaclara.org, CC BY 4.0 — solo histórico, jamás vigente). Procedencia verdadera e inmutable por fila.';

-- ── 2) Columnas de trazabilidad (todas opcionales) ─────────────────
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS rate_source_url TEXT;
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS reconstruction_method TEXT;
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS confidence_level TEXT;
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
ALTER TABLE public.exchange_rates
  ADD COLUMN IF NOT EXISTS import_batch TEXT;

-- CHECK de nivel de confianza (solo vincula cuando la columna trae valor)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exchange_rates_confidence_check'
      AND conrelid = 'public.exchange_rates'::regclass
  ) THEN
    ALTER TABLE public.exchange_rates
      ADD CONSTRAINT exchange_rates_confidence_check
      CHECK (confidence_level IS NULL OR confidence_level IN ('alta', 'media', 'baja'));
  END IF;
END
$do$;

COMMENT ON COLUMN public.exchange_rates.rate_source_url IS
  'URL de referencia de la fuente (trazabilidad CP-FX-001). Ej.: https://cubaclara.org/datos/dolar-cuba-clara.csv';
COMMENT ON COLUMN public.exchange_rates.reconstruction_method IS
  'Método de reconstrucción para filas estimadas (ej.: interpolacion_lineal con anclas). NULL en observaciones reales.';
COMMENT ON COLUMN public.exchange_rates.confidence_level IS
  'Nivel de confianza de una estimación: alta (hueco ≤ 4 días), media (≤ 10), baja (> 10). NULL en reales.';
COMMENT ON COLUMN public.exchange_rates.notes IS
  'Observaciones de trazabilidad: citación de la fuente, anclas de interpolación, metodología declarada.';
COMMENT ON COLUMN public.exchange_rates.imported_at IS
  'Momento de importación/recuperación (distinto de captured_at, que conserva la marca original cuando existe).';
COMMENT ON COLUMN public.exchange_rates.import_batch IS
  'Identificador del lote de importación (ej.: CP-FX-001-20261128). Permite reversiones quirúrgicas por lote.';

-- ── 3) Índice de auditoría por lote (parcial: solo filas importadas) ──
CREATE INDEX IF NOT EXISTS idx_exchange_rates_import_batch
  ON public.exchange_rates(import_batch)
  WHERE import_batch IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK (reversible — ejecutar SOLO bajo decisión explícita del
-- propietario; requiere antes borrar/retirar las filas importadas):
--
-- DROP INDEX IF EXISTS public.idx_exchange_rates_import_batch;
-- ALTER TABLE public.exchange_rates
--   DROP CONSTRAINT IF EXISTS exchange_rates_confidence_check;
-- ALTER TABLE public.exchange_rates
--   DROP COLUMN IF EXISTS rate_source_url,
--   DROP COLUMN IF EXISTS reconstruction_method,
--   DROP COLUMN IF EXISTS confidence_level,
--   DROP COLUMN IF EXISTS notes,
--   DROP COLUMN IF EXISTS imported_at,
--   DROP COLUMN IF EXISTS import_batch;
-- ALTER TABLE public.exchange_rates DROP CONSTRAINT exchange_rates_source_check;
-- ALTER TABLE public.exchange_rates ADD CONSTRAINT exchange_rates_source_check
--   CHECK (source IN ('BCC', 'elToque', 'Diviza'));
-- ══════════════════════════════════════════════════════════════════
