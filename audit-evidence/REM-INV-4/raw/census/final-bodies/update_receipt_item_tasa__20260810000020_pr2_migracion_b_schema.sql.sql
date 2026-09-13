-- DECLARED FINAL STATE (Git) de update_receipt_item_tasa
-- fuente: 20260810000020_pr2_migracion_b_schema.sql stmt#8

CREATE OR REPLACE FUNCTION public.update_receipt_item_tasa(
  p_receipt_item_id uuid,
  p_new_tasa_cambio_recepcion numeric,
  p_new_moneda_recepcion text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_item RECORD;
  v_store_id uuid;
  v_receipt_id uuid;
  v_old_tasa numeric;
  v_old_moneda text;
  v_effective_moneda text;
  v_new_total numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  -- (1) Lock item + receipt
  SELECT
    ri.id AS item_id,
    ri.receipt_id,
    ri.quantity,
    ri.unit_cost,
    ri.moneda_recepcion,
    ri.tasa_cambio_recepcion,
    r.store_id,
    r.status AS receipt_status
  INTO v_item
  FROM public.receipt_items ri
  JOIN public.receipts r ON r.id = ri.receipt_id
  WHERE ri.id = p_receipt_item_id
  FOR UPDATE OF ri, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_ITEM_NOT_FOUND';
  END IF;

  v_store_id := v_item.store_id;
  v_receipt_id := v_item.receipt_id;
  v_old_tasa := v_item.tasa_cambio_recepcion;
  v_old_moneda := v_item.moneda_recepcion;

  -- (2) Authorization
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- (3) Status guard
  IF v_item.receipt_status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED';
  END IF;
  IF v_item.receipt_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  -- (4) Validación coherencia moneda ↔ tasa
  IF p_new_moneda_recepcion IS NOT NULL
     AND p_new_moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
  THEN
    RAISE EXCEPTION 'ERR_UNSUPPORTED_CURRENCY: % no soportada', p_new_moneda_recepcion;
  END IF;

  v_effective_moneda := COALESCE(p_new_moneda_recepcion, v_old_moneda);

  -- CUP = tasa 1 (estricto)
  IF v_effective_moneda = 'CUP'
     AND p_new_tasa_cambio_recepcion IS DISTINCT FROM 1.0
  THEN
    RAISE EXCEPTION 'ERR_CUP_RATE_MUST_BE_1: moneda CUP requiere tasa=1, recibido %',
      p_new_tasa_cambio_recepcion;
  END IF;

  -- FX = tasa > 1.5
  IF v_effective_moneda <> 'CUP' THEN
    IF p_new_tasa_cambio_recepcion IS NULL OR p_new_tasa_cambio_recepcion <= 1.5 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: moneda % requiere tasa > 1.5, recibido %',
        v_effective_moneda, COALESCE(p_new_tasa_cambio_recepcion::text, 'NULL');
    END IF;
    IF p_new_tasa_cambio_recepcion < 0.01 OR p_new_tasa_cambio_recepcion > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa % fuera de rango [0.01, 10000]',
        p_new_tasa_cambio_recepcion;
    END IF;
  END IF;

  -- (5) No-op guard
  IF v_old_tasa IS NOT DISTINCT FROM p_new_tasa_cambio_recepcion
     AND (p_new_moneda_recepcion IS NULL OR v_old_moneda = p_new_moneda_recepcion)
  THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'receipt_item_id', p_receipt_item_id,
      'receipt_id', v_receipt_id
    );
  END IF;

  -- (6) Audit BEFORE mutating
  INSERT INTO public.receipt_tasa_audit (
    receipt_item_id, valor_anterior, valor_nuevo,
    moneda_anterior, moneda_nueva, modificado_por, modificado_at, motivo
  ) VALUES (
    p_receipt_item_id,
    v_old_tasa,
    p_new_tasa_cambio_recepcion,
    v_old_moneda,
    COALESCE(p_new_moneda_recepcion, v_old_moneda),
    v_caller_uid,
    NOW(),
    COALESCE(p_motivo, 'update_receipt_item_tasa RPC')
  );

  -- (7) Mutate receipt_items
  UPDATE public.receipt_items
    SET
      tasa_cambio_recepcion = p_new_tasa_cambio_recepcion,
      moneda_recepcion = COALESCE(p_new_moneda_recepcion, moneda_recepcion),
      updated_at = NOW()
    WHERE id = p_receipt_item_id;

  -- (8) Recalcular total_cost — UNA sola llamada
  v_new_total := public.calculate_receipt_total_cup(v_receipt_id);

  UPDATE public.receipts
    SET
      total_cost = v_new_total,
      updated_at = NOW()
    WHERE id = v_receipt_id;

  -- (9) Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'UPDATE_RECEIPT_ITEM_TASA', 'receipt_items', p_receipt_item_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'valor_anterior', v_old_tasa,
      'valor_nuevo', p_new_tasa_cambio_recepcion,
      'moneda_anterior', v_old_moneda,
      'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
      'motivo', p_motivo
    )
  );

  -- (10) Return
  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_item_id', p_receipt_item_id,
    'receipt_id', v_receipt_id,
    'valor_anterior', v_old_tasa,
    'valor_nuevo', p_new_tasa_cambio_recepcion,
    'moneda_anterior', v_old_moneda,
    'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
    'new_total_cost', v_new_total
  );
END;
$function$
