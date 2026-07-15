-- ════════════════════════════════════════════════════════════════════
-- ADVANCED COMMISSION RULES: product-specific + scale-based + manual mode support
-- ════════════════════════════════════════════════════════════════════
-- Adds:
--   1. New rule types: 'product_specific' (fixed $ per product sale)
--      and 'scale_percentage' (different % per product price tier)
--   2. New fields on commission_rules: min_price, max_price, product_commission_amount
--   3. New join table commission_rule_products (rule_id, product_id) for many-to-many
--   4. Fix payment_method CHECK to include 'mixed' (was a latent bug)
--
-- Design decisions:
--   - product_specific: rule has 1..N products (via join table). Each sale of those
--     products earns product_commission_amount (fixed $). These sales are EXCLUDED
--     from percentage-based rules (exclusion logic in calculateCommission).
--   - scale_percentage: rule has min_price/max_price range. Applies % to products
--     whose unit price falls in that range. Multiple scale rules can coexist.
--   - Existing 4 types (percentage_sales, fixed_amount, salary_based, hybrid)
--     remain unchanged — backward compatible.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Add new columns to commission_rules ──
ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS min_price NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS max_price NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS product_commission_amount NUMERIC(12,2) NULL;

COMMENT ON COLUMN public.commission_rules.min_price IS 'For scale_percentage: minimum product unit price (inclusive) for this tier';
COMMENT ON COLUMN public.commission_rules.max_price IS 'For scale_percentage: maximum product unit price (inclusive) for this tier. NULL = no upper bound';
COMMENT ON COLUMN public.commission_rules.product_commission_amount IS 'For product_specific: fixed $ commission per qualifying product sale';

-- ── 2. Extend type CHECK to include new types ──
ALTER TABLE public.commission_rules
  DROP CONSTRAINT IF EXISTS commission_rules_type_check;

ALTER TABLE public.commission_rules
  ADD CONSTRAINT commission_rules_type_check
  CHECK (type IN (
    'percentage_sales',
    'fixed_amount',
    'salary_based',
    'hybrid',
    'product_specific',
    'scale_percentage'
  ));

-- ── 3. Update chk_commission_values for new types ──
ALTER TABLE public.commission_rules
  DROP CONSTRAINT IF EXISTS chk_commission_values;

ALTER TABLE public.commission_rules
  ADD CONSTRAINT chk_commission_values CHECK (
    (type = 'percentage_sales' AND value_percent IS NOT NULL AND value_percent >= 0 AND value_percent <= 100) OR
    (type = 'fixed_amount' AND fixed_value IS NOT NULL AND fixed_value >= 0) OR
    (type = 'salary_based' AND salary_amount IS NOT NULL AND salary_amount >= 0) OR
    (type = 'hybrid' AND salary_amount IS NOT NULL AND value_percent IS NOT NULL) OR
    (type = 'product_specific' AND product_commission_amount IS NOT NULL AND product_commission_amount >= 0) OR
    (type = 'scale_percentage' AND value_percent IS NOT NULL AND value_percent >= 0 AND value_percent <= 100)
  );

-- ── 4. Join table for product-specific rules (many-to-many) ──
CREATE TABLE IF NOT EXISTS public.commission_rule_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.commission_rules(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rule_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_rule_products_rule
  ON public.commission_rule_products(rule_id);
CREATE INDEX IF NOT EXISTS idx_commission_rule_products_product
  ON public.commission_rule_products(product_id);

-- Enable RLS on the new table
ALTER TABLE public.commission_rule_products ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user with active membership in the rule's store
CREATE POLICY "commission_rule_products_select" ON public.commission_rule_products
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.commission_rules r
      JOIN public.user_store_memberships m ON m.store_id = r.store_id
      WHERE r.id = commission_rule_products.rule_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE: admin or manager only
CREATE POLICY "commission_rule_products_insert" ON public.commission_rule_products
  FOR INSERT TO authenticated
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

CREATE POLICY "commission_rule_products_delete" ON public.commission_rule_products
  FOR DELETE TO authenticated
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
  );

CREATE POLICY "commission_rule_products_service_role_all" ON public.commission_rule_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.commission_rule_products IS 'Join table: many-to-many between product_specific commission_rules and products. Each product sale of these products earns product_commission_amount.';

-- ── 5. Fix payment_method CHECK constraint (latent bug — DB only allowed cash/transfer/zelle, API Zod allowed 'mixed') ──
-- Find the existing constraint name first
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = connamespace
  WHERE rel.relname = 'commission_payments'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%payment_method%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.commission_payments DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.commission_payments
  ADD CONSTRAINT commission_payments_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'zelle', 'mixed'));

-- ── 6. Update snapshot trigger function to capture new fields ──
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
      'snapshotted_at', now()
    ),
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════
SELECT 'migration_applied' AS status,
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'commission_rules'
        AND column_name IN ('min_price', 'max_price', 'product_commission_amount')) AS new_columns_added,
       (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'commission_rule_products') AS join_table_created;
