-- ============================================================================
-- Migration: 20260805000005_v2_14_5_user_audit_log_enhancements.sql
-- Iteración 12 — Mejoras a user_audit_log
-- ============================================================================
-- 1. CHECK constraint: performed_by puede ser NULL solo si action empieza con 'SYSTEM_'
--    (acciones del sistema como detect_orphan_users)
-- 2. INDEX en (target_user_id, created_at DESC) para queries de historial
--
-- UP: ADD CHECK + ADD INDEX
-- DOWN: DROP CHECK + DROP INDEX
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. CHECK constraint
DO $$ BEGIN
  ALTER TABLE public.user_audit_log
    ADD CONSTRAINT user_audit_log_performed_by_check
    CHECK (performed_by IS NOT NULL OR action LIKE 'SYSTEM_%');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Index para historial por usuario
CREATE INDEX IF NOT EXISTS idx_user_audit_log_target_created
  ON public.user_audit_log (target_user_id, created_at DESC);

COMMENT ON CONSTRAINT user_audit_log_performed_by_check ON public.user_audit_log IS
  'Iteración 12: performed_by nullable only for SYSTEM_ actions (e.g. detect_orphan_users).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.user_audit_log DROP CONSTRAINT IF EXISTS user_audit_log_performed_by_check;
-- DROP INDEX IF EXISTS public.idx_user_audit_log_target_created;
-- ============================================================================
