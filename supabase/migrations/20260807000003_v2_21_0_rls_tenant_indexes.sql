-- ============================================================================
-- Migration: 20260807000003_v2_21_0_rls_tenant_indexes.sql
-- Iteración RLS Multi-Tenant — Fase A.3: Índices en tenant_id
-- ============================================================================
-- Crea índices B-tree en tenant_id para las 14 tablas que no lo tienen.
-- price_change_history y transfer_approval_rules ya tienen índice.
-- Necesario para performance de policies RLS que filtran por tenant_id.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_tenant_id
  ON public.products (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_tenant_id
  ON public.transactions (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_id
  ON public.stock_movements (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_tenant_id
  ON public.inventory (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id
  ON public.profiles (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_payments_tenant_id
  ON public.commission_payments (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_rules_tenant_id
  ON public.commission_rules (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_tenant_id
  ON public.receipts (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workers_tenant_id
  ON public.workers (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_transactions_tenant_id
  ON public.sales_transactions (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_orders_tenant_id
  ON public.production_orders (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id
  ON public.audit_events (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stores_tenant_id
  ON public.stores (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_tenant_id
  ON public.transfers (tenant_id) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bulk_ops_log_tenant_id
  ON public.bulk_ops_log (tenant_id) WHERE tenant_id IS NOT NULL;

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_products_tenant_id;
-- DROP INDEX IF EXISTS public.idx_transactions_tenant_id;
-- DROP INDEX IF EXISTS public.idx_stock_movements_tenant_id;
-- DROP INDEX IF EXISTS public.idx_inventory_tenant_id;
-- DROP INDEX IF EXISTS public.idx_profiles_tenant_id;
-- DROP INDEX IF EXISTS public.idx_commission_payments_tenant_id;
-- DROP INDEX IF EXISTS public.idx_commission_rules_tenant_id;
-- DROP INDEX IF EXISTS public.idx_receipts_tenant_id;
-- DROP INDEX IF EXISTS public.idx_workers_tenant_id;
-- DROP INDEX IF EXISTS public.idx_sales_transactions_tenant_id;
-- DROP INDEX IF EXISTS public.idx_production_orders_tenant_id;
-- DROP INDEX IF EXISTS public.idx_audit_events_tenant_id;
-- DROP INDEX IF EXISTS public.idx_stores_tenant_id;
-- DROP INDEX IF EXISTS public.idx_transfers_tenant_id;
-- DROP INDEX IF EXISTS public.idx_bulk_ops_log_tenant_id;
-- ============================================================================
