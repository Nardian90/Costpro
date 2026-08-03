-- ============================================================================
-- Migration: 20260803000006_v2_13_6_inventory_reservations_expiry.sql
-- Iteración 11.1 — Fix H-14
-- ============================================================================
-- PROBLEMA: inventory_reservations no tenía expires_at ni cleanup job.
-- Transferencias pendientes reservaban stock que el POS podía vender,
-- dejando la transferencia permanentemente no-confirmable. Las reservations
-- quedaban ACTIVE para siempre.
--
-- SOLUCIÓN:
--   1. ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours').
--   2. CREATE FUNCTION release_expired_reservations() que marca como RELEASED
--      las reservations con expires_at < now() AND status = 'ACTIVE'.
--   3. Comentario documentando que debe llamarse via pg_cron o cron externo.
--
-- NOTA sobre pg_cron: Supabase tiene pg_cron disponible por defecto en la
-- mayoría de planes. Si no está disponible, la función puede llamarse desde
-- un cron externo (Vercel Cron, GitHub Actions, etc.) vía RPC.
-- No creamos el cron.schedule aquí para no fallar si pg_cron no está instalado.
--
-- UP:
--   ADD COLUMN + CREATE FUNCTION.
--
-- DOWN:
--   DROP FUNCTION + DROP COLUMN.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Añadir expires_at con default 24h
ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours');

COMMENT ON COLUMN public.inventory_reservations.expires_at IS
  'Iteración 11.1 (H-14): Reservation expiry timestamp. Defaults to 24h after creation. Set by create_transfer; cleaned up by release_expired_reservations().';

-- 2. Función para liberar reservations expiradas
-- Llamar periodicamente via: SELECT public.release_expired_reservations();
-- O via pg_cron: cron.schedule('release_expired_reservations', '0 * * * *', 'SELECT public.release_expired_reservations()');
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = now()
    WHERE status = 'ACTIVE' AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    SELECT 'RESERVATION_EXPIRED', 'inventory_reservations', r.id::text, r.store_id, NULL,
      jsonb_build_object('count', v_count, 'reason', 'auto-release expired reservations')
    FROM public.inventory_reservations r
    WHERE r.released_at = now() AND r.status = 'RELEASED'
    LIMIT 1;
  END IF;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO service_role;

COMMENT ON FUNCTION public.release_expired_reservations() IS
  'Iteración 11.1 (H-14): Releases ACTIVE reservations past their expires_at. Call via pg_cron or external scheduler. Returns count of released rows.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.release_expired_reservations();
-- ALTER TABLE public.inventory_reservations DROP COLUMN IF EXISTS expires_at;
-- ============================================================================
