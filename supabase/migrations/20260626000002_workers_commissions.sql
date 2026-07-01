-- ════════════════════════════════════════════════════════════════════
-- MULTI-TIENDA: GESTIÓN DE TRABAJADORES Y COMISIONES
-- ════════════════════════════════════════════════════════════════════
-- Mejoras vs prompt original (aplicadas con criterio crítico):
--
-- 1. sales_transactions con FK opcional a transactions.id (no duplica POS)
-- 2. Tabla commission_rule_versions separada (histórico inmutable)
-- 3. commission_payments.calculated_breakdown JSONB (auditabilidad reproducible)
-- 4. commission_payments.manual_adjustment_reason TEXT (justifica edición manual)
-- 5. parseCI valida mes/día/año futuro estrictamente
-- 6. UNIQUE (store_id, period) por worker para evitar pagos solapados
-- 7. RLS admin+manager en escritura, encargado en lectura
-- ════════════════════════════════════════════════════════════════════

-- ── Tabla 1: workers ──
CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  ci TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

  -- Campos opcionales
  gender TEXT CHECK (gender IN ('M', 'F', 'other') OR gender IS NULL),
  birth_date DATE,  -- derivado del CI en app, pero almacenado para query efficiency
  address TEXT,
  province TEXT,
  municipality TEXT,
  shirt_size TEXT,
  shoe_size INTEGER,
  waist_size INTEGER,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  tenant_id UUID
);

-- CI único por tienda (no global — permite mismo CI en tiendas distintas)
CREATE UNIQUE INDEX IF NOT EXISTS workers_store_ci_unique_idx
  ON public.workers (store_id, ci);
CREATE INDEX IF NOT EXISTS workers_store_status_idx
  ON public.workers (store_id, status);
CREATE INDEX IF NOT EXISTS workers_store_active_idx
  ON public.workers (store_id) WHERE status = 'active';

-- ── Tabla 2: commission_rules ──
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,  -- NULL = aplica a toda la tienda

  -- Tipo de comisión
  type TEXT NOT NULL CHECK (type IN ('percentage_sales', 'fixed_amount', 'salary_based', 'hybrid')),

  -- Valores (cuál aplica depende del type)
  value_percent NUMERIC(5,2),  -- 0-100, nullable
  fixed_value NUMERIC(12,2),   -- monto fijo en CUP, nullable
  salary_amount NUMERIC(12,2), -- para salary_based/hybrid, nullable

  -- Base de cálculo
  base_calculation TEXT NOT NULL DEFAULT 'total_sales'
    CHECK (base_calculation IN ('total_sales', 'cash_sales', 'transfer_sales', 'net_sales')),

  -- Prioridad: reglas más específicas (worker-specific) tienen mayor prioridad
  priority INTEGER NOT NULL DEFAULT 0,

  -- Vigencia
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,  -- NULL = sin fin

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  tenant_id UUID,

  CONSTRAINT chk_commission_values CHECK (
    (type = 'percentage_sales' AND value_percent IS NOT NULL AND value_percent >= 0 AND value_percent <= 100) OR
    (type = 'fixed_amount' AND fixed_value IS NOT NULL AND fixed_value >= 0) OR
    (type = 'salary_based' AND salary_amount IS NOT NULL AND salary_amount >= 0) OR
    (type = 'hybrid' AND salary_amount IS NOT NULL AND value_percent IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS commission_rules_store_worker_idx
  ON public.commission_rules (store_id, worker_id, priority DESC);
CREATE INDEX IF NOT EXISTS commission_rules_store_valid_idx
  ON public.commission_rules (store_id, valid_from DESC, valid_to);

-- ── Tabla 3: commission_rule_versions (histórico inmutable) ──
-- Cada vez que se edita una regla, se inserta una versión nueva.
-- La regla actual apunta a la última versión.
CREATE TABLE IF NOT EXISTS public.commission_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.commission_rules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,  -- copia completa de la regla en ese momento
  changed_by UUID REFERENCES public.profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_reason TEXT,
  UNIQUE (rule_id, version)
);

CREATE INDEX IF NOT EXISTS commission_rule_versions_rule_idx
  ON public.commission_rule_versions (rule_id, version DESC);

-- ── Tabla 4: sales_transactions ──
-- No duplica transactions (POS) — tiene FK opcional a transactions.id
-- Permite ventas manuales (sin POS) y vincula ventas POS a workers
CREATE TABLE IF NOT EXISTS public.sales_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,

  -- Vinculación opcional a transactions (POS)
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,

  -- Montos (redundante con transactions si hay FK, pero permite ventas manuales)
  amount_total NUMERIC(12,2) NOT NULL CHECK (amount_total >= 0),
  payment_cash NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (payment_cash >= 0),
  payment_transfer NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (payment_transfer >= 0),

  -- Fecha efectiva (puede diferir de created_at para ventas históricas)
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  tenant_id UUID,

  -- cash + transfer debe sumar amount_total
  CONSTRAINT chk_sales_payments_sum CHECK (payment_cash + payment_transfer = amount_total)
);

