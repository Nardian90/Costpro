-- ============================================================================
-- Migration: 20260805000004_v2_14_4_user_invitations.sql
-- Iteración 12 — Base para futura UI de invitaciones
-- ============================================================================
-- Tabla para invitations de usuarios (email + store + role + token_hash).
-- Se crea ahora como base; la UI se implementará en próxima iteración.
--
-- UP: CREATE TABLE + RLS + indexes
-- DOWN: DROP TABLE
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'clerk',
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,  -- hash del token, no el token plano
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_user_invitations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_invitations_updated_at ON public.user_invitations;
CREATE TRIGGER update_user_invitations_updated_at
  BEFORE UPDATE ON public.user_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_user_invitations_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_invitations_email
  ON public.user_invitations (email);

CREATE INDEX IF NOT EXISTS idx_user_invitations_store
  ON public.user_invitations (store_id, status);

CREATE INDEX IF NOT EXISTS idx_user_invitations_status_expires
  ON public.user_invitations (status, expires_at);

-- RLS
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_invitations_select_own_managed" ON public.user_invitations;
CREATE POLICY "user_invitations_select_own_managed" ON public.user_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR invited_by = auth.uid()
    OR public.has_store_role(store_id, ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "user_invitations_insert_admin_manager" ON public.user_invitations;
CREATE POLICY "user_invitations_insert_admin_manager" ON public.user_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.has_store_role(store_id, ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "user_invitations_update_admin_manager" ON public.user_invitations;
CREATE POLICY "user_invitations_update_admin_manager" ON public.user_invitations
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.has_store_role(store_id, ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    public.is_admin()
    OR public.has_store_role(store_id, ARRAY['admin', 'manager'])
  );

COMMENT ON TABLE public.user_invitations IS
  'Iteración 12: User invitations. Base table for future invitations UI. token_hash stores bcrypt/hash of invitation token (not plaintext).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS update_user_invitations_updated_at ON public.user_invitations;
-- DROP FUNCTION IF EXISTS public.update_user_invitations_updated_at();
-- DROP TABLE IF EXISTS public.user_invitations CASCADE;
-- ============================================================================
