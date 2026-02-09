-- Migration: Fix Stores Visibility and Multi-tenant RLS
-- Objetivo: Restaurar visibilidad de tiendas para usuarios según su membresía
-- y permitir acceso total a administradores.

BEGIN;

-- 1. ASEGURAR QUE RLS ESTÉ ACTIVADO
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR POLICIES PREVIAS PARA EVITAR DUPLICADOS
DROP POLICY IF EXISTS "Stores visibility" ON public.stores;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.stores;
DROP POLICY IF EXISTS "Users can view their assigned stores" ON public.stores;

-- 3. CREAR POLICY FOR SELECT (Multi-tenant)
-- Esta política permite que:
-- - Admins/Superadmins vean todas las tiendas.
-- - Usuarios vean solo tiendas donde tienen una membresía activa.
CREATE POLICY "Stores visibility"
ON public.stores
FOR SELECT
TO authenticated
USING (
  public.is_admin() -- Función SECURITY DEFINER (Admin/Superadmin)
  OR EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.store_id = public.stores.id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  )
);

-- 4. RECARGAR CACHÉ DE POSTGREST
NOTIFY pgrst, 'reload schema';

COMMIT;
