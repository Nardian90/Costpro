-- DECLARED FINAL STATE (Git) de get_tenant_cash_report
-- fuente: 20260806000008_v2_15_8_tenant_reports.sql stmt#1

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
$function$
