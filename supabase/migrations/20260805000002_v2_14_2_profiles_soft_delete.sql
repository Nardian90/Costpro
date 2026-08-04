-- ============================================================================
-- Migration: 20260805000002_v2_14_2_profiles_soft_delete.sql
-- Iteración 12 — Fix Q6 (soft delete policy)
-- ============================================================================
-- PROBLEMA: No existe política de soft delete. DELETE físico rompería
-- integridad referencial (transactions.seller_id, audit_logs.user_id, etc.).
-- managed_delete_user actual hace DELETE en profiles y delega auth.users
-- a la API route — si esta falla, queda huérfano.
--
-- SOLUCIÓN:
--   1. ADD COLUMN deleted_at, deletion_reason, deleted_by
--   2. ADD CHECK (deleted_at IS NULL OR is_active = false)
--   3. CREATE UNIQUE INDEX profiles_email_active_unique_idx ON profiles(email)
--        WHERE deleted_at IS NULL — permite reusar email tras soft delete
--   4. DROP idx_profiles_email (no unique, reemplazado)
--   5. CREATE TRIGGER prevent_hard_delete_profile BEFORE DELETE → RAISE
--
-- UP: pasos 1-5
-- DOWN: reverso
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Añadir columnas de soft delete
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- FK deleted_by → profiles(id) SET NULL (auto-null si el admin se borra)
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.profiles(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. CHECK: si deleted_at IS NOT NULL entonces is_active debe ser false
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_deleted_implies_inactive_check
    CHECK (deleted_at IS NULL OR is_active = false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. UNIQUE INDEX partial en email (solo perfiles activos)
--    Permite reusar email de un user soft-deleted
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_active_unique_idx
  ON public.profiles (email)
  WHERE deleted_at IS NULL;

-- 4. DROP índice no-unique anterior (si existe)
DROP INDEX IF EXISTS public.idx_profiles_email;

-- 5. Trigger BEFORE DELETE: prevenir hard delete físico
--    Todo borrado debe ser via managed_soft_delete_user RPC (que hace UPDATE)
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ERR_HARD_DELETE_BLOCKED: Use managed_soft_delete_user RPC instead. Physical DELETE on profiles is forbidden by Iteración 12 (Q6) soft delete policy.';
END;
$function$;

DROP TRIGGER IF EXISTS prevent_hard_delete_profile ON public.profiles;
CREATE TRIGGER prevent_hard_delete_profile
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_profile();

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Iteración 12 (Q6): Soft delete timestamp. NULL = active. Set by managed_soft_delete_user RPC.';
COMMENT ON COLUMN public.profiles.deletion_reason IS
  'Iteración 12 (Q6): Reason for soft deletion. Set by admin via managed_soft_delete_user.';
COMMENT ON COLUMN public.profiles.deleted_by IS
  'Iteración 12 (Q6): Admin who performed soft delete. FK to profiles(id).';
COMMENT ON INDEX public.profiles_email_active_unique_idx IS
  'Iteración 12 (Q6): Unique email among active profiles. Allows reuse after soft delete.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS prevent_hard_delete_profile ON public.profiles;
-- DROP FUNCTION IF EXISTS public.prevent_hard_delete_profile();
-- DROP INDEX IF EXISTS public.profiles_email_active_unique_idx;
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_deleted_implies_inactive_check;
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_deleted_by_fkey;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS deletion_reason;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS deleted_by;
-- CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
-- ============================================================================
