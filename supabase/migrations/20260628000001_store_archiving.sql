-- Migration: 20260628000001_store_archiving.sql
-- Objetivo: Añadir capacidad de archivar/restaurar tiendas.
-- Las tiendas archivadas conservan todos sus datos (transacciones, inventario, etc.)
-- pero se ocultan de la vista activa del dashboard y no aceptan nuevas operaciones.

-- 1. Añadir columna is_archived a stores (default false)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Añadir columna archived_at para registrar cuándo se archivó
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE public.stores ADD COLUMN archived_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Añadir columna archived_by para registrar quién archivó
-- FIX-AUDIT-7: Added REFERENCES auth.users(id) ON DELETE SET NULL directly in the
-- column definition. Previously the column was created without FK, requiring a
-- separate migration (20260628120000) to add the constraint. Now this migration
-- is self-contained and idempotent — the FK is added if it doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE public.stores
      ADD COLUMN archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3b. Ensure FK exists even if column was already created without it (legacy deployments)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_archived_by_fkey'
  ) THEN
    -- Clean orphaned archived_by values before adding FK
    UPDATE public.stores
    SET archived_by = NULL
    WHERE archived_by IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = stores.archived_by::uuid);

    ALTER TABLE public.stores
      ADD CONSTRAINT stores_archived_by_fkey
      FOREIGN KEY (archived_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Índice para filtrar archivadas eficientemente
CREATE INDEX IF NOT EXISTS idx_stores_is_archived ON public.stores(is_archived);

-- 5. Comentario
COMMENT ON COLUMN public.stores.is_archived IS 'true = tienda archivada (oculta del dashboard activo, datos preservados)';
COMMENT ON COLUMN public.stores.archived_at IS 'Timestamp de archivado';
COMMENT ON COLUMN public.stores.archived_by IS 'UUID del usuario que archivó la tienda';
