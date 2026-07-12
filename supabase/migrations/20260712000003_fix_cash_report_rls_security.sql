-- ============================================================================
-- FIX-B3 (2026-07-12): Corregir get_cash_report para convertir ventas a CUP
-- y FIX-B5: Habilitar RLS en payment_transactions
-- y FIX-B8: Trigger siempre recalcula amount_cup
-- ============================================================================

-- ── FIX-B3: Reescribir get_cash_report con conversión correcta a CUP ──
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
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
BEGIN
  -- Ventas por método y moneda (con conversión a CUP)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT
      payment_method,
      sale_currency AS currency,
      COUNT(*) AS transaction_count,
      SUM(total_amount) AS total,
      -- FIX-B3: convertir a CUP usando sale_exchange_rate
      SUM(
        CASE WHEN sale_currency = 'CUP' THEN total_amount
             ELSE total_amount * COALESCE(sale_exchange_rate, 1)
        END
      ) AS total_cup
    FROM transactions
    WHERE store_id = p_store_id
      AND created_at >= p_start_date
      AND created_at <= p_end_date
      AND status != 'voided'
    GROUP BY payment_method, sale_currency
    ORDER BY payment_method, sale_currency
  ) t;

  -- Pagos a proveedores por método y moneda
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT
      payment_method,
      currency,
      ref_type,
      COUNT(*) AS payment_count,
      SUM(amount) AS total,
      SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND payment_date >= p_start_date
      AND payment_date <= p_end_date
    GROUP BY payment_method, currency, ref_type
    ORDER BY payment_method, currency, ref_type
  ) t;

  -- Comisiones pagadas
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT
      payment_method,
      currency,
      COUNT(*) AS commission_count,
      SUM(final_amount) AS total,
      SUM(amount_cup) AS total_cup
    FROM commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND paid_at >= p_start_date
      AND paid_at <= p_end_date
      AND payment_method IS NOT NULL
    GROUP BY payment_method, currency
    ORDER BY payment_method, currency
  ) t;

  -- Totales en CUP (FIX-B3: usar conversión correcta)
  SELECT COALESCE(SUM(
    CASE WHEN sale_currency = 'CUP' THEN total_amount
         ELSE total_amount * COALESCE(sale_exchange_rate, 1)
    END
  ), 0) INTO v_sales_total_cup
  FROM transactions
  WHERE store_id = p_store_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date
    AND status != 'voided';

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions
  WHERE store_id = p_store_id
    AND payment_date >= p_start_date
    AND payment_date <= p_end_date;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments
  WHERE store_id = p_store_id
    AND status = 'paid'
    AND paid_at >= p_start_date
    AND paid_at <= p_end_date;

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'balance_cup', v_sales_total_cup - v_payments_total_cup - v_commissions_total_cup
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

-- ── FIX-B5: Habilitar RLS en payment_transactions ──
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: usuarios solo pueden ver pagos de su store_id
CREATE POLICY "payment_transactions_select_own_store" ON payment_transactions
  FOR SELECT USING (
    store_id IN (
      SELECT active_store_id FROM profiles WHERE id = auth.uid()
    ) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policy: usuarios solo pueden insertar pagos de su store_id
CREATE POLICY "payment_transactions_insert_own_store" ON payment_transactions
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT active_store_id FROM profiles WHERE id = auth.uid()
    ) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Policy: usuarios solo pueden eliminar pagos de su store_id
CREATE POLICY "payment_transactions_delete_own_store" ON payment_transactions
  FOR DELETE USING (
    store_id IN (
      SELECT active_store_id FROM profiles WHERE id = auth.uid()
    ) OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── FIX-B7: Validar que ref_id pertenece a store_id en register_supplier_payment ──
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
  v_doc_store_id UUID;
BEGIN
  -- FIX-B7: validar que el documento pertenece a la store_id
  IF p_ref_type = 'receipt' THEN
    SELECT store_id INTO v_doc_store_id FROM receipts WHERE id = p_ref_id;
    IF v_doc_store_id IS NULL OR v_doc_store_id != p_store_id THEN
      RAISE EXCEPTION 'Documento no encontrado o no pertenece a esta tienda';
    END IF;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id INTO v_doc_store_id FROM received_services WHERE id = p_ref_id;
    IF v_doc_store_id IS NULL OR v_doc_store_id != p_store_id THEN
      RAISE EXCEPTION 'Documento no encontrado o no pertenece a esta tienda';
    END IF;
  END IF;

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

-- ── FIX-B8: Trigger siempre recalcula amount_cup (no solo cuando es 0) ──
CREATE OR REPLACE FUNCTION calculate_commission_amount_cup()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    IF NEW.currency = 'CUP' THEN
      NEW.amount_cup := NEW.final_amount;
    ELSE
      NEW.amount_cup := NEW.final_amount * COALESCE(NEW.exchange_rate, 1.0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
