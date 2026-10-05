-- ============================================================================
-- H0-R IMPLEMENTATION — FASE H4 · FUENTE DE TASA POR TIENDA: store_exchange_rates
-- ============================================================================
-- Contrato: CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md §6.4 + §17.3.
--
--   · CHECK (rate > 0): precedente exchange_rates.rate CHECK (rate > 0) y
--     regla F-21 (tasa no-CUP > 1.5 en recepciones).
--   · Escritura (INSERT/UPDATE/DELETE): alineada al gate canManageStore
--     (patrón SEC-TS-02 — /api/store-rates): membresía activa con rol
--     admin/manager/encargado EN ESA tienda, o admin global. Hoy la policy
--     "Users can manage own store rates" (ALL, USING profiles.store_id match)
--     permite a CUALQUIER miembro (incl. clerk) reescribir la tasa de confianza
--     de su tienda (T-ER-001/T-ER-002/T-H5-004) — una sola semántica de
--     autorización, sin superficies paralelas divergentes.
--   · UPDATE: USING visible + WITH CHECK canManageStore — una escritura no
--     autorizada produce 42501/403 (rechazo explícito), no un 204 silencioso
--     de 0 filas.
--   · SELECT: admin global o miembro activo de la tienda (has_store_access).
--   · anon: DENY total (sin policies para anon — deny-by-default).
--   · service_role: bypass (la ruta /api/store-rates escribe como admin con
--     su propio gate canManageStore en la capa de ruta).
-- ============================================================================

-- 1) Restricción DDL exigida (§5.2/§6.4): tasa estrictamente positiva
ALTER TABLE public.store_exchange_rates
  DROP CONSTRAINT IF EXISTS store_rates_positive;
ALTER TABLE public.store_exchange_rates
  ADD CONSTRAINT store_rates_positive CHECK (rate > 0);

-- 2) Reemplazo completo de policies (semántica canManageStore única)
DROP POLICY IF EXISTS "Users can manage own store rates" ON public.store_exchange_rates;
DROP POLICY IF EXISTS "Users can view own store rates" ON public.store_exchange_rates;

-- 2a) SELECT — admin global o miembro activo de la tienda
DROP POLICY IF EXISTS store_rates_view ON public.store_exchange_rates;
CREATE POLICY store_rates_view ON public.store_exchange_rates
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_store_access(store_id)
  );

-- 2b) INSERT — canManageStore
DROP POLICY IF EXISTS store_rates_insert ON public.store_exchange_rates;
CREATE POLICY store_rates_insert ON public.store_exchange_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
  );

-- 2c) UPDATE — filas targeteables, pero toda modificación exige canManageStore
--     (WITH CHECK evalúa la fila NUEVA: un clerk recibe 42501 → HTTP 403)
DROP POLICY IF EXISTS store_rates_update ON public.store_exchange_rates;
CREATE POLICY store_rates_update ON public.store_exchange_rates
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    public.is_admin()
    OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
  );

-- 2d) DELETE — canManageStore
DROP POLICY IF EXISTS store_rates_delete ON public.store_exchange_rates;
CREATE POLICY store_rates_delete ON public.store_exchange_rates
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.has_store_role_as(auth.uid(), store_id, ARRAY['admin', 'manager', 'encargado'])
  );
