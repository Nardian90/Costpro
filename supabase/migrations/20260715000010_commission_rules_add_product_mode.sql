-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-17): phantom field product_commission_mode en commission_rules
-- ════════════════════════════════════════════════════════════════════
-- Problema: la interfaz TS CommissionRule declara product_commission_mode
-- y los endpoints GET/POST/PATCH lo aceptan/devuelven, pero la columna
-- NUNCA existió en commission_rules. El campo era "phantom": se aceptaba
-- en el body pero se descartaba silenciosamente.
--
-- Esto hacía que el "modo default de la regla" fuera inerte — siempre
-- caía a 'per_sale' porque la columna no existía.
--
-- Esta migración añade la columna y la populatea con 'per_sale' como default
-- para reglas existentes (comportamiento retrocompatible).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS product_commission_mode TEXT NULL;

COMMENT ON COLUMN public.commission_rules.product_commission_mode IS
  'Modo default para reglas product_specific cuando un producto no tiene override en commission_rule_products. per_sale = monto fijo por venta; per_unit = monto × cantidad. NULL = treat as per_sale (back-compat).';

-- CHECK constraint
ALTER TABLE public.commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_product_commission_mode_check;

ALTER TABLE public.commission_rules
  ADD CONSTRAINT commission_rules_product_commission_mode_check
  CHECK (product_commission_mode IS NULL OR product_commission_mode IN ('per_sale', 'per_unit'));

-- Índice para filtros
CREATE INDEX IF NOT EXISTS idx_commission_rules_product_mode
  ON public.commission_rules(product_commission_mode)
  WHERE product_commission_mode IS NOT NULL;

-- Actualizar el trigger snapshot para capturar el nuevo campo
CREATE OR REPLACE FUNCTION public.snapshot_commission_rule()
RETURNS TRIGGER AS $$
DECLARE
  v_next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.commission_rule_versions
  WHERE rule_id = NEW.id;

  INSERT INTO public.commission_rule_versions (rule_id, version, snapshot, changed_by)
  VALUES (
    NEW.id,
    v_next_version,
    jsonb_build_object(
      'type', NEW.type,
      'value_percent', NEW.value_percent,
      'fixed_value', NEW.fixed_value,
      'salary_amount', NEW.salary_amount,
      'base_calculation', NEW.base_calculation,
      'priority', NEW.priority,
      'valid_from', NEW.valid_from,
      'valid_to', NEW.valid_to,
      'worker_id', NEW.worker_id,
      'store_id', NEW.store_id,
      'min_price', NEW.min_price,
      'max_price', NEW.max_price,
      'product_commission_amount', NEW.product_commission_amount,
      'product_commission_mode', NEW.product_commission_mode,
      'snapshotted_at', now()
    ),
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'phantom_field_fixed' AS status,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commission_rules'
        AND column_name = 'product_commission_mode') AS column_added;
