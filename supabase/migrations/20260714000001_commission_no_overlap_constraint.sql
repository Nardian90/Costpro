-- ============================================================================
-- Fix C4 — Exclusion constraint para prevenir periodos solapados
-- Creado: 2026-07-14
--
-- El índice UNIQUE actual solo bloquea periodos idénticos.
-- Este constraint usa daterange + GiST para bloquear cualquier solapamiento real.
--
-- Verificación previa: 0 solapamientos encontrados (2026-07-14).
-- ============================================================================

-- 1. Instalar extensión necesaria para combinar = y &&
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Crear el exclusion constraint
ALTER TABLE public.commission_payments
  ADD CONSTRAINT no_overlapping_periods
  EXCLUDE USING gist (
    worker_id WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  )
  WHERE (status != 'cancelled');

-- 3. Comment
COMMENT ON CONSTRAINT no_overlapping_periods ON public.commission_payments IS
  'Previene que un trabajador tenga dos pagos de comisión con periodos solapados (excluyendo cancelados). Usa daterange con GiST para detectar cualquier solapamiento, no solo periodos idénticos.';
