-- ============================================================================
-- Migration: Create store_reset_snapshots table
-- Date: 2026-07-12
-- Task: FIX-AUDIT-MSTORE-05 (P2 — Reset sin backup/snapshot real)
--
-- Antes de borrar ventas/inventario/catálogo vía RPC, el endpoint
-- /api/stores/reset guardará un snapshot de los datos afectados en esta
-- tabla. Así, si un dueño de MiPYME ejecuta un reset por error, el equipo
-- de soporte puede recuperar los datos manualmente vía SQL.
--
-- La restauración NO se automatiza en esta ronda — solo se preservan los
-- datos. El cron de limpieza (borrar snapshots con expires_at < now()) se
-- deja como TODO pendiente (ver PR description).
-- ============================================================================

BEGIN;

-- 1. Crear tabla de snapshots
CREATE TABLE IF NOT EXISTS public.store_reset_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Si true: el snapshot preservó products + product_variants (pero reseteó stock a 0)
  -- Si false: se borró TODO incluyendo catálogo
  keep_catalog BOOLEAN NOT NULL DEFAULT false,
  -- Snapshot completo (jsonb) o resumen agregado si el volumen era grande
  -- Estructura esperada:
  --   {
  --     "summary": { "products": N, "transactions": N, "stock_movements": N, "receipts": N },
  --     "full": true | false,  -- false si solo se guardó el resumen
  --     "products": [...],     -- solo si full=true y !keep_catalog
  --     "transactions": [...], -- solo si full=true
  --     "stock_movements": [...], -- solo si full=true
  --     "receipts": [...]      -- solo si full=true
  --   }
  snapshot JSONB NOT NULL,
  -- Auto-expira a los 7 días — después de eso el cron puede borrarlo
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- 2. Índices para consultas comunes
CREATE INDEX IF NOT EXISTS idx_store_reset_snapshots_store_id
  ON public.store_reset_snapshots(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_reset_snapshots_expires_at
  ON public.store_reset_snapshots(expires_at)
  WHERE expires_at < now();  -- partial index para el cleanup cron

-- 3. RLS: solo admins pueden leer snapshots (no exponer a managers/clerks)
ALTER TABLE public.store_reset_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_reset_snapshots_select_admin" ON public.store_reset_snapshots;
CREATE POLICY "store_reset_snapshots_select_admin" ON public.store_reset_snapshots
  FOR SELECT TO authenticated
  USING (public.is_global_admin());

-- INSERT: solo admin puede insertar (vía API route con service role)
DROP POLICY IF EXISTS "store_reset_snapshots_insert_admin" ON public.store_reset_snapshots;
CREATE POLICY "store_reset_snapshots_insert_admin" ON public.store_reset_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin());

-- DELETE: solo admin puede borrar (manual o vía cron)
DROP POLICY IF EXISTS "store_reset_snapshots_delete_admin" ON public.store_reset_snapshots;
CREATE POLICY "store_reset_snapshots_delete_admin" ON public.store_reset_snapshots
  FOR DELETE TO authenticated
  USING (public.is_global_admin());

-- UPDATE: denegado (snapshots son inmutables una vez creados)
DROP POLICY IF EXISTS "store_reset_snapshots_update_admin" ON public.store_reset_snapshots;
CREATE POLICY "store_reset_snapshots_update_admin" ON public.store_reset_snapshots
  FOR UPDATE TO authenticated
  USING (false);

-- 4. Comentario
COMMENT ON TABLE public.store_reset_snapshots IS
  'FIX-AUDIT-MSTORE-05: snapshots pre-reset para recuperación manual en caso de reset accidental. Auto-expiran a los 7 días.';

COMMIT;
