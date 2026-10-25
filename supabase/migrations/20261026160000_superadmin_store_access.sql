-- ═══════════════════════════════════════════════════════════════════════════
-- CP-ORG-001 ciclo 4 (2026-10-25) — Acceso SuperAdmin a tiendas (RLS)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO: el propietario activó a admin@demo.com como SuperAdmin de
-- plataforma (migración 20260826120000 §6, aplicada a producción el
-- 2026-10-25). Por diseño, la cuenta de plataforma NO lleva membresías de
-- tienda. La función canónica has_store_access() ya la cubre (is_admin()
-- incluye 'superadmin'), pero quedaban TRES puntos donde el SuperAdmin no
-- era explícitamente transversal:
--
--   1. stores_tenant_select/update/delete: bajo el feature flag
--      app.use_tenant_rls='true' el CASE solo comparaba tenant, SIN bypass
--      de SuperAdmin.
--   2. current_user_store_ids(): para is_admin() devolvía SOLO las tiendas
--      del tenant del perfil — un SuperAdmin de plataforma debe ver todas.
--
-- REGLA ESTABLECIDA (expediente CP-ORG-001 §16/§17): el rol 'superadmin' es
-- de PLATAFORMA y es transversal a tiendas y tenants («debería poder ver
-- todo, acceder a todo» — directiva del propietario 2026-10-25). Ningún
-- cambio para admin ordinario ni para el resto de roles: solo se AÑADE el
-- bypass explícito is_superadmin() donde faltaba.
--
-- Todo idempotente (CREATE OR REPLACE / policies recreadas por nombre).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. current_user_store_ids(): SuperAdmin = TODAS las tiendas activas ───
CREATE OR REPLACE FUNCTION public.current_user_store_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result uuid[];
BEGIN
  IF public.is_superadmin() THEN
    SELECT array_agg(id) INTO v_result
    FROM public.stores
    WHERE is_active = true;
  ELSIF public.is_admin() THEN
    SELECT array_agg(id) INTO v_result
    FROM public.stores
    WHERE tenant_id = public.current_user_tenant_id()
      AND is_active = true;
  ELSE
    SELECT array_agg(store_id) INTO v_result
    FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';
  END IF;
  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$function$;

COMMENT ON FUNCTION public.current_user_store_ids() IS
  'CP-ORG-001 c4: SuperAdmin ve TODAS las tiendas activas (rol de plataforma transversal); admin ordinario limitado a su tenant.';

-- ─── 2. stores_tenant_select: bypass SuperAdmin también con flag activo ────
DROP POLICY IF EXISTS stores_tenant_select ON public.stores;
CREATE POLICY stores_tenant_select ON public.stores
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
        (public.is_superadmin()
         OR tenant_id = public.current_user_tenant_id())
      ELSE
        (public.is_superadmin()
         OR (public.is_admin() AND tenant_id IS NOT DISTINCT FROM public.current_user_tenant_id())
         OR (id = ANY (public.current_user_store_ids())))
    END
  );

-- ─── 3. stores_tenant_update: bypass SuperAdmin también con flag activo ────
DROP POLICY IF EXISTS stores_tenant_update ON public.stores;
CREATE POLICY stores_tenant_update ON public.stores
  FOR UPDATE TO authenticated
  USING (
    CASE
      WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
        (public.is_superadmin()
         OR (tenant_id = public.current_user_tenant_id() AND public.is_admin()))
      ELSE
        (public.is_admin() OR public.has_store_access(id))
    END
  );

-- ─── 4. stores_tenant_delete: bypass SuperAdmin también con flag activo ────
DROP POLICY IF EXISTS stores_tenant_delete ON public.stores;
CREATE POLICY stores_tenant_delete ON public.stores
  FOR DELETE TO authenticated
  USING (
    CASE
      WHEN current_setting('app.use_tenant_rls', true) = 'true' THEN
        (public.is_superadmin()
         OR (tenant_id = public.current_user_tenant_id() AND public.is_admin()))
      ELSE
        public.is_admin()
    END
  );
