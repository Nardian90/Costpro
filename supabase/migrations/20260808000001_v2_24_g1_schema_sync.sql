-- ══════════════════════════════════════════════════════════════════════
-- F-20 G1 — Schema sync de purchase_orders (versión final consolidada)
-- Baseline: v2.23.0-receipts-hardening → v2.24.0-purchase-orders-fix
-- Hallazgos cubiertos: Crítico #1 (columnas inexistentes), Alto #7 (sin UNIQUE po_number)
-- Condiciones del usuario:
--   #2: Backfill defensivo con COALESCE(supplier_name, supplier, 'SIN PROVEEDOR')
--       Verificar COUNT(*) = 0 antes de SET NOT NULL.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Añadir columnas faltantes (idempotente con IF NOT EXISTS)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_id   uuid,
  ADD COLUMN IF NOT EXISTS po_number     text,
  ADD COLUMN IF NOT EXISTS total_amount  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes         text,
  ADD COLUMN IF NOT EXISTS expected_date date,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

-- 2. Backfill defensivo (condición #2 del usuario)
-- Usar COALESCE en cascada: si supplier_name es NULL, usar supplier;
-- si supplier también es NULL, usar 'SIN PROVEEDOR'.
UPDATE public.purchase_orders
SET supplier_name = COALESCE(supplier_name, supplier, 'SIN PROVEEDOR')
WHERE supplier_name IS NULL;

-- 3. Verificación: si quedan NULL, abortar (no debe ocurrir con el COALESCE)
DO $$
DECLARE
  v_null_count integer;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM public.purchase_orders
  WHERE supplier_name IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'G1 SAFETY ABORT: % rows in purchase_orders still have supplier_name NULL after backfill. Manual intervention required.', v_null_count;
  END IF;
END $$;

-- 4. Hacer supplier_name NOT NULL (después del backfill + verificación)
ALTER TABLE public.purchase_orders
  ALTER COLUMN supplier_name SET NOT NULL;

-- 5. FK supplier_id → suppliers(id) ON DELETE SET NULL (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 6. UNIQUE (store_id, po_number) — partial index solo cuando po_number IS NOT NULL
-- Permite múltiples POs en borrador sin po_number (autogenerado al crear).
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_store_po_number
  ON public.purchase_orders (store_id, po_number)
  WHERE po_number IS NOT NULL;

-- 7. Trigger updated_at (consistente con receipts)
CREATE OR REPLACE FUNCTION public.update_purchase_orders_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_purchase_orders_updated_at();

-- 8. Index complementario para búsquedas por supplier_id
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id
  ON public.purchase_orders (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- 9. Comentario deprecación en supplier
COMMENT ON COLUMN public.purchase_orders.supplier IS
  'DEPRECATED v2.24.0: usar supplier_name. Se conserva por compatibilidad con receipts y reportes legacy.';

-- ═══ DOWN ═══
-- DROP INDEX IF EXISTS uq_purchase_orders_store_po_number;
-- DROP INDEX IF EXISTS idx_purchase_orders_supplier_id;
-- DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON public.purchase_orders;
-- DROP FUNCTION IF EXISTS public.update_purchase_orders_updated_at();
-- ALTER TABLE public.purchase_orders
--   DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey,
--   DROP COLUMN IF EXISTS supplier_name,
--   DROP COLUMN IF EXISTS supplier_id,
--   DROP COLUMN IF EXISTS po_number,
--   DROP COLUMN IF EXISTS total_amount,
--   DROP COLUMN IF EXISTS notes,
--   DROP COLUMN IF EXISTS expected_date,
--   DROP COLUMN IF EXISTS updated_at;
