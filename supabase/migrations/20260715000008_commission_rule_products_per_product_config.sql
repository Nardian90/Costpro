-- ════════════════════════════════════════════════════════════════════
-- COMMISSION_RULE_PRODUCTS: monto y modo por producto individual
-- ════════════════════════════════════════════════════════════════════
-- Objetivo: permitir que en una sola regla product_specific, cada producto
-- asociado tenga su propio monto de comisión y su propio modo (per_sale o
-- per_unit). Antes el monto era escalar a nivel de regla (un solo valor
-- para todos los productos de la regla).
--
-- Caso de uso del usuario:
--   - Panel: 1000 CUP por cada unidad vendida (per_unit)
--     → si vende 3 paneles = 3000 CUP
--   - Batería: 50 CUP fijos por venta (per_sale, sin importar cantidad)
--   - Cemento: 2% sobre el precio de venta en CUP (porcentual — este caso
--     se sigue manejando con reglas scale_percentage/percentage_sales)
--
-- Cambios:
--   1. ALTER TABLE commission_rule_products ADD COLUMN commission_amount NUMERIC(12,2) NULL
--      → monto fijo $ específico de este producto en esta regla.
--        Si es NULL, cae al default de la regla (commission_rules.product_commission_amount).
--   2. ALTER TABLE commission_rule_products ADD COLUMN commission_mode TEXT NULL
--      → 'per_sale' (default si NULL) o 'per_unit'.
--        per_sale: monto fijo por venta (no importa cantidad).
--        per_unit: monto × cantidad vendida.
--   3. CHECK constraint: commission_mode solo acepta 'per_sale' o 'per_unit'.
--   4. Policy UPDATE (faltante): permitir a admin/manager actualizar filas existentes
--      para cambiar monto/modo sin tener que DELETE + INSERT.
--   5. Índice en commission_mode para filtros eficientes.
--
-- Compatibilidad:
--   - Las reglas existentes siguen funcionando: si commission_amount IS NULL
--     en la join, el motor cae a commission_rules.product_commission_amount.
--   - Si commission_mode IS NULL, el motor lo trata como 'per_sale' (comportamiento actual).
--   - No rompe snapshots históricos (el JSONB de commission_payments ya captura
--     el monto escalar aplicado al momento del cálculo).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Añadir columnas ──
ALTER TABLE public.commission_rule_products
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS commission_mode TEXT NULL;

COMMENT ON COLUMN public.commission_rule_products.commission_amount IS
  'Monto fijo $ específico de este producto en esta regla. Si es NULL, cae al default commission_rules.product_commission_amount. Permite que una sola regla product_specific tenga montos distintos por producto.';

COMMENT ON COLUMN public.commission_rule_products.commission_mode IS
  'Modo de cálculo: per_sale = monto fijo por venta (no importa cantidad); per_unit = monto × cantidad vendida. Si es NULL, se trata como per_sale (comportamiento anterior a 2026-07-15).';

-- ── 2. CHECK constraint para commission_mode ──
ALTER TABLE public.commission_rule_products
  DROP CONSTRAINT IF EXISTS commission_rule_products_commission_mode_check;

ALTER TABLE public.commission_rule_products
  ADD CONSTRAINT commission_rule_products_commission_mode_check
  CHECK (commission_mode IS NULL OR commission_mode IN ('per_sale', 'per_unit'));

-- ── 3. Índice en commission_mode para filtros ──
CREATE INDEX IF NOT EXISTS idx_commission_rule_products_mode
  ON public.commission_rule_products(commission_mode)
  WHERE commission_mode IS NOT NULL;

-- ── 4. Policy UPDATE (faltante — antes solo INSERT y DELETE) ──
-- Permite a admin/manager actualizar filas existentes para cambiar monto/modo.
DROP POLICY IF EXISTS "commission_rule_products_update" ON public.commission_rule_products;

CREATE POLICY "commission_rule_products_update" ON public.commission_rule_products
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.commission_rules r
      JOIN public.user_store_memberships m ON m.store_id = r.store_id
      JOIN public.profiles p ON p.id = m.user_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND p.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.commission_rules r
      JOIN public.user_store_memberships m ON m.store_id = r.store_id
      JOIN public.profiles p ON p.id = m.user_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND p.role IN ('admin', 'manager')
    )
  );

-- ── 5. Trigger: actualizar updated_at (añadir columna updated_at si no existe) ──
ALTER TABLE public.commission_rule_products
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS commission_rule_products_touch_updated_at ON public.commission_rule_products;
CREATE TRIGGER commission_rule_products_touch_updated_at
  BEFORE UPDATE ON public.commission_rule_products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ════════════════════════════════════════════════════════════════════
SELECT 'migration_applied' AS status,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commission_rule_products'
        AND column_name IN ('commission_amount', 'commission_mode', 'updated_at')) AS new_columns_added,
       (SELECT count(*) FROM pg_policy
        WHERE polname = 'commission_rule_products_update') AS update_policy_count;
