-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-15): Reporte de Caja — separar correctamente Pagos a Proveedores
-- de Órdenes de Producción/Servicios (cuentas por cobrar)
-- ════════════════════════════════════════════════════════════════════
-- Problema: el RPC get_cash_report mezclaba en v_payments todos los ref_types:
--   receipt, service, production_order, work
-- Pero el usuario solo quiere ver en "Pagos a Proveedores":
--   - receipt (pago por recepción de mercancía)
--   - service (pago por servicio recibido)
-- Y los ref_type 'production_order' y 'work' deben ir en sección aparte
-- "Órdenes de Producción/Servicios" porque son INGRESOS del cliente
-- (anticipos cobrados + pagos recibidos por órdenes de servicio del día).
--
-- Esta migración reescribe el RPC para:
--   1. v_payments: SOLO ref_type IN ('receipt', 'service')
--   2. v_production: AMPLIADO para ref_type IN ('production_order', 'work')
--      (incluye anticipos + pagos parciales/totales de órdenes de servicio)
--   3. v_totals.balance_cup: ya calculaba v_sales + v_production - v_payments - v_commissions
--      (correcto: production_orders son ingresos, se suman; payments son egresos, se restan)
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

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

  -- FIX (2026-07-15): Pagos a Proveedores — SOLO receipt y service
  -- (NO production_order/work porque son cuentas por cobrar, van en sección aparte)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id AND payment_date >= p_start_date AND payment_date <= p_end_date
      AND ref_type IN ('receipt', 'service')
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

  -- FIX (2026-07-15): Órdenes de Producción/Servicios — AMPLIADO para incluir
  -- production_order (anticipos + cierres de producción) Y work (anticipos + pagos
  -- de órdenes de servicio/trabajo del día). Ambos son INGRESOS del cliente.
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_production
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('production_order', 'work')
      AND payment_date >= p_start_date AND payment_date <= p_end_date
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Totales
  SELECT COALESCE(SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END), 0)
  INTO v_sales_total_cup FROM transactions
  WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided';

  -- Pagos a proveedores (solo receipt + service)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions WHERE store_id = p_store_id AND payment_date >= p_start_date AND payment_date <= p_end_date
  AND ref_type IN ('receipt', 'service');

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments WHERE store_id = p_store_id AND status = 'paid'
  AND paid_at >= p_start_date AND paid_at <= p_end_date;

  -- Órdenes de producción/servicios (production_order + work) — son INGRESOS
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_production_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('production_order', 'work')
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

GRANT EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- Verificación
SELECT 'rpc_cash_report_fixed' AS status,
       (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'get_cash_report' AND n.nspname = 'public') AS function_count;
