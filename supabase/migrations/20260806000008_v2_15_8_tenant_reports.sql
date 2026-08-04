-- ============================================================================
-- Migration: 20260806000008_v2_15_8_tenant_reports.sql
-- Iteración 13 — Consolidated tenant reports
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- get_tenant_cash_report: aggregates cash report across all stores in tenant
DROP FUNCTION IF EXISTS public.get_tenant_cash_report;

CREATE OR REPLACE FUNCTION public.get_tenant_cash_report(
  p_tenant_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_start timestamptz := COALESCE(p_start_date, date_trunc('day', now()) - interval '30 days');
  v_end timestamptz := COALESCE(p_end_date, now());
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS(
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only tenant owner or admin can view tenant reports';
  END IF;

  SELECT jsonb_build_object(
    'tenant_id', p_tenant_id,
    'start_date', v_start,
    'end_date', v_end,
    'stores_count', (SELECT COUNT(*) FROM public.stores WHERE tenant_id = p_tenant_id AND is_active = true),
    'total_sales', COALESCE((
      SELECT SUM(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_cash', COALESCE((
      SELECT SUM(cash_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_transfer', COALESCE((
      SELECT SUM(transfer_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_zelle', COALESCE((
      SELECT SUM(zelle_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'transaction_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'voided_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'voided' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'by_store', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'store_id', s.id, 'store_name', s.name,
        'sales', COALESCE(t.total, 0), 'count', COALESCE(t.cnt, 0)
      ))
      FROM public.stores s
      LEFT JOIN (
        SELECT store_id, SUM(total_amount) as total, COUNT(*) as cnt
        FROM public.transactions
        WHERE status = 'completed' AND created_at BETWEEN v_start AND v_end
        GROUP BY store_id
      ) t ON t.store_id = s.id
      WHERE s.tenant_id = p_tenant_id AND s.is_active = true
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_cash_report FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_cash_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_cash_report TO service_role;

-- get_tenant_sales_summary: quick sales summary across tenant
DROP FUNCTION IF EXISTS public.get_tenant_sales_summary;

CREATE OR REPLACE FUNCTION public.get_tenant_sales_summary(
  p_tenant_id uuid,
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS(
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = auth.uid()
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_sales_summary FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_sales_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_sales_summary TO service_role;

COMMENT ON FUNCTION public.get_tenant_cash_report IS
  'Iteración 13: Consolidated cash report across all stores in tenant. Tenant owner or admin only.';
COMMENT ON FUNCTION public.get_tenant_sales_summary IS
  'Iteración 13: Sales summary for last N days across tenant.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_tenant_cash_report;
-- DROP FUNCTION IF EXISTS public.get_tenant_sales_summary;
-- ============================================================================
