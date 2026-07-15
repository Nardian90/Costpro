-- ════════════════════════════════════════════════════════════════════
-- FIX RPC get_worker_commission_summary: eliminar prefijo o_ de columnas
-- ════════════════════════════════════════════════════════════════════
-- Problema: el RPC actual en producción devuelve columnas con prefijo o_
-- (o_worker_id, o_first_name, ...) en lugar de los nombres esperados
-- (worker_id, first_name, ...). Esto rompía el frontend que esperaba
-- los campos sin prefijo.
--
-- La migración original (20260626000002) ya definía RETURNS TABLE con
-- los nombres sin prefijo, pero en algún momento la función fue
-- reemplazada por una versión con OUT parameters con prefijo o_.
-- Esta migración restaura la definición correcta.
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_worker_commission_summary(UUID, DATE, DATE);

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
    (SELECT cp.period_end FROM public.commission_payments cp
      WHERE cp.worker_id = w.id AND cp.status != 'cancelled'
      ORDER BY cp.period_end DESC LIMIT 1) AS last_payment_date,
    (SELECT cp.final_amount FROM public.commission_payments cp
      WHERE cp.worker_id = w.id AND cp.status != 'cancelled'
      ORDER BY cp.period_end DESC LIMIT 1) AS last_payment_amount,
    (SELECT cr.id FROM public.commission_rules cr
      WHERE cr.store_id = p_store_id
        AND (cr.worker_id = w.id OR cr.worker_id IS NULL)
        AND cr.valid_from <= v_date_to
        AND (cr.valid_to IS NULL OR cr.valid_to >= v_date_from)
      ORDER BY cr.priority DESC, cr.worker_id NULLS LAST, cr.valid_from DESC
      LIMIT 1) AS active_rule_id,
    (SELECT cr.type FROM public.commission_rules cr
      WHERE cr.store_id = p_store_id
        AND (cr.worker_id = w.id OR cr.worker_id IS NULL)
        AND cr.valid_from <= v_date_to
        AND (cr.valid_to IS NULL OR cr.valid_to >= v_date_from)
      ORDER BY cr.priority DESC, cr.worker_id NULLS LAST, cr.valid_from DESC
      LIMIT 1) AS active_rule_type,
    (SELECT COALESCE(cr.value_percent, cr.fixed_value, cr.salary_amount)
      FROM public.commission_rules cr
      WHERE cr.store_id = p_store_id
        AND (cr.worker_id = w.id OR cr.worker_id IS NULL)
        AND cr.valid_from <= v_date_to
        AND (cr.valid_to IS NULL OR cr.valid_to >= v_date_from)
      ORDER BY cr.priority DESC, cr.worker_id NULLS LAST, cr.valid_from DESC
      LIMIT 1) AS active_rule_value
  FROM public.workers w
  LEFT JOIN public.sales_transactions st
    ON st.worker_id = w.id AND st.sale_date BETWEEN v_date_from AND v_date_to
  WHERE w.store_id = p_store_id
  GROUP BY w.id, w.first_name, w.last_name, w.ci, w.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_worker_commission_summary(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_worker_commission_summary(UUID, DATE, DATE) TO service_role;

-- ════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ════════════════════════════════════════════════════════════════════
SELECT 'rpc_fixed' AS status,
       (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'get_worker_commission_summary'
          AND n.nspname = 'public') AS function_count;
