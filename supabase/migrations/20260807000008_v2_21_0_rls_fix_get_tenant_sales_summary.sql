-- ============================================================================
-- Migration: 20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql
-- Iteración RLS Multi-Tenant — Fase C.1: Fix RLS-B5
-- ============================================================================
-- BUG RLS-B5: get_tenant_sales_summary requiere owner_id = auth.uid() para
-- non-admin. Pero cuando se llama vía service_role (API routes usan admin
-- client), auth.uid() retorna NULL → is_admin() = false → ERR_UNAUTHORIZED.
--
-- FIX: Aceptar el caso donde auth.uid() IS NULL (service_role call desde API).
-- La API ya valida autorización antes de llamar el RPC (con profile.tenant_id).
--
-- NO se modifica la lógica de negocio (cálculos de sales) — solo el check de auth.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

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
$$;

COMMENT ON FUNCTION public.get_tenant_sales_summary(uuid, integer) IS
  'Iteración RLS (v2.21.0) Fix B5: Acepta service_role calls (auth.uid() IS NULL) para que API routes funcionen. Admin global y owner del tenant siguen funcionando.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Restaurar la versión original (requiere backup del source original):
-- CREATE OR REPLACE FUNCTION public.get_tenant_sales_summary(...) AS $$
--   ... (source original sin el fix de v_uid IS NULL)
-- $$;
-- ============================================================================
