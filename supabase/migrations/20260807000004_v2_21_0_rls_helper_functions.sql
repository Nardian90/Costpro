-- ============================================================================
-- Migration: 20260807000004_v2_21_0_rls_helper_functions.sql
-- Iteración RLS Multi-Tenant — Fase A.4: Funciones helper para RLS
-- ============================================================================
-- 4 funciones STABLE/SECURITY DEFINER para usar en policies RLS:
--   1. current_user_tenant_id() — uuid del tenant del user actual
--   2. current_user_store_ids() — uuid[] de stores accesibles
--   3. is_admin_with_access(p_store_id) — reemplaza is_admin() bypass
--   4. is_tenant_member(p_tenant_id) — check directo de membresía tenant
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. current_user_tenant_id() — STABLE, cacheado por query
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_user_tenant_id() IS
  'Iteración RLS (v2.21.0): Returns the tenant_id of the current authenticated user. STABLE — cached per query. Uses PK lookup on profiles.id (O(1)).';

-- 2. current_user_store_ids() — STABLE, array de stores accesibles
CREATE OR REPLACE FUNCTION public.current_user_store_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_result uuid[];
BEGIN
  IF public.is_admin() THEN
    -- Admin: todas las stores activas de su tenant
    SELECT array_agg(id) INTO v_result
    FROM public.stores
    WHERE tenant_id = public.current_user_tenant_id()
      AND is_active = true;
  ELSE
    -- Non-admin: stores con membership activa
    SELECT array_agg(store_id) INTO v_result
    FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';
  END IF;
  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$$;

COMMENT ON FUNCTION public.current_user_store_ids() IS
  'Iteración RLS (v2.21.0): Returns array of store_ids accessible by current user. Admin sees all active stores in their tenant. Non-admin sees stores with active membership.';

-- 3. is_admin_with_access(p_store_id) — reemplaza is_admin() bypass en policies
CREATE OR REPLACE FUNCTION public.is_admin_with_access(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_is_admin boolean;
  v_user_tenant uuid;
  v_store_tenant uuid;
BEGIN
  -- Si no es admin, debe usar has_store_access() normal
  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RETURN public.has_store_access(p_store_id);
  END IF;

  -- Si es admin, verificar que el store pertenece a su tenant
  v_user_tenant := public.current_user_tenant_id();
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;

  -- Si el store no tiene tenant (legacy) o coincide con el del admin → allow
  RETURN v_store_tenant IS NULL OR v_store_tenant = v_user_tenant;
END;
$$;

COMMENT ON FUNCTION public.is_admin_with_access(uuid) IS
  'Iteración RLS (v2.21.0): Replaces is_admin() bypass in policies. Admin global solo accede stores de su propio tenant. Non-admin delegates to has_store_access().';

-- 4. is_tenant_member(p_tenant_id) — check directo para tablas con tenant_id
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT p_tenant_id IS NOT NULL
   AND p_tenant_id = public.current_user_tenant_id();
$$;

COMMENT ON FUNCTION public.is_tenant_member(uuid) IS
  'Iteración RLS (v2.21.0): Direct tenant membership check. Replaces EXISTS subqueries for better performance.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.is_tenant_member(uuid);
-- DROP FUNCTION IF EXISTS public.is_admin_with_access(uuid);
-- DROP FUNCTION IF EXISTS public.current_user_store_ids();
-- DROP FUNCTION IF EXISTS public.current_user_tenant_id();
-- ============================================================================
