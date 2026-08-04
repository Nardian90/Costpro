-- ============================================================================
-- Migration: 20260805000006_v2_14_6_is_global_admin_doc.sql
-- Iteración 12 — Fix Q1 (is_global_admin alias documentation)
-- ============================================================================
-- Q1 decidido: is_global_admin() se mantiene como alias de is_admin().
-- No se reescriben las ~20 migrations que la usan. Solo se documenta la
-- deuda técnica via COMMENT.
--
-- UP: COMMENT ON FUNCTION
-- DOWN: Restaurar COMMENT anterior
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.is_global_admin() IS
  'Iteración 12 (Q1): Compatibility alias for is_admin(). Identical implementation.
   Future cleanup: consolidate all callers to is_admin() and drop this function.
   See docs/iteration-12-decisions.md for the migration debt log.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- COMMENT ON FUNCTION public.is_global_admin() IS
--   'Verifica si el usuario actual es admin global.';
-- ============================================================================
