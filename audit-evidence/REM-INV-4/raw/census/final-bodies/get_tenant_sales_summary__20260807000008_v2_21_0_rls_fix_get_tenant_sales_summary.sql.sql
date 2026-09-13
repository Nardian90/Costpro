-- DECLARED FINAL STATE (Git) de get_tenant_sales_summary
-- fuente: 20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql stmt#0

CREATE OR REPLACE FUNCTION public.get_tenant_sales_summary(
  p_tenant_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_result jsonb;
  v_uid uuid := auth.uid();
BEGIN
  -- FIX RLS-B5: Aceptar 3 casos:
  --   1. Admin global (is_admin() = true)
  --   2. Owner del tenant (owner_id = auth.uid())
  --   3. Service_role call (auth.uid() IS NULL — API route ya validó)
  IF v_uid IS NOT NULL
     AND NOT public.is_admin()
     AND NOT EXISTS(
       SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = v_uid
     ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'tenant_id', p_tenant_id,
    'days', p_days,
    'total_sales', COALESCE((
      SELECT SUM(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed'
        AND created_at >= now() - (p_days || ' days')::interval
    ), 0),
    'avg_daily', COALESCE((
      SELECT AVG(daily_total) FROM (
        SELECT SUM(total_amount) as daily_total
        FROM public.transactions
        WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
          AND status = 'completed'
          AND created_at >= now() - (p_days || ' days')::interval
        GROUP BY date_trunc('day', created_at)
      ) sub
    ), 0),
    'transaction_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed'
        AND created_at >= now() - (p_days || ' days')::interval
    ), 0),
    'avg_ticket', COALESCE((
      SELECT AVG(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed'
        AND created_at >= now() - (p_days || ' days')::interval
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$
