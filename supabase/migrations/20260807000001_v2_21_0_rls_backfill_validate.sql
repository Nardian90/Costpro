-- ============================================================================
-- Migration: 20260807000001_v2_21_0_rls_backfill_validate.sql
-- Iteración RLS Multi-Tenant — Fase A.1: Vista de validación previa al backfill
-- ============================================================================
-- Crea una vista de solo lectura que cuenta rows con tenant_id IS NULL en
-- cada tabla crítica. Permite verificar el estado antes/después del backfill.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_rls_tenant_backfill_audit AS
SELECT 'products' AS table_name, count(*) AS null_count
  FROM public.products WHERE tenant_id IS NULL
UNION ALL
SELECT 'transactions', count(*) FROM public.transactions WHERE tenant_id IS NULL
UNION ALL
SELECT 'stock_movements', count(*) FROM public.stock_movements WHERE tenant_id IS NULL
UNION ALL
SELECT 'inventory', count(*) FROM public.inventory WHERE tenant_id IS NULL
UNION ALL
SELECT 'profiles', count(*) FROM public.profiles WHERE tenant_id IS NULL
UNION ALL
SELECT 'commission_payments', count(*) FROM public.commission_payments WHERE tenant_id IS NULL
UNION ALL
SELECT 'commission_rules', count(*) FROM public.commission_rules WHERE tenant_id IS NULL
UNION ALL
SELECT 'receipts', count(*) FROM public.receipts WHERE tenant_id IS NULL
UNION ALL
SELECT 'workers', count(*) FROM public.workers WHERE tenant_id IS NULL
UNION ALL
SELECT 'sales_transactions', count(*) FROM public.sales_transactions WHERE tenant_id IS NULL
UNION ALL
SELECT 'production_orders', count(*) FROM public.production_orders WHERE tenant_id IS NULL
UNION ALL
SELECT 'audit_events', count(*) FROM public.audit_events WHERE tenant_id IS NULL
UNION ALL
SELECT 'price_change_history', count(*) FROM public.price_change_history WHERE tenant_id IS NULL;

COMMENT ON VIEW public.v_rls_tenant_backfill_audit IS
  'Iteración RLS (v2.21.0): Audit view counting rows with tenant_id IS NULL per critical table. Use before/after backfill to validate.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.v_rls_tenant_backfill_audit;
-- ============================================================================
