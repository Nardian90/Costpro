-- DECLARED FINAL STATE (Git) de cancel_transfer
-- fuente: 20260802000002_v2_12_42_transfer_remediation.sql stmt#15

CREATE OR REPLACE FUNCTION public.cancel_transfer(
  p_transfer_id uuid,
  p_reason text DEFAULT 'Cancelada',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Actualizar estado
  UPDATE public.transfers
    SET status = 'CANCELADA', notes = COALESCE(notes, '') || ' [CANCELADA: ' || p_reason || ']'
    WHERE id = p_transfer_id;

  -- Liberar reservas ACTIVE
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = NOW()
    WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id AND status = 'ACTIVE';

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_cancelled', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'reservations_released',
      (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'RELEASED')));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$
