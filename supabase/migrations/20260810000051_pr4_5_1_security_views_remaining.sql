-- ============================================================================
-- PR-4.5.1 — Security fixes: security_invoker en 4 vistas restantes
-- ============================================================================
-- 4 hallazgos CRITICAL restantes del Supabase Security Advisor:
--   1. v_document_state_summary: SECURITY DEFINER (elude RLS de 6 tablas)
--   2. v_stock_available: SECURITY DEFINER (elude RLS de products + inventory_reservations)
--   3. v_rls_tenant_backfill_audit: SECURITY DEFINER (elude RLS de 13 tablas)
--   4. v_purchase_orders_cxp: SECURITY DEFINER (elude RLS de purchase_orders + receipts)
--
-- Causa raíz (igual que PR-4.5):
--   En Postgres 15+ (Supabase usa PG17), las vistas por defecto se ejecutan
--   como el owner (SECURITY DEFINER implícito), eludiendo el RLS de las
--   tablas subyacentes. Esto permite que cualquier authenticated lea datos
--   de TODAS las tiendas.
--
-- Fix:
--   ALTER VIEW ... SET (security_invoker=true) para que la vista se ejecute
--   con los privilegios del caller, respetando el RLS de las tablas subyacentes.
--
-- Tablas subyacentes (todas tienen RLS habilitada):
--   v_document_state_summary: transactions, receipts, transfers, devolutions,
--     inventory_adjustments, production_orders
--   v_stock_available: products, inventory_reservations
--   v_rls_tenant_backfill_audit: products, transactions, stock_movements,
--     inventory, profiles, commission_payments, commission_rules, receipts,
--     workers, sales_transactions, production_orders, audit_events,
--     price_change_history
--   v_purchase_orders_cxp: purchase_orders, receipts
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: v_document_state_summary — security_invoker=true
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: la vista se ejecutaba como owner (postgres), eludiendo RLS de
--        transactions, receipts, transfers, devolutions, inventory_adjustments,
--        production_orders. Cualquier authenticated podía ver conteos de
--        documentos de TODAS las tiendas.
-- DESPUÉS: la vista se ejecuta como el caller, respetando RLS de las tablas.

ALTER VIEW public.v_document_state_summary SET (security_invoker = true);

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 2: v_stock_available — security_invoker=true
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: la vista se ejecutaba como owner (postgres), eludiendo RLS de
--        products e inventory_reservations. Cualquier authenticated podía
--        ver stock disponible de TODAS las tiendas.
-- DESPUÉS: la vista se ejecuta como el caller, respetando RLS.

ALTER VIEW public.v_stock_available SET (security_invoker = true);

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 3: v_rls_tenant_backfill_audit — security_invoker=true
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: la vista se ejecutaba como owner (postgres), eludiendo RLS de
--        13 tablas. Cualquier authenticated podía ver conteos de filas
--        con tenant_id NULL de TODAS las tiendas.
-- DESPUÉS: la vista se ejecuta como el caller, respetando RLS.
--
-- Nota: esta vista es de auditoría interna (v2.21.0 RLS backfill).
-- Con security_invoker=true, los conteos se filtran por RLS, lo que es
-- correcto para auditoría operacional. Para auditoría global (admin),
-- se debe usar service_role que bypassa RLS.

ALTER VIEW public.v_rls_tenant_backfill_audit SET (security_invoker = true);

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 4: v_purchase_orders_cxp — security_invoker=true
-- ════════════════════════════════════════════════════════════════════════════
-- ANTES: la vista se ejecutaba como owner (postgres), eludiendo RLS de
--        purchase_orders y receipts. Cualquier authenticated podía ver
--        cuentas por pagar de TODAS las tiendas.
-- DESPUÉS: la vista se ejecuta como el caller, respetando RLS.

ALTER VIEW public.v_purchase_orders_cxp SET (security_invoker = true);
