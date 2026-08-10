-- ============================================================================
-- PR-3: void_pending_reception — RPC transaccional para anular recepciones pending
-- ============================================================================
-- Reemplaza el flujo client-side (DELETE items + UPDATE status) por una RPC
-- atómica que:
--   1. Preserva receipt_items (no los borra — auditoría)
--   2. Resetea paid_amount=0, payment_status='unpaid', paid_at=NULL
--   3. Marca payment_transactions como [REVERSED] si existen
--   4. Inserta audit_logs atómicamente
--   5. Es idempotente (segunda llamada retorna success sin efectos)
--   6. Usa FOR UPDATE para concurrencia
--   7. Usa has_store_access_as (patrón v2.12.12)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.void_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Anulación de recepción pendiente',
  p_operation_date timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_receipt RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  v_eff_date timestamptz := COALESCE(p_operation_date, NOW());
  v_reversed_payments integer;
BEGIN
  -- 1. Lock receipt (FOR UPDATE para concurrencia)
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND';
  END IF;

  -- 2. Idempotency: already voided → return success sin efectos
  IF v_receipt.status = 'voided' THEN
    RETURN jsonb_build_object(
      'status', 'idempotent',
      'receipt_id', p_receipt_id,
      'message', 'receipt already voided — no changes applied'
    );
  END IF;

  -- 3. Status guard: only pending can be voided here
  IF v_receipt.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only pending receipts can be voided here (status=%)',
      v_receipt.status;
  END IF;

  -- 4. Authorization (patrón v2.12.12: OR no AND)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 5. Operation date validation (política forward-only)
  PERFORM public.validate_operation_date(p_operation_date, v_receipt.store_id);

  -- 6. Mark payment_transactions as REVERSED (if any exist)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by void_pending_reception ' || p_receipt_id::text || ' at ' || v_eff_date::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- 7. Update receipt: voided + reset payment fields. DO NOT DELETE items.
  UPDATE public.receipts
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_receipt_id;

  -- 8. Audit log (atómico dentro de la transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid,
    v_receipt.store_id,
    'RECEPTION_VOIDED_PENDING',
    'receipts',
    p_receipt_id,
    jsonb_build_object(
      'reason', p_reason,
      'payments_reversed', v_reversed_payments,
      'items_preserved', (SELECT COUNT(*) FROM public.receipt_items WHERE receipt_id = p_receipt_id)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_id', p_receipt_id,
    'payments_reversed', v_reversed_payments
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.void_pending_reception(uuid, uuid, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_pending_reception(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_pending_reception(uuid, uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.void_pending_reception IS
  'PR-3: Anula una recepción pending de forma atómica. Preserva receipt_items. Resetea pagos. Marca payment_transactions como REVERSED. Idempotente. SECURITY DEFINER con has_store_access_as.';
