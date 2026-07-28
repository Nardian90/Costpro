-- ════════════════════════════════════════════════════════════════════════
-- V2.12.10 — H7: confirm_transfer debe respetar requires_approval
--
-- Bug: 20260726000021_v2_9_h6_physical_count.sql creó transfer_approval_rules,
-- approve_transfer, reject_transfer, y create_transfer marca
-- requires_approval=TRUE correctamente. PERO confirm_transfer nunca fue
-- modificado para revisar ese flag. Cualquiera con acceso al destino puede
-- llamar confirm_transfer directo y saltarse la aprobación.
--
-- Bug adicional detectado durante la inspección:
--   confirm_transfer NO tiene NINGÚN check de acceso. Cualquier usuario
--   autenticado puede confirmar CUALQUIER transferencia, sin importar si
--   tiene acceso al destino o no. Esto es un BOLA crítico adicional.
--
-- Fix:
--   1. Añadir check de acceso al destino (has_store_access_as).
--   2. Aplicar el patrón anti-spoofing de V2.12.9 (auth.role() guard).
--   3. Si la transferencia tiene requires_approval=TRUE y NO está aprobada,
--      rechazar con ERR_TRANSFER_REQUIRES_APPROVAL.
--   4. Añadir SET search_path para defense-in-depth.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_transfer(
  p_transfer_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_dest RECORD;
  v_mov JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
  -- V2.12.9 anti-spoofing: solo service_role puede pasar p_user_id explícito
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  -- V2.12.10 (nuevo): check de acceso al destino. Antes no había NINGÚN check.
  -- Cualquiera autenticado podía confirmar cualquier transferencia.
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  -- V2.12.10: autorización — caller debe tener acceso al destino
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- V2.12.10 (H7 fix): si requires_approval=TRUE y NO está aprobada, rechazar.
  -- Esto cierra la puerta trasera descrita en el audit.
  IF COALESCE(v_transfer.requires_approval, false) = true
     AND v_transfer.approved_at IS NULL THEN
    RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
  END IF;

  UPDATE public.transfers
    SET status = 'CONFIRMADA',
        confirmed_at = NOW(),
        confirmed_by = v_caller_uid
    WHERE id = p_transfer_id;

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    -- FIX F5-18: skip access check para origen (el caller accede al destino)
    v_mov := public.register_stock_movement(v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', p_transfer_id::text, v_caller_uid, NULL, NULL, v_item.unit_cost, NULL, p_operation_date, TRUE);
    v_movements := array_append(v_movements, v_mov);

    SELECT * INTO v_dest FROM public.products
      WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
        AND store_id = v_transfer.destination_store_id FOR UPDATE;
    IF v_dest.id IS NULL THEN RAISE EXCEPTION 'ERR_DEST_PRODUCT_NOT_FOUND'; END IF;

    -- FIX F5-11: pasar unit_cost para PMP en destino
    v_mov := public.register_stock_movement(v_dest.id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', p_transfer_id::text, v_caller_uid, NULL, NULL, v_item.unit_cost, NULL, p_operation_date, FALSE);
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id, 'at', NOW(),
      'requires_approval_was', COALESCE(v_transfer.requires_approval, false),
      'was_approved', v_transfer.approved_at IS NOT NULL));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid, uuid, timestamp with time zone) TO service_role;

COMMENT ON FUNCTION public.confirm_transfer(uuid, uuid, timestamp with time zone) IS
'V2.12.10 (H7 fix + BOLA fix): 1) check de acceso al destino (no existía), 2) anti-spoofing p_user_id (V2.12.9), 3) bloquea si requires_approval=TRUE y approved_at IS NULL. Antes: cualquiera podía confirmar cualquier transferencia y saltarse la aprobación.';

NOTIFY pgrst, 'reload schema';

COMMIT;
