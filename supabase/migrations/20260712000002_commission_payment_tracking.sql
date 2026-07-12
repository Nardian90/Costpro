-- ============================================================================
-- Commission Payment Tracking — CostPro
-- Creado: 2026-07-12
-- Descripción: Añade tracking de método de pago y moneda a commission_payments
-- para que los pagos de comisiones a trabajadores se reflejen en el reporte de caja.
-- ============================================================================

-- ── 1. Añadir campos de pago a COMMISSION_PAYMENTS ──
ALTER TABLE commission_payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'zelle')),
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'CUP',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS amount_cup NUMERIC DEFAULT 0;

-- ── 2. Calcular amount_cup automáticamente ──
-- Cuando se marca como 'paid', calcular amount_cup = final_amount * exchange_rate
CREATE OR REPLACE FUNCTION calculate_commission_amount_cup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.amount_cup = 0 THEN
    IF NEW.currency = 'CUP' THEN
      NEW.amount_cup := NEW.final_amount;
    ELSE
      NEW.amount_cup := NEW.final_amount * COALESCE(NEW.exchange_rate, 1.0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_commission_cup ON commission_payments;
CREATE TRIGGER trg_calc_commission_cup
  BEFORE INSERT OR UPDATE ON commission_payments
  FOR EACH ROW EXECUTE FUNCTION calculate_commission_amount_cup();

-- ── 3. Actualizar RPC get_cash_report para incluir comisiones ──
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
  v_totals JSON;
BEGIN
  -- Ventas por método y moneda
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

  -- FIX-COMMISSION (2026-07-12): Comisiones pagadas a trabajadores
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT
      payment_method,
      currency,
      COUNT(*) AS commission_count,
      SUM(final_amount) AS total
    FROM commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND paid_at >= p_start_date
      AND paid_at <= p_end_date
      AND payment_method IS NOT NULL
    GROUP BY payment_method, currency
    ORDER BY payment_method, currency
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
    'commissions_total_cup', COALESCE((
      SELECT SUM(amount_cup) FROM commission_payments
      WHERE store_id = p_store_id
        AND status = 'paid'
        AND paid_at >= p_start_date
        AND paid_at <= p_end_date
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
    ), 0) - COALESCE((
      SELECT SUM(amount_cup) FROM commission_payments
      WHERE store_id = p_store_id
        AND status = 'paid'
        AND paid_at >= p_start_date
        AND paid_at <= p_end_date
    ), 0)
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales,
    'payments', v_payments,
    'commissions', v_commissions,
    'totals', v_totals,
    'start_date', p_start_date,
    'end_date', p_end_date
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN commission_payments.payment_method IS 'Método de pago: cash, transfer, zelle (null si no pagado)';
COMMENT ON COLUMN commission_payments.currency IS 'Moneda del pago: CUP, USD, EUR, MLC';
COMMENT ON COLUMN commission_payments.amount_cup IS 'Monto en CUP (calculado: final_amount * exchange_rate)';
