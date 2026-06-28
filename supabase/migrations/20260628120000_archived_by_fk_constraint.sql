-- Migration: 20260628120000_archived_by_fk_constraint.sql
-- Objetivo: Añadir FK constraint en stores.archived_by → auth.users(id) ON DELETE SET NULL.
--
-- FIX-AUDIT-6: La migración 20260628000001_store_archiving.sql añadió la columna
-- archived_by UUID pero sin REFERENCES auth.users(id). Esto puede resultar en
-- UUIDs huérfanos si el usuario es eliminado. Esta migración añade el FK.
--
-- Estrategia:
--   1. Limpiar valores huérfanos existentes (archived_by no presente en auth.users)
--   2. Añadir FK con ON DELETE SET NULL (si el usuario se borra, archived_by → NULL,
--      pero el registro de archivado se conserva con archived_at)

-- 1. Limpiar valores huérfanos (archived_by que no existe en auth.users)
UPDATE public.stores
SET archived_by = NULL
WHERE archived_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = stores.archived_by::uuid
  );

-- 2. Añadir FK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stores_archived_by_fkey'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_archived_by_fkey
      FOREIGN KEY (archived_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Comentario
COMMENT ON CONSTRAINT stores_archived_by_fkey ON public.stores IS
  'FK to auth.users — if user is deleted, archived_by becomes NULL (archived_at preserved)';
