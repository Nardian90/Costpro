-- ============================================================================
-- H0-R IMPLEMENTATION — FASE H3 · AUTORIDAD FISCAL: tax_configurations (§5.2)
-- ============================================================================
-- Contrato: CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md §5.2/§5.3 + §17.3.
--
--   · CHECK (value > 0): el impuesto negativo queda estructuralmente
--     imposible de introducir (T-TC-003). Tope superior: NOT SPECIFIED
--     (D-TAX-01 APPROVED) — ningún tope numérico se inventa.
--   · SELECT: filas globales (store_id IS NULL) legibles por cualquier
--     authenticated (el POS las lee para toda tienda — contrato de lectura
--     de useTaxes); filas por tienda legibles por miembros activos de esa
--     tienda (has_store_access).
--   · INSERT/UPDATE/DELETE: filas globales → solo admin global (is_admin);
--     filas por tienda → has_store_role_as(admin/manager/encargado en ESA
--     tienda) o admin global (patrón SEC-TS-02 / canManageStore).
--   · anon: DENY total (deny-by-default, sin policies para anon).
--   · service_role: bypass (RLS no aplica).
--
-- La policy única LIVE "Tax unified" (ALL para authenticated vía
-- has_store_access) permitía a un clerk crear impuestos arbitrarios (T-TC-002)
-- y dejaba ilegibles las filas globales (has_store_access falla con NULL).
-- Reemplazo completo por policies separadas por operación y rol.
--
-- La tabla NO se siembra: qué impuestos existen es decisión del dueño/operación
-- (§5.6 — el flujo normal V2 envía applied_taxes: [] y no se ve afectado).
-- ============================================================================

-- 1) Restricción DDL exigida (§5.2): valor estrictamente positivo
ALTER TABLE public.tax_configurations
  DROP CONSTRAINT IF EXISTS tax_configurations_value_positive;
ALTER TABLE public.tax_configurations
  ADD CONSTRAINT tax_configurations_value_positive CHECK (value > 0);

-- 2) Policies por operación y rol (reemplazan "Tax unified")
DROP POLICY IF EXISTS "Tax unified" ON public.tax_configurations;

-- 2a) SELECT — catálogo legible: globales para cualquier authenticated;
--     por tienda para miembros activos de esa tienda
DROP POLICY IF EXISTS tax_configurations_select ON public.tax_configurations;
CREATE POLICY tax_configurations_select ON public.tax_configurations
  FOR SELECT TO authenticated
  USING (
    store_id IS NULL
    OR public.has_store_access(store_id)
  );

-- 2b) INSERT — global: solo admin global; por tienda: rol canManageStore
--     (admin/manager/encargado EN ESA tienda) o admin global
DROP POLICY IF EXISTS tax_configurations_insert ON public.tax_configurations;
CREATE POLICY tax_configurations_insert ON public.tax_configurations
  FOR INSERT TO authenticated
  WITH CHECK (
    (store_id IS NULL AND public.is_admin())
    OR (
      store_id IS NOT NULL
      AND (
        public.is_admin()
        OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
      )
    )
  );

-- 2c) UPDATE — misma matriz que INSERT (USING filas existentes + WITH CHECK nuevas)
DROP POLICY IF EXISTS tax_configurations_update ON public.tax_configurations;
CREATE POLICY tax_configurations_update ON public.tax_configurations
  FOR UPDATE TO authenticated
  USING (
    (store_id IS NULL AND public.is_admin())
    OR (
      store_id IS NOT NULL
      AND (
        public.is_admin()
        OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
      )
    )
  )
  WITH CHECK (
    (store_id IS NULL AND public.is_admin())
    OR (
      store_id IS NOT NULL
      AND (
        public.is_admin()
        OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
      )
    )
  );

-- 2d) DELETE — misma matriz
DROP POLICY IF EXISTS tax_configurations_delete ON public.tax_configurations;
CREATE POLICY tax_configurations_delete ON public.tax_configurations
  FOR DELETE TO authenticated
  USING (
    (store_id IS NULL AND public.is_admin())
    OR (
      store_id IS NOT NULL
      AND (
        public.is_admin()
        OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
      )
    )
  );

-- Nota de estabilidad frente a replay: la migración original
-- 20260228_implement_taxes.sql crea "Tax unified"; esta migración corre
-- después en la cadena y la reemplaza — replay(limpio) == LIVE.
