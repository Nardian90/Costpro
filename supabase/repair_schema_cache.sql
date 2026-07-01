-- ==============================================================================
-- REPARACIÓN DE SCHEMA CACHE: RELACIÓN PROFILES -> MEMBERSHIPS
-- ==============================================================================
-- Este script corrige el error "Could not find the memberships column of profiles"
-- asegurando que PostgREST reconozca la relación entre las tablas.

BEGIN;

-- 1. ASEGURAR RELACIÓN EXPLÍCITA (Foreign Key)
-- PostgREST requiere una Foreign Key clara para exponer tablas relacionadas en un .select()
-- Cambiamos la FK para que apunte específicamente a public.profiles(id)
ALTER TABLE public.user_store_memberships
DROP CONSTRAINT IF EXISTS user_store_memberships_user_id_fkey;

ALTER TABLE public.user_store_memberships
DROP CONSTRAINT IF EXISTS profiles_memberships_fkey;

ALTER TABLE public.user_store_memberships
ADD CONSTRAINT profiles_memberships_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. OTORGAR PERMISOS (GRANT)
-- Aseguramos que tanto los usuarios autenticados como el service_role tengan acceso
GRANT ALL ON public.user_store_memberships TO authenticated, service_role;
GRANT ALL ON public.profiles TO authenticated, service_role;
GRANT ALL ON public.stores TO authenticated, service_role;

-- 3. FORZAR RECARGA DE CACHÉ DE POSTGREST
-- Esto notifica a la API de Supabase que el esquema ha cambiado.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- VERIFICACIÓN (Opcional: Ejecutar para confirmar)
-- SELECT
--     conname AS constraint_name,
--     conrelid::regclass AS table_name,
--     confrelid::regclass AS referenced_table
-- FROM pg_constraint
-- WHERE conname = 'profiles_memberships_fkey';
