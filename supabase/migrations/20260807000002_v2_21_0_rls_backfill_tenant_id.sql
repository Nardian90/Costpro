-- ============================================================================
-- Migration: 20260807000002_v2_21_0_rls_backfill_tenant_id.sql
-- Iteración RLS Multi-Tenant — Fase A.2: Backfill de tenant_id en 159 rows
-- ============================================================================
-- Backfill tenant_id derivado de store_id → stores.tenant_id para todas las
-- tablas que tienen tenant_id IS NULL.
--
-- Para tablas con store_id NOT NULL: derivación directa.
-- Para audit_events (store_id nullable): fallback a user_id → profiles.tenant_id.
-- Para profiles (store_id nullable): fallback a active_store_id o memberships.
-- Para bulk_ops_log: fallback al tenant default.
--
-- Validación post-backfill: si quedan rows con tenant_id IS NULL, la migración
-- falla con exception (no se puede hacer NOT NULL constraint después).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Backfill para tablas con store_id (derivación directa)
UPDATE public.products p
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE p.store_id = s.id AND p.tenant_id IS NULL;

UPDATE public.transactions t
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE t.store_id = s.id AND t.tenant_id IS NULL;

UPDATE public.stock_movements sm
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE sm.store_id = s.id AND sm.tenant_id IS NULL;

UPDATE public.inventory i
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE i.store_id = s.id AND i.tenant_id IS NULL;

UPDATE public.commission_payments cp
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE cp.store_id = s.id AND cp.tenant_id IS NULL;

UPDATE public.commission_rules cr
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE cr.store_id = s.id AND cr.tenant_id IS NULL;

UPDATE public.receipts r
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE r.store_id = s.id AND r.tenant_id IS NULL;

UPDATE public.workers w
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE w.store_id = s.id AND w.tenant_id IS NULL;

UPDATE public.sales_transactions st
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE st.store_id = s.id AND st.tenant_id IS NULL;

UPDATE public.production_orders po
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE po.store_id = s.id AND po.tenant_id IS NULL;

UPDATE public.price_change_history pch
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE pch.store_id = s.id AND pch.tenant_id IS NULL;

-- 2. Para audit_events (store_id nullable): fallback a actor_id → profiles.tenant_id
UPDATE public.audit_events ae
SET tenant_id = COALESCE(
  (SELECT s.tenant_id FROM public.stores s WHERE s.id = ae.store_id),
  (SELECT p.tenant_id FROM public.profiles p WHERE p.id = ae.actor_id)
)
WHERE ae.tenant_id IS NULL;

-- 3. Para profiles (store_id nullable): fallback a active_store_id o memberships
--    Último recurso: tenant default 5364ccf8-e6cd-4c38-aea8-b167b3b5576f
UPDATE public.profiles p
SET tenant_id = COALESCE(
  (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.active_store_id),
  (SELECT s.tenant_id FROM public.stores s
   JOIN public.user_store_memberships m ON m.store_id = s.id
   WHERE m.user_id = p.id AND m.status = 'active' LIMIT 1),
  '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid
)
WHERE p.tenant_id IS NULL;

-- 4. Para bulk_ops_log (sin store_id): fallback al tenant default
UPDATE public.bulk_ops_log
SET tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid
WHERE tenant_id IS NULL;

-- 5. Para transfers (sin store_id pero con origin_store_id): derivar de origin
UPDATE public.transfers t
SET tenant_id = s.tenant_id
FROM public.stores s
WHERE t.origin_store_id = s.id AND t.tenant_id IS NULL;

-- 6. Para transfer_approval_rules: fallback al tenant default
UPDATE public.transfer_approval_rules
SET tenant_id = '5364ccf8-e6cd-4c38-aea8-b167b3b5576f'::uuid
WHERE tenant_id IS NULL;

-- 7. Validación post-backfill
DO $$
DECLARE
  v_total_nulls bigint;
BEGIN
  SELECT COALESCE(sum(null_count), 0) INTO v_total_nulls
  FROM public.v_rls_tenant_backfill_audit;

  IF v_total_nulls > 0 THEN
    RAISE EXCEPTION 'BACKFILL FAILED: % rows still have tenant_id IS NULL', v_total_nulls;
  END IF;

  RAISE NOTICE 'Backfill OK: 0 rows with tenant_id IS NULL';
END $$;

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- ADVERTENCIA: El DOWN es destructivo — pierde el backfill.
-- Las rows vuelven a su estado original (tenant_id = NULL).
-- Usar solo si algo falla y se necesita revertir completamente.
--
-- UPDATE public.products SET tenant_id = NULL WHERE tenant_id IS NOT NULL;
-- UPDATE public.transactions SET tenant_id = NULL WHERE tenant_id IS NOT NULL;
-- ... (idem para las demás tablas)
-- ============================================================================
