-- ============================================================================
-- Production Orders — CostPro
-- Creado: 2026-07-12
-- Órdenes de Producción (genera entrada al almacén) y de Servicio (sin entrada)
-- ============================================================================

-- ── 1. Tabla PRODUCTION_ORDERS ──
CREATE TABLE IF NOT EXISTS public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  -- Tipo: production (genera entrada al almacén) o service (sin entrada)
  order_type TEXT NOT NULL DEFAULT 'service'
    CHECK (order_type IN ('production', 'service')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'in_progress', 'paused', 'completed', 'closed', 'voided')),
  -- Cliente
  customer_name TEXT,
  customer_ci TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  -- Presupuesto
  budget_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  budget_currency TEXT NOT NULL DEFAULT 'CUP',
  -- Pago
  advance_amount NUMERIC(12,2) DEFAULT 0,
  advance_method TEXT CHECK (advance_method IS NULL OR advance_method IN ('cash', 'transfer', 'zelle')),
  advance_currency TEXT DEFAULT 'CUP',
  paid_amount NUMERIC(12,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  -- Producto resultante (solo para production: el producto terminado que entra al almacén)
  output_product_id UUID REFERENCES public.products(id),
  output_quantity NUMERIC(12,2) DEFAULT 0,
  -- Fechas
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date DATE,
  completion_date DATE,
  closed_at TIMESTAMPTZ,
  -- Metadata
  description TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_orders_number ON production_orders(store_id, order_number);
CREATE INDEX IF NOT EXISTS idx_production_orders_store ON production_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_type ON production_orders(order_type);

-- ── 2. Tabla PRODUCTION_ORDER_ITEMS (líneas de presupuesto + salidas reales) ──
CREATE TABLE IF NOT EXISTS public.production_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_id UUID REFERENCES public.product_variants(id),
  -- Presupuesto
  budgeted_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  budgeted_unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Salida real
  actual_qty NUMERIC(12,2) DEFAULT 0,
  actual_unit_cost NUMERIC(12,2) DEFAULT 0,
  withdrawn_at TIMESTAMPTZ,
  -- Estado del item
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_items_order ON production_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_prod_items_product ON production_order_items(product_id);

-- ── 3. Trigger: generar order_number automático ──
CREATE OR REPLACE FUNCTION generate_production_order_number()
RETURNS TRIGGER AS $$
DECLARE
  v_count INT;
  v_year INT := EXTRACT(YEAR FROM now());
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    SELECT COUNT(*) + 1 INTO v_count FROM production_orders WHERE store_id = NEW.store_id;
    NEW.order_number := 'OP-' || v_year || '-' || LPAD(v_count::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_po_number ON production_orders;
CREATE TRIGGER trg_generate_po_number
  BEFORE INSERT ON production_orders
  FOR EACH ROW EXECUTE FUNCTION generate_production_order_number();

-- ── 4. RLS ──
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_select_own_store" ON production_orders
  FOR SELECT USING (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "po_insert_own_store" ON production_orders
  FOR INSERT WITH CHECK (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "po_update_own_store" ON production_orders
  FOR UPDATE USING (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "po_delete_own_store" ON production_orders
  FOR DELETE USING (
    store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE production_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_select_own_store" ON production_order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM production_orders WHERE store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "poi_insert_own_store" ON production_order_items
  FOR INSERT WITH CHECK (
    order_id IN (SELECT id FROM production_orders WHERE store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "poi_update_own_store" ON production_order_items
  FOR UPDATE USING (
    order_id IN (SELECT id FROM production_orders WHERE store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "poi_delete_own_store" ON production_order_items
  FOR DELETE USING (
    order_id IN (SELECT id FROM production_orders WHERE store_id IN (SELECT active_store_id FROM profiles WHERE id = auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 5. RPC: Dar salida a producto (descuenta inventario) ──
CREATE OR REPLACE FUNCTION withdraw_production_item(
  p_item_id UUID,
  p_qty NUMERIC,
  p_unit_cost NUMERIC,
  p_store_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_order_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
BEGIN
  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Item no encontrado';
  END IF;

  -- Actualizar el item con la cantidad salida
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = p_unit_cost,
    withdrawn_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END,
    updated_at = now()
  WHERE id = p_item_id;

  -- Descontar del inventario
  UPDATE products SET
    stock_current = stock_current - p_qty,
    updated_at = now()
  WHERE id = v_product_id AND store_id = p_store_id;

  -- Registrar movimiento de stock
  INSERT INTO stock_movements (store_id, product_id, variant_id, quantity, movement_type, reference, created_at)
  VALUES (p_store_id, v_product_id, v_variant_id, -p_qty, 'production_out', v_order_id::text, now());
END;
$$ LANGUAGE plpgsql;

-- ── 6. RPC: Entrada de producto terminado al cerrar orden de producción ──
CREATE OR REPLACE FUNCTION receive_production_output(
  p_order_id UUID,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_store_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Actualizar la orden con el producto de salida
  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_order_id;

  -- Incrementar inventario del producto terminado
  UPDATE products SET
    stock_current = stock_current + p_quantity,
    updated_at = now()
  WHERE id = p_product_id AND store_id = p_store_id;

  -- Registrar movimiento de stock (entrada)
  INSERT INTO stock_movements (store_id, product_id, quantity, movement_type, reference, created_at)
  VALUES (p_store_id, p_product_id, p_quantity, 'production_in', p_order_id::text, now());
END;
$$ LANGUAGE plpgsql;

-- ── 7. Actualizar get_cash_report para incluir production_orders ──
CREATE OR REPLACE FUNCTION get_cash_report(
  p_store_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '1 day',
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_commissions JSON;
  v_production JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
  v_production_total_cup NUMERIC := 0;
BEGIN
  -- Ventas por método y moneda
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT payment_method, sale_currency AS currency, COUNT(*) AS transaction_count,
      SUM(total_amount) AS total,
      SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END) AS total_cup
    FROM transactions
    WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided'
    GROUP BY payment_method, sale_currency ORDER BY payment_method, sale_currency
  ) t;

  -- Pagos a proveedores
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id AND payment_date >= p_start_date AND payment_date <= p_end_date
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Comisiones
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT payment_method, currency, COUNT(*) AS commission_count, SUM(final_amount) AS total, SUM(amount_cup) AS total_cup
    FROM commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND paid_at >= p_start_date AND paid_at <= p_end_date AND payment_method IS NOT NULL
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- FIX-PRODUCTION (2026-07-12): Pagos de órdenes de producción (anticipos + cierres)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_production
  FROM (
    SELECT payment_method, currency, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id AND ref_type = 'production_order'
      AND payment_date >= p_start_date AND payment_date <= p_end_date
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- Totales
  SELECT COALESCE(SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END), 0)
  INTO v_sales_total_cup FROM transactions
  WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided';

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions WHERE store_id = p_store_id AND payment_date >= p_start_date AND payment_date <= p_end_date
  AND ref_type IN ('receipt', 'service');

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments WHERE store_id = p_store_id AND status = 'paid'
  AND paid_at >= p_start_date AND paid_at <= p_end_date;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_production_total_cup
  FROM payment_transactions WHERE store_id = p_store_id AND ref_type = 'production_order'
  AND payment_date >= p_start_date AND payment_date <= p_end_date;

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'production_total_cup', v_production_total_cup,
    'balance_cup', v_sales_total_cup + v_production_total_cup - v_payments_total_cup - v_commissions_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'commissions', v_commissions,
    'production', v_production, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE production_orders IS 'Órdenes de producción (genera entrada al almacén) y servicio (sin entrada)';
COMMENT ON COLUMN production_orders.order_type IS 'production = genera producto terminado que entra al almacén; service = solo consume materiales';
