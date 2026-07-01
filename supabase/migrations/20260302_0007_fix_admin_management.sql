-- Migration: Fix Admin Management and Schema Cache
-- 1. Refrescar el caché de PostgREST
-- 2. Corregir RLS para permitir a Admins actualizar perfiles
-- 3. Corregir RLS para permitir a Admins ver membresías
-- 4. Asegurar la relación FK para que PostgREST detecte 'memberships'

BEGIN;

-- 1. RECARGAR EL ESQUEMA
NOTIFY pgrst, 'reload schema';

-- 2. RLS PARA ACTUALIZACIÓN DE PERFILES
-- 2. FUNCIÓN DE APOYO PARA EVITAR RECURSIÓN EN RLS
-- SECURITY DEFINER corre con privilegios de creador, evitando bucles infinitos.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role::text IN ('admin', 'superadmin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS PARA ACTUALIZACIÓN DE PERFILES
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles management" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access" ON public.profiles;
DROP POLICY IF EXISTS "Self profile update" ON public.profiles;

-- Política para Administradores: Acceso total
CREATE POLICY "Admin full access"
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_admin());

-- Política para Usuarios: Pueden actualizar su propio perfil (excepto el rol)
CREATE POLICY "Self profile update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND (
    public.is_admin() OR
    -- Evita que un usuario no-admin cambie su propio rol (asumiendo que el valor no cambia)
    role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  )
);

-- 4. RLS PARA LECTURA DE MEMBRESÍAS
DROP POLICY IF EXISTS "Admins can select all memberships" ON public.user_store_memberships;
DROP POLICY IF EXISTS "Memberships visibility" ON public.user_store_memberships;

CREATE POLICY "Memberships visibility"
ON public.user_store_memberships
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR user_id = auth.uid()
  OR (EXISTS (SELECT 1 FROM public.user_store_memberships m WHERE m.user_id = auth.uid() AND m.role = 'encargado' AND m.store_id = store_id))
);

-- 5. ASEGURAR RELACIÓN PARA POSTGREST
-- Esto permite que PostgREST entienda la relación si se intenta un join.
ALTER TABLE public.user_store_memberships
DROP CONSTRAINT IF EXISTS user_store_memberships_user_id_fkey;

ALTER TABLE public.user_store_memberships
ADD CONSTRAINT user_store_memberships_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMIT;
