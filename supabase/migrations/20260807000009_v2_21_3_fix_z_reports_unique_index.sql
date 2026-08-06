-- ============================================================================
-- Migration: 20260807000009_v2_21_3_fix_z_reports_unique_index.sql
-- Iteración RLS Hot Test — Fix Bug 2: Z report duplicate key
-- ============================================================================
-- BUG: z_reports tenía un unique index global en z_report_number. Pero
-- z_report_number se genera por store (ZR-000001-2026 para cada store).
-- Cuando dos stores generaban su primer Z report del año, colisionaban.
--
-- FIX: Cambiar el unique index de (z_report_number) a (store_id, z_report_number)
-- para que cada store tenga su propia secuencia.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.z_reports_z_report_number_idx;
CREATE UNIQUE INDEX IF NOT EXISTS z_reports_store_z_report_number_idx
  ON public.z_reports (store_id, z_report_number);

COMMENT ON INDEX public.z_reports_store_z_report_number_idx IS
  'Iteración RLS (v2.21.3): Unique index per-store para z_report_number. Antes era global, causaba duplicate key cuando múltiples stores generaban Z reports.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.z_reports_store_z_report_number_idx;
-- CREATE UNIQUE INDEX IF NOT EXISTS z_reports_z_report_number_idx
--   ON public.z_reports (z_report_number);
-- ============================================================================
