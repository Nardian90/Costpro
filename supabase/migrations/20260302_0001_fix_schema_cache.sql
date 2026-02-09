-- Tarea 1: Diagnóstico y Refresco de Caché
-- El error 'Could not find the memberships column of profiles' suele ocurrir cuando
-- la columna fue eliminada pero PostgREST aún la espera en su caché.

-- 1. Aseguramos que el esquema sea consistente.
-- Si decidimos que 'memberships' ya no debe estar en 'profiles' (porque usamos tabla relacional),
-- nos aseguramos de que no haya dependencias.

-- 2. Refresco de Caché (PostgREST)
-- Esto se hace enviando una señal NOTIFY al canal pgrst.
-- Nota: Esto requiere privilegios adecuados.
NOTIFY pgrst, 'reload schema';

-- 3. Verificación/Corrección de columna si fuera necesaria
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS memberships JSONB;
