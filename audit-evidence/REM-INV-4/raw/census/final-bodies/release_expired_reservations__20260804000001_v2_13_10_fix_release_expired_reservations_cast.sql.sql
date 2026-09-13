-- DECLARED FINAL STATE (Git) de release_expired_reservations
-- fuente: 20260804000001_v2_13_10_fix_release_expired_reservations_cast.sql stmt#0

CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_count integer;
  v_sample_id uuid;
  v_sample_store_id uuid;
BEGIN
  -- Capturar un sample antes del UPDATE para el audit log
  SELECT id, store_id INTO v_sample_id, v_sample_store_id
    FROM public.inventory_reservations
    WHERE status = 'ACTIVE' AND expires_at < now()
    LIMIT 1;

  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = now()
    WHERE status = 'ACTIVE' AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- FIX: audit_logs.record_id es uuid, no text. Usar v_sample_id directo.
  -- Si v_count = 0, v_sample_id es NULL y el INSERT se skipnea (no hay rows).
  IF v_count > 0 AND v_sample_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('RESERVATION_EXPIRED', 'inventory_reservations', v_sample_id, v_sample_store_id, NULL,
      jsonb_build_object('count', v_count, 'reason', 'auto-release expired reservations'));
  END IF;

  RETURN v_count;
END;
$function$
