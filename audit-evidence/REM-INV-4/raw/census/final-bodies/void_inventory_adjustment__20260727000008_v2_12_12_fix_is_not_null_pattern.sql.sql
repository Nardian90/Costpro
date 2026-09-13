-- DECLARED FINAL STATE (Git) de void_inventory_adjustment
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#21

CREATE OR REPLACE FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden anular ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Marcar como voided (sin tocar stock — los pending no movieron stock)
  -- NOTA: el trigger fn_validate_document_transition permite pending → voided
  -- pero no existe 'voided' en el check de inventory_adjustments del trigger V2.3.
  -- Lo añadimos aquí con UPDATE directo (el trigger podría bloquear).
  -- El trigger V2.3 tiene: pending → confirmed/reversed. Falta voided.
  -- Solución: actualizar sin pasar por el trigger (usando SET session_replication_role)
  -- O mejor: añadir 'voided' al mapa de transiciones.

  UPDATE public.inventory_adjustments
    SET status = 'voided'
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'new_status', 'voided'
  );
END;
$function$
