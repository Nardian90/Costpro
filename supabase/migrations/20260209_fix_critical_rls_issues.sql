-- ==============================================================================
-- MIGRATION: FIX_CRITICAL_RLS_ISSUES
-- ==============================================================================
-- Descripción: Corrección crítica de RLS que bloquea operaciones de Admin
-- 
-- Problemas resueltos:
-- 1. is_admin() retorna FALSE (no encuentra rol del usuario autenticado)
-- 2. Policies duplicadas en 'stores' crean conflicto de lógica
-- 3. Admin no puede editar perfiles de otros usuarios (falta policy)
--
-- Scope: Multi-tenant seguro, Admin full control, Users aislados
-- Riesgo: BAJO (solo agranda permisos admin, no relaja seguridad general)
-- ==============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: REPARAR is_admin() - Usar ENUM directamente, no cast a text
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(ARRAY['admin', 'superadmin']::user_role[])
  );
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS 
'Returns TRUE if the current user (auth.uid()) has admin or superadmin role. Used for RLS policies.';

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

-- ============================================================================
-- PASO 2: REPARAR get_my_role() - Agregar default para evitar NULL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role 
  FROM public.profiles 
  WHERE id = auth.uid();
  
  -- Return default if user profile doesn't exist (shouldn't happen in prod, but defensive)
  RETURN COALESCE(v_role, 'usuario');
END;
$$;

COMMENT ON FUNCTION public.get_my_role() IS 
'Returns the role of the current user, or "usuario" as default if no profile found.';

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;

-- ============================================================================
-- PASO 3: CONSOLIDAR POLICIES EN 'stores' - Eliminar duplicados, clarificar lógica
-- ============================================================================

-- 3a. ELIMINAR policies conflictivas
DROP POLICY IF EXISTS "Stores management" ON public.stores;
DROP POLICY IF EXISTS "Stores visibility" ON public.stores;
DROP POLICY IF EXISTS "Users can view all stores" ON public.stores;

-- 3b. CREAR policies consolidadas y claras

-- SELECT: Admin OR usuario miembro activo
CREATE POLICY "stores_select_admin_or_member"
  ON public.stores
  FOR SELECT
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 
      FROM public.user_store_memberships m
      WHERE m.store_id = stores.id
        AND m.user_id = auth.uid()
        AND m.status = 'active'::membership_status
    )
  );

-- INSERT: Admin OR Encargado que crea su propia tienda
CREATE POLICY "stores_insert_admin_or_encargado"
  ON public.stores
  FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      auth.uid() = created_by
      AND (
        SELECT role 
        FROM public.profiles 
        WHERE id = auth.uid()
      ) = 'encargado'::user_role
    )
  );

-- UPDATE: Admin OR Encargado (creador)
CREATE POLICY "stores_update_admin_or_encargado_creator"
  ON public.stores
  FOR UPDATE
  USING (
    is_admin()
    OR (
      auth.uid() = created_by
      AND (
        SELECT role 
        FROM public.profiles 
        WHERE id = auth.uid()
      ) = 'encargado'::user_role
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      auth.uid() = created_by
      AND (
        SELECT role 
        FROM public.profiles 
        WHERE id = auth.uid()
      ) = 'encargado'::user_role
    )
  );

-- DELETE: Solo Admin
CREATE POLICY "stores_delete_admin"
  ON public.stores
  FOR DELETE
  USING (is_admin());

-- ============================================================================
-- PASO 4: AGREGAR policy para Admin en 'profiles' - Permite edición de otros
-- ============================================================================

-- NUEVA policy: Admins pueden leer/editar/eliminar cualquier perfil
CREATE POLICY "profiles_admin_full_access"
  ON public.profiles
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

COMMENT ON POLICY "profiles_admin_full_access" ON public.profiles IS
'Admin can read, update, and delete any profile. This enables user management features like deactivation.';

-- ============================================================================
-- PASO 5: VERIFICACIÓN - Auditoría de cambios
-- ============================================================================

-- Log de aplicación de la migración
INSERT INTO public.audit_logs (
  user_id,
  action,
  table_name,
  record_id,
  new_data,
  metadata
) VALUES (
  auth.uid(),
  'MIGRATION_FIX_RLS_CRITICAL',
  'system',
  '00000000-0000-0000-0000-000000000000'::uuid,
  jsonb_build_object(
    'fixed_functions', ARRAY['is_admin', 'get_my_role'],
    'consolidated_policies', ARRAY['stores_select_admin_or_member', 'stores_insert_admin_or_encargado', 'stores_update_admin_or_encargado_creator', 'stores_delete_admin'],
    'new_policies', ARRAY['profiles_admin_full_access']
  ),
  jsonb_build_object(
    'timestamp', now(),
    'purpose', 'Fix critical RLS issues blocking admin operations'
  )
);

COMMIT;

-- ==============================================================================
-- VERIFICACIÓN MANUAL (ejecutar después de aplicar la migración)
-- ==============================================================================
/*

-- Test 1: ¿Funciona is_admin()?
SELECT public.is_admin() as "Admin Check" FROM public.profiles WHERE role = 'admin' LIMIT 1;
-- Esperado: true

-- Test 2: ¿Se ven tiendas?
SELECT id, name, is_active FROM public.stores ORDER BY name;
-- Esperado: 2+ registros (para admin)

-- Test 3: ¿Existen policies consolidadas?
SELECT policyname, cmd FROM pg_policies 
WHERE tablename = 'stores' 
  AND schemaname = 'public'
ORDER BY policyname;
-- Esperado: 4 policies (select, insert, update, delete)

-- Test 4: ¿Existe policy de admin en profiles?
SELECT policyname FROM pg_policies 
WHERE tablename = 'profiles' 
  AND schemaname = 'public'
  AND policyname LIKE '%admin%';
-- Esperado: 1 policy 'profiles_admin_full_access'

*/
