-- ============================================================================
-- Migration: 20260811000001_v2_20_1_audit_logs_trace_id.sql
-- Iteración 11.5 — Fix H-15 (trace_id en audit_logs)
-- ============================================================================
-- Añade columna trace_id a audit_logs para correlación forense.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS trace_id text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_trace_id
  ON public.audit_logs (trace_id) WHERE trace_id IS NOT NULL;

COMMENT ON COLUMN public.audit_logs.trace_id IS
  'Iteración 11.5 (H-15): OpenTelemetry trace_id for distributed tracing correlation. Nullable — old rows have NULL.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_audit_logs_trace_id;
-- ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS trace_id;
-- ============================================================================
