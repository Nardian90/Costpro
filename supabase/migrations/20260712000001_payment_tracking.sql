-- ============================================================================
-- Payment Tracking & Cash Report — CostPro
-- Creado: 2026-07-12
-- Descripción: Añade tracking de pagos a proveedores (recepciones + servicios)
-- y soporte para reporte de caja con desglose por billete para entrega de dinero.
-- ============================================================================

-- ── 1. Añadir campos de pago a RECEIPTS ──
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'zelle')),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 30;

-- ── 2. Añadir campos de pago a RECEIVED_SERVICES ──
ALTER TABLE received_services
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'zelle')),
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 30;

-- ── 3. Crear tabla unificada PAYMENT_TRANSACTIONS ──
-- Registra pagos individuales (soporta pagos parciales) para ambos módulos.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('receipt', 'service')),
  ref_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'zelle')),
  currency TEXT NOT NULL DEFAULT 'CUP',
  exchange_rate NUMERIC DEFAULT 1.0,
  amount_cup NUMERIC GENERATED ALWAYS AS (
    CASE WHEN currency = 'CUP' THEN amount ELSE amount * exchange_rate END
  ) STORED,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference TEXT,
  notes TEXT,
  paid_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_txn_store ON payment_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_ref ON payment_transactions(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_date ON payment_transactions(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_txn_method ON payment_transactions(payment_method, currency);

-- ── 4. Trigger para actualizar payment_status automáticamente ──
-- Cuando se inserta un pago, recalcula paid_amount y payment_status del documento.
CREATE OR REPLACE FUNCTION update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_type TEXT := NEW.ref_type;
  v_ref_id UUID := NEW.ref_id;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
BEGIN
  IF v_ref_type = 'receipt' THEN
    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'receipt' AND ref_id = v_ref_id
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'service' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'service' AND ref_id = v_ref_id
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_payment_status ON payment_transactions;
CREATE TRIGGER trg_update_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_payment_status();

-- ── 5. RPC: Registrar pago a proveedor ──
-- FIX-DEPLOY (2026-07-12): todos los params con default deben ir al final
CREATE OR REPLACE FUNCTION register_supplier_payment(
  p_store_id UUID,
  p_ref_type TEXT,
  p_ref_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_paid_by UUID,
  p_currency TEXT DEFAULT 'CUP',
  p_exchange_rate NUMERIC DEFAULT 1.0,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── 6. RPC: Reporte de caja para entrega de dinero ──
-- Genera el desglose de ingresos (ventas) y egresos (pagos a proveedores)
-- por método de pago y moneda, para un rango de fechas.
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
  v_totals JSON;
BEGIN
  -- Ventas por método y moneda (transacciones no anuladas)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT
      payment_method,
      sale_currency AS currency,
      COUNT(*) AS transaction_count,
      SUM(total_amount) AS total
    FROM transactions
    WHERE store_id = p_store_id
      AND created_at >= p_start_date
      AND created_at <= p_end_date
      AND status != 'voided'
    GROUP BY payment_method, sale_currency
    ORDER BY payment_method, currency
  ) t;

  -- Pagos a proveedores por método y moneda
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT
      payment_method,
      currency,
      ref_type,
      COUNT(*) AS payment_count,
      SUM(amount) AS total
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND payment_date >= p_start_date
      AND payment_date <= p_end_date
    GROUP BY payment_method, currency, ref_type
    ORDER BY payment_method, currency, ref_type
  ) t;

  -- Totales consolidados en CUP
  SELECT json_build_object(
    'sales_total_cup', COALESCE((
      SELECT SUM(total_amount) FROM transactions
      WHERE store_id = p_store_id
        AND created_at >= p_start_date
        AND created_at <= p_end_date
        AND status != 'voided'
    ), 0),
    'payments_total_cup', COALESCE((
      SELECT SUM(amount_cup) FROM payment_transactions
      WHERE store_id = p_store_id
        AND payment_date >= p_start_date
        AND payment_date <= p_end_date
    ), 0),
    'balance_cup', COALESCE((
      SELECT SUM(total_amount) FROM transactions
      WHERE store_id = p_store_id
        AND created_at >= p_start_date
        AND created_at <= p_end_date
        AND status != 'voided'
    ), 0) - COALESCE((
      SELECT SUM(amount_cup) FROM payment_transactions
      WHERE store_id = p_store_id
        AND payment_date >= p_start_date
        AND payment_date <= p_end_date
    ), 0)
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales,
    'payments', v_payments,
    'totals', v_totals,
    'start_date', p_start_date,
    'end_date', p_end_date
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ── 7. RPC: Set due_date automáticamente al crear recepción ──
-- Si no se especifica due_date, calcular como reception_date + payment_terms_days
CREATE OR REPLACE FUNCTION set_default_due_date_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.reception_date IS NOT NULL THEN
    NEW.due_date := (NEW.reception_date::date + COALESCE(NEW.payment_terms_days, 30))::date;
  ELSIF NEW.due_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.due_date := (NEW.created_at::date + COALESCE(NEW.payment_terms_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_due_date_receipt ON receipts;
CREATE TRIGGER trg_set_due_date_receipt
  BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_default_due_date_receipt();

-- ── 8. Mismo trigger para received_services ──
CREATE OR REPLACE FUNCTION set_default_due_date_service()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.service_date IS NOT NULL THEN
    NEW.due_date := (NEW.service_date::date + COALESCE(NEW.payment_terms_days, 30))::date;
  ELSIF NEW.due_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.due_date := (NEW.created_at::date + COALESCE(NEW.payment_terms_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_due_date_service ON received_services;
CREATE TRIGGER trg_set_due_date_service
  BEFORE INSERT ON received_services
  FOR EACH ROW EXECUTE FUNCTION set_default_due_date_service();

-- ── 9. Backfill: set due_date for existing records ──
UPDATE receipts
SET due_date = (COALESCE(reception_date, created_at)::date + 30)::date
WHERE due_date IS NULL;

UPDATE received_services
SET due_date = (COALESCE(service_date, created_at)::date + 30)::date
WHERE due_date IS NULL;

-- ── 10. Comment on tables ──
COMMENT ON TABLE payment_transactions IS 'Pagos a proveedores (recepciones + servicios). Soporta pagos parciales.';
COMMENT ON COLUMN payment_transactions.ref_type IS 'receipt = pago de recepción, service = pago de servicio recibido';
COMMENT ON COLUMN payment_transactions.ref_id IS 'FK a receipts.id o received_services.id según ref_type';
