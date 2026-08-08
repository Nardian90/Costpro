-- ══════════════════════════════════════════════════════════════════════
-- F-16 G1 — Schema: UNIQUE + SEQUENCE + idempotency_key + output cost snapshot + enum
--
-- Cambios:
-- 1. ADD COLUMN idempotency_key text (para G7 create_production_order_v2)
-- 2. ADD COLUMN output_total_cost numeric (snapshot del costo de producción al recibir output)
-- 3. ADD COLUMN output_unit_cost numeric (output_total_cost / output_quantity)
-- 4. CREATE SEQUENCE production_order_number_seq (reemplaza count+1)
-- 5. MODIFY generate_production_order_number trigger para usar nextval
-- 6. CREATE UNIQUE INDEX (store_id, order_number) con preflight check
-- 7. ADD VALUE 'production_reverse' to movement_type enum
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Preflight: verificar que no haya duplicados ───
DO $$
DECLARE v_dups integer;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT store_id, order_number FROM production_orders
    GROUP BY store_id, order_number HAVING COUNT(*) > 1
  ) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'G1 SAFETY ABORT: % duplicate (store_id, order_number) pairs found. Sanea antes de migrar.', v_dups;
  END IF;
END $$;

-- ─── 2. ADD COLUMN idempotency_key ───
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- ─── 3. ADD COLUMN output_total_cost + output_unit_cost (snapshot) ───
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS output_total_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_unit_cost numeric DEFAULT 0;

COMMENT ON COLUMN public.production_orders.output_total_cost IS
  'F-16 v2.26.0: Snapshot del costo total de materiales consumidos al recibir output. Congelado al ejecutar receive_production_output. Usado por void/reverse para WAC reversal.';
COMMENT ON COLUMN public.production_orders.output_unit_cost IS
  'F-16 v2.26.0: output_total_cost / output_quantity. Snapshot unitario.';

-- ─── 4. UNIQUE INDEX (store_id, order_number) ───
CREATE UNIQUE INDEX IF NOT EXISTS uq_production_orders_store_order_number
  ON public.production_orders (store_id, order_number);

-- Partial UNIQUE INDEX on idempotency_key (solo donde no sea NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_production_orders_idempotency_key
  ON public.production_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── 5. CREATE SEQUENCE ───
CREATE SEQUENCE IF NOT EXISTS public.production_order_number_seq START 1;

-- ─── 6. MODIFY generate_production_order_number ───
CREATE OR REPLACE FUNCTION public.generate_production_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year INT := EXTRACT(YEAR FROM now());
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'OP-' || v_year || '-' || LPAD(nextval('production_order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

-- ─── 7. ADD VALUE 'production_reverse' to movement_type enum ───
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'production_reverse';
