-- V2.5.1 — Eliminar versiones antiguas sin p_user_id de void_transaction
-- La migración V2.5 creó una nueva versión con p_user_id, pero la vieja
-- (sin ese parámetro) sigue existiendo por sobrecarga de Postgres y NO
-- tiene el chequeo has_store_access. La eliminamos para forzar que
-- todos los callers usen la versión segura.

DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, timestamp with time zone) CASCADE;

NOTIFY pgrst, 'reload schema';
