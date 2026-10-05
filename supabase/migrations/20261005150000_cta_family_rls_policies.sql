-- ============================================================================
-- FINALIZE-V2 — FIX DEFECT-2: políticas RLS para la familia
-- costpro_transaction_adjuster (completar el contrato pr4_4I en la era RLS)
-- ============================================================================
-- Defecto demostrado empíricamente en LIVE (tras el fix 42501):
--
--   SET ROLE costpro_transaction_adjuster;
--   SELECT count(*) FROM public.transactions;   → 0 filas
--   update_transaction_taxes(<txn real>, ...)   → ERR_TRANSACTION_NOT_FOUND
--
-- Causa raíz: pr4_4I (2026-08-12) diseñó la clase de privilegio
-- costpro_transaction_adjuster con GRANTs de tabla explícitos
-- (SELECT/UPDATE transactions, SELECT payment_transactions, INSERT
-- audit_logs). El endurecimiento RLS posterior (w9_f01, 2026-09-02) activó
-- RLS en esas tablas con políticas SOLO para `authenticated` — un rol
-- NOLOGIN/NOINHERIT como cta queda fuera de toda política → denegación por
-- defecto → 0 filas visibles. Los GRANTs de pr4_4I quedaron huérfanos:
-- el privilegio de tabla existe pero RLS lo anula.
--
-- Resultado: update_transaction_taxes /3 (H0-R, con caller activo en
-- TransactionDetailsModal) y adjust_total_amount (pr4_4I) retornaban
-- ERR_TRANSACTION_NOT_FOUND/PT016 sobre transacciones EXISTENTES — la
-- corrección tributaria y el ajuste de total de supervisor rotos en LIVE.
--
-- Fix (mínimo, explícito, auditable — extensión del diseño pr4_4I a la era
-- RLS): políticas dedicadas TO costpro_transaction_adjuster en EXACTAMENTE
-- las 4 tablas de su contrato, con el acceso ya declarado por pr4_4I:
--
--   transactions       → SELECT (lock + lectura) y UPDATE (mutación auditada)
--   payment_transactions → SELECT (invariante PT002)
--   audit_logs         → INSERT (auditoría)
--   tax_configurations → SELECT (reconstrucción fiscal server-side UTT /3)
--
-- El rol es NOLOGIN NOINHERIT: solo es alcanzable como owner de las dos
-- funciones SECURITY DEFINER auditadas (UTT /3 y adjust_total_amount) —
-- la superficie de exposición no crece: es exactamente la clase de
-- privilegio PT008 que el trigger trg_protect_transactions_total_amount
-- exige para mutar total_amount.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE (patrón del repo).
-- ============================================================================

-- transactions: SELECT (FOR UPDATE) + UPDATE para la familia adjust_*
DROP POLICY IF EXISTS cta_family_transactions_select ON public.transactions;
CREATE POLICY cta_family_transactions_select ON public.transactions
  FOR SELECT TO costpro_transaction_adjuster
  USING (true);

DROP POLICY IF EXISTS cta_family_transactions_update ON public.transactions;
CREATE POLICY cta_family_transactions_update ON public.transactions
  FOR UPDATE TO costpro_transaction_adjuster
  USING (true)
  WITH CHECK (true);

-- payment_transactions: SELECT (invariante PT002)
DROP POLICY IF EXISTS cta_family_payment_transactions_select ON public.payment_transactions;
CREATE POLICY cta_family_payment_transactions_select ON public.payment_transactions
  FOR SELECT TO costpro_transaction_adjuster
  USING (true);

-- audit_logs: INSERT (auditoría de los ajustes)
DROP POLICY IF EXISTS cta_family_audit_logs_insert ON public.audit_logs;
CREATE POLICY cta_family_audit_logs_insert ON public.audit_logs
  FOR INSERT TO costpro_transaction_adjuster
  WITH CHECK (true);

-- tax_configurations: SELECT (catálogo fiscal — reconstrucción UTT /3)
DROP POLICY IF EXISTS cta_family_tax_configurations_select ON public.tax_configurations;
CREATE POLICY cta_family_tax_configurations_select ON public.tax_configurations
  FOR SELECT TO costpro_transaction_adjuster
  USING (true);

-- Recarga del schema cache de PostgREST (canal estándar Supabase)
NOTIFY pgrst, 'reload schema';