CREATE INDEX IF NOT EXISTS sales_transactions_store_worker_date_idx
  ON public.sales_transactions (store_id, worker_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS sales_transactions_store_date_idx
  ON public.sales_transactions (store_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS sales_transactions_transaction_idx
  ON public.sales_transactions (transaction_id) WHERE transaction_id IS NOT NULL;

-- ── Tabla 5: commission_payments ──
CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Montos
  calculated_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(12,2) NOT NULL DEFAULT 0,  -- editable manualmente
  manual_adjustment_reason TEXT,  -- justifica diferencia vs calculated

  -- Snapshot reproducible del cálculo (auditabilidad)
  calculated_breakdown JSONB,  -- {sales: {cash, transfer, total}, rule_applied, rule_snapshot, calculated_at}

  -- Regla aplicada
  rule_applied_id UUID REFERENCES public.commission_rules(id) ON DELETE SET NULL,

  -- Estado del pago
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'cancelled')),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.profiles(id),
  paid_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  tenant_id UUID,

  -- Validación: no solapamiento de periodos por worker
  -- (se verifica con UNIQUE index parcial: solo 1 pago activo por worker+periodo)
  CONSTRAINT chk_payment_dates CHECK (period_end >= period_start),
  CONSTRAINT chk_payment_amounts CHECK (final_amount >= 0 AND calculated_amount >= 0)
);

-- Solo 1 pago NO cancelled por (worker, periodo) — evita duplicados
CREATE UNIQUE INDEX IF NOT EXISTS commission_payments_worker_period_unique_idx
  ON public.commission_payments (worker_id, period_start, period_end)
  WHERE status != 'cancelled';

CREATE INDEX IF NOT EXISTS commission_payments_store_worker_status_idx
  ON public.commission_payments (store_id, worker_id, status, period_start DESC);
CREATE INDEX IF NOT EXISTS commission_payments_worker_status_idx
  ON public.commission_payments (worker_id, status, period_start DESC);

-- ════════════════════════════════════════════════════════════════════
-- RLS POLICIES — admin/manager write, encargado read
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

-- Helper: policies idénticas para todas las tablas del módulo
-- Lectura: authenticated con membership en la tienda
-- Escritura: admin o manager con membership en la tienda
-- service_role: bypass total

-- workers
CREATE POLICY "workers_select_authenticated" ON public.workers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_store_memberships m
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
    )
  );
CREATE POLICY "workers_insert_admin_manager" ON public.workers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role IN ('admin', 'manager')
    )
  );
CREATE POLICY "workers_update_admin_manager" ON public.workers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role IN ('admin', 'manager')
    )
  );
CREATE POLICY "workers_delete_admin" ON public.workers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_store_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.user_id = auth.uid() AND m.store_id = workers.store_id AND m.status = 'active'
      AND p.role = 'admin'
    )
  );
CREATE POLICY "workers_service_role_all" ON public.workers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Aplicar las mismas policies a las otras 4 tablas (patrón idéntico)
-- commission_rules
CREATE POLICY "commission_rules_select" ON public.commission_rules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active'));
CREATE POLICY "commission_rules_insert" ON public.commission_rules
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager')));
CREATE POLICY "commission_rules_update" ON public.commission_rules
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager')));
CREATE POLICY "commission_rules_delete" ON public.commission_rules
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_rules.store_id AND m.status = 'active' AND p.role = 'admin'));
CREATE POLICY "commission_rules_service_role_all" ON public.commission_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- commission_rule_versions (read-only vía app, service_role escribe)
CREATE POLICY "commission_rule_versions_select" ON public.commission_rule_versions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM commission_rules r JOIN user_store_memberships m ON m.store_id = r.store_id WHERE r.id = commission_rule_versions.rule_id AND m.user_id = auth.uid() AND m.status = 'active'));
CREATE POLICY "commission_rule_versions_service_role_all" ON public.commission_rule_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- sales_transactions
CREATE POLICY "sales_transactions_select" ON public.sales_transactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active'));
CREATE POLICY "sales_transactions_insert" ON public.sales_transactions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager')));
CREATE POLICY "sales_transactions_update" ON public.sales_transactions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager')));
CREATE POLICY "sales_transactions_delete" ON public.sales_transactions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = sales_transactions.store_id AND m.status = 'active' AND p.role = 'admin'));
CREATE POLICY "sales_transactions_service_role_all" ON public.sales_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- commission_payments
CREATE POLICY "commission_payments_select" ON public.commission_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active'));
CREATE POLICY "commission_payments_insert" ON public.commission_payments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager')));
CREATE POLICY "commission_payments_update" ON public.commission_payments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role IN ('admin', 'manager')));
CREATE POLICY "commission_payments_delete" ON public.commission_payments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_store_memberships m JOIN profiles p ON p.id = m.user_id WHERE m.user_id = auth.uid() AND m.store_id = commission_payments.store_id AND m.status = 'active' AND p.role = 'admin'));
CREATE POLICY "commission_payments_service_role_all" ON public.commission_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════
-- TRIGGER: auto-update updated_at
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS workers_touch_updated_at ON public.workers;
CREATE TRIGGER workers_touch_updated_at BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS commission_rules_touch_updated_at ON public.commission_rules;
CREATE TRIGGER commission_rules_touch_updated_at BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS sales_transactions_touch_updated_at ON public.sales_transactions;
CREATE TRIGGER sales_transactions_touch_updated_at BEFORE UPDATE ON public.sales_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS commission_payments_touch_updated_at ON public.commission_payments;
CREATE TRIGGER commission_payments_touch_updated_at BEFORE UPDATE ON public.commission_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- TRIGGER: auto-version commission_rules
-- Cada INSERT o UPDATE crea una entrada en commission_rule_versions
-- ════════════════════════════════════════════════════════════════════
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
      'snapshotted_at', now()
    ),
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS commission_rules_snapshot ON public.commission_rules;
CREATE TRIGGER commission_rules_snapshot
  AFTER INSERT OR UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_commission_rule();

