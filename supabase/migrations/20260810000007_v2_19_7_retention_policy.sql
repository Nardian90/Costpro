-- ============================================================================
-- Migration: 20260810000007_v2_19_7_retention_policy.sql
-- Iteración Fiscal — Política de retención fiscal (solo documentación)
-- ============================================================================
-- No crea tablas ni jobs. Solo documenta la política de retención.
-- ============================================================================

COMMENT ON TABLE public.transactions IS
  'Retention policy: 7 years from creation date (fiscal requirement).';
COMMENT ON TABLE public.devolutions IS
  'Retention policy: 7 years from creation date (fiscal requirement).';
COMMENT ON TABLE public.cash_closures IS
  'Retention policy: 7 years from closing date (fiscal requirement).';
COMMENT ON TABLE public.z_reports IS
  'Retention policy: 10 years from generation date (fiscal requirement — Z Reports are permanent fiscal records).';
COMMENT ON TABLE public.fiscal_closings IS
  'Retention policy: 10 years from closing date (fiscal requirement — permanent fiscal records).';
