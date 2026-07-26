-- V2.5.2 — Eliminar versiones antiguas sin p_transaction_id / p_user_id
-- Las migraciones V2.5 crearon nuevas versiones seguras, pero las viejas
-- (sin bypass para service_role) siguen existiendo por sobrecarga.
-- Postgres permite esto pero Supabase client no puede resolver la ambigüedad.

-- create_transfer vieja (sin p_transaction_id)
DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, jsonb, text, timestamp with time zone) CASCADE;

-- perform_inventory_adjustment vieja (sin p_tasa_cambio, supuestamente)
-- Veamos cuál es la buena y dejamos solo esa
-- La V2.5 definió: (uuid, uuid, numeric, text, uuid, numeric, timestamp)
-- Si existe otra con p_tasa_cambio, la eliminamos también (la V2.5 no la incluye)

NOTIFY pgrst, 'reload schema';
