-- ============================================================================
-- Migration: 20260805000003_v2_14_3_orphaned_users_log.sql
-- Iteración 12 — Fix Q4 (reconciliación auth.users ↔ profiles)
-- ============================================================================
-- Tabla para registrar huérfanos (auth.users sin profile) detectados por
-- detect_orphan_users() RPC. Permite trazabilidad de la reconciliación.
--
-- UP: CREATE TABLE + RLS + indexes
-- DOWN: DROP TABLE
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orphaned_users_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,  -- idempotencia: 1 fila por auth user
  email TEXT,  -- snapshot del email al detectar
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'ignored', 'pending_deletion')),
  resolution TEXT,  -- descripción de la acción tomada
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_orphaned_users_log_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_orphaned_users_log_updated_at ON public.orphaned_users_log;
CREATE TRIGGER update_orphaned_users_log_updated_at
  BEFORE UPDATE ON public.orphaned_users_log
  FOR EACH ROW EXECUTE FUNCTION public.update_orphaned_users_log_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orphaned_users_log_status
  ON public.orphaned_users_log (status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_orphaned_users_log_resolved_by
  ON public.orphaned_users_log (resolved_by);

-- RLS
ALTER TABLE public.orphaned_users_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orphaned_users_log_select_admin" ON public.orphaned_users_log;
CREATE POLICY "orphaned_users_log_select_admin" ON public.orphaned_users_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "orphaned_users_log_insert_admin" ON public.orphaned_users_log;
CREATE POLICY "orphaned_users_log_insert_admin" ON public.orphaned_users_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orphaned_users_log_update_admin" ON public.orphaned_users_log;
CREATE POLICY "orphaned_users_log_update_admin" ON public.orphaned_users_log
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy — log is immutable (append + update only)

COMMENT ON TABLE public.orphaned_users_log IS
  'Iteración 12 (Q4): Logs orphan auth.users (without profile). Populated by detect_orphan_users() RPC. Status: pending → resolved/ignored/pending_deletion.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS update_orphaned_users_log_updated_at ON public.orphaned_users_log;
-- DROP FUNCTION IF EXISTS public.update_orphaned_users_log_updated_at();
-- DROP TABLE IF EXISTS public.orphaned_users_log CASCADE;
-- ============================================================================