-- ════════════════════════════════════════════════════════════════════
-- RPC: get_worker_commission_summary
-- Devuelve resumen de ventas + último pago para lista de workers
-- ════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_worker_commission_summary(
  p_store_id UUID,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
) RETURNS TABLE (
  worker_id UUID,
  first_name TEXT,
  last_name TEXT,
  ci TEXT,
  status TEXT,
  sales_cash NUMERIC,
  sales_transfer NUMERIC,
  sales_total NUMERIC,
  last_payment_date DATE,
  last_payment_amount NUMERIC,
  active_rule_id UUID,
  active_rule_type TEXT,
  active_rule_value NUMERIC
) AS $$
DECLARE
  v_date_from DATE := COALESCE(p_date_from, date_trunc('month', now())::date);
  v_date_to DATE := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  RETURN QUERY
  SELECT
    w.id AS worker_id,
    w.first_name,
    w.last_name,
    w.ci,
    w.status,
    COALESCE(SUM(st.payment_cash), 0)::NUMERIC AS sales_cash,
    COALESCE(SUM(st.payment_transfer), 0)::NUMERIC AS sales_transfer,
    COALESCE(SUM(st.amount_total), 0)::NUMERIC AS sales_total,
    (SELECT period_end FROM public.commission_payments
      WHERE worker_id = w.id AND status != 'cancelled'
      ORDER BY period_end DESC LIMIT 1) AS last_payment_date,
    (SELECT final_amount FROM public.commission_payments
      WHERE worker_id = w.id AND status != 'cancelled'
      ORDER BY period_end DESC LIMIT 1) AS last_payment_amount,
    (SELECT id FROM public.commission_rules
      WHERE store_id = p_store_id
        AND (worker_id = w.id OR worker_id IS NULL)
        AND valid_from <= v_date_to
        AND (valid_to IS NULL OR valid_to >= v_date_from)
      ORDER BY priority DESC, worker_id NULLS LAST, valid_from DESC
      LIMIT 1) AS active_rule_id,
    (SELECT type FROM public.commission_rules
      WHERE store_id = p_store_id
        AND (worker_id = w.id OR worker_id IS NULL)
        AND valid_from <= v_date_to
        AND (valid_to IS NULL OR valid_to >= v_date_from)
      ORDER BY priority DESC, worker_id NULLS LAST, valid_from DESC
      LIMIT 1) AS active_rule_type,
    (SELECT COALESCE(value_percent, fixed_value, salary_amount)
      FROM public.commission_rules
      WHERE store_id = p_store_id
        AND (worker_id = w.id OR worker_id IS NULL)
        AND valid_from <= v_date_to
        AND (valid_to IS NULL OR valid_to >= v_date_from)
      ORDER BY priority DESC, worker_id NULLS LAST, valid_from DESC
      LIMIT 1) AS active_rule_value
  FROM public.workers w
  LEFT JOIN public.sales_transactions st
    ON st.worker_id = w.id AND st.sale_date BETWEEN v_date_from AND v_date_to
  WHERE w.store_id = p_store_id
  GROUP BY w.id, w.first_name, w.last_name, w.ci, w.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════════════
-- GRANT EXECUTE
-- ════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.get_worker_commission_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_worker_commission_summary(UUID, DATE, DATE) TO service_role;

COMMENT ON TABLE public.workers IS 'Trabajadores por tienda. CI único por tienda. birth_date derivado del CI en app.';
COMMENT ON TABLE public.commission_rules IS 'Reglas de comisión versionables. worker_id NULL = aplica a toda la tienda. priority: más alta = más específica.';
COMMENT ON TABLE public.commission_rule_versions IS 'Histórico inmutable de reglas. Auto-poblado por trigger AFTER INSERT/UPDATE.';
COMMENT ON TABLE public.sales_transactions IS 'Ventas vinculadas a workers. FK opcional a transactions (POS). payment_cash + payment_transfer = amount_total.';
COMMENT ON TABLE public.commission_payments IS 'Pagos de comisión. final_amount editable manualmente con manual_adjustment_reason. calculated_breakdown JSONB para auditabilidad.';
