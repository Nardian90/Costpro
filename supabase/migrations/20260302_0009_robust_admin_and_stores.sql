-- Migration: Robust Admin Detection and Full Stores CRUD
-- Objetivo: Corregir is_admin para soportar la transición a roles tabulares
-- y permitir gestión completa de tiendas por administradores.

BEGIN;

-- 1. RE-DEFINIR is_admin DE FORMA ROBUSTA
-- Soporta tanto la columna 'role' (legacy) como 'role_id' (nuevo sistema)
-- y realiza comparaciones insensibles a mayúsculas.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND (
      p.role::text ILIKE 'admin' OR
      p.role::text ILIKE 'superadmin' OR
      r.name ILIKE 'Admin' OR
      r.name ILIKE 'Superadmin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RLS PARA stores (CRUD COMPLETO)
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas anteriores
DROP POLICY IF EXISTS "Stores visibility" ON public.stores;
DROP POLICY IF EXISTS "Stores select" ON public.stores;
DROP POLICY IF EXISTS "Stores insert" ON public.stores;
DROP POLICY IF EXISTS "Stores update" ON public.stores;
DROP POLICY IF EXISTS "Stores delete" ON public.stores;

-- SELECT: Admins ven todo, usuarios ven sus tiendas con membresía activa
CREATE POLICY "Stores select"
ON public.stores
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.store_id = public.stores.id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  )
);

-- INSERT: Permitir a Admins crear tiendas
CREATE POLICY "Stores insert"
ON public.stores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- UPDATE: Permitir a Admins editar tiendas
CREATE POLICY "Stores update"
ON public.stores
FOR UPDATE
TO authenticated
USING (public.is_admin());

-- DELETE: Permitir a Admins eliminar tiendas
CREATE POLICY "Stores delete"
ON public.stores
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 3. ASEGURAR VISIBILIDAD DE MEMBRESÍAS PARA ADMINS
-- Re-aplicamos la política de membresías para asegurar que use el nuevo is_admin()
DROP POLICY IF EXISTS "Memberships visibility" ON public.user_store_memberships;
CREATE POLICY "Memberships visibility"
ON public.user_store_memberships
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR user_id = auth.uid()
  OR (EXISTS (SELECT 1 FROM public.user_store_memberships m WHERE m.user_id = auth.uid() AND m.role ILIKE 'encargado' AND m.store_id = store_id))
);

-- 4. RECARGAR ESQUEMA
NOTIFY pgrst, 'reload schema';

COMMIT;
