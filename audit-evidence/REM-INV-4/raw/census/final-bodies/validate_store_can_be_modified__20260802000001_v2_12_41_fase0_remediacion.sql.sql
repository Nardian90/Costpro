-- DECLARED FINAL STATE (Git) de validate_store_can_be_modified
-- fuente: 20260802000001_v2_12_41_fase0_remediacion.sql stmt#0

CREATE OR REPLACE FUNCTION public.validate_store_can_be_modified(
  p_store_id UUID,
  p_check_type TEXT DEFAULT 'soft_delete'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_blockers JSONB[] := '{}'::jsonb[];
  v_pending_transfers_out INTEGER := 0;
  v_pending_transfers_in INTEGER := 0;
  v_open_ots INTEGER := 0;
  v_open_cash_sessions INTEGER := 0;
  v_pending_receipts INTEGER := 0;
BEGIN
  -- Transferencias pendientes donde la tienda es ORIGEN
  -- FIX: los valores del enum transfer_status están en español
  SELECT COUNT(*) INTO v_pending_transfers_out
  FROM transfers
  WHERE origin_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');

  IF v_pending_transfers_out > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'transfers_out',
      'count', v_pending_transfers_out,
      'message', format('Hay %s transferencias salientes pendientes', v_pending_transfers_out)
    ));
  END IF;

  -- Transferencias pendientes donde la tienda es DESTINO
  SELECT COUNT(*) INTO v_pending_transfers_in
  FROM transfers
  WHERE destination_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');

  IF v_pending_transfers_in > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'transfers_in',
      'count', v_pending_transfers_in,
      'message', format('Hay %s transferencias entrantes pendientes', v_pending_transfers_in)
    ));
  END IF;

  -- Órdenes de producción/trabajo abiertas
  SELECT COUNT(*) INTO v_open_ots
  FROM production_orders
  WHERE store_id = p_store_id
    AND status IN ('draft', 'approved', 'in_progress', 'paused');

  IF v_open_ots > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'open_ots',
      'count', v_open_ots,
      'message', format('Hay %s órdenes de trabajo abiertas', v_open_ots)
    ));
  END IF;

  -- Sesiones de caja abiertas
  SELECT COUNT(*) INTO v_open_cash_sessions
  FROM cash_sessions
  WHERE store_id = p_store_id
    AND status = 'open';

  IF v_open_cash_sessions > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'open_cash_sessions',
      'count', v_open_cash_sessions,
      'message', format('Hay %s sesiones de caja abiertas', v_open_cash_sessions)
    ));
  END IF;

  -- Recepciones pendientes de confirmar
  SELECT COUNT(*) INTO v_pending_receipts
  FROM receipts
  WHERE store_id = p_store_id
    AND status = 'pending';

  IF v_pending_receipts > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'type', 'pending_receipts',
      'count', v_pending_receipts,
      'message', format('Hay %s recepciones pendientes de confirmar', v_pending_receipts)
    ));
  END IF;

  RETURN jsonb_build_object(
    'can_modify', array_length(v_blockers, 1) IS NULL,
    'blockers', COALESCE(array_to_json(v_blockers)::jsonb, '[]'::jsonb)
  );
END;
$$
