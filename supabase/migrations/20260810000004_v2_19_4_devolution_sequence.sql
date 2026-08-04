-- ============================================================================
-- Migration: 20260810000004_v2_19_4_devolution_sequence.sql
-- Iteración Fiscal — Fix F-H1 (numeración secuencial devoluciones)
-- ============================================================================
-- Modifica create_devolution_v2 para usar next_document_number('credit_note')
-- en vez de epoch % 1000000.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- Reescribir create_devolution_v2 con numeración secuencial
DROP FUNCTION IF EXISTS public.create_devolution_v2;

CREATE OR REPLACE FUNCTION public.create_devolution_v2(
  p_store_id uuid,
  p_items jsonb,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_original_transaction_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'cash',
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing); END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_original_transaction_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_original_transaction_id AND store_id = p_store_id) THEN
      RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
    END IF;
  END IF;

  -- Iteración Fiscal (F-H1): Numeración secuencial real
  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
      p_quantity := v_qty, p_movement_type := 'return',
      p_sale_id := v_devolution_id, p_unit_cost := 0,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(), p_skip_access_check := TRUE
    );

    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      reference_type, reference_id, reference_description, created_at, created_by
    ) VALUES (
      p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_qty * v_price,
      'devolution', v_devolution_id, 'Devolución: ' || COALESCE(p_reason, ''),
      NOW(), v_caller_uid
    );
  END LOOP;

  UPDATE public.devolutions SET total_amount = (
    SELECT COALESCE(SUM(total), 0) FROM public.devolution_items WHERE devolution_id = v_devolution_id
  ) WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id, p_store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'original_tx', p_original_transaction_id,
      'devolution_number', v_dev_number, 'item_count', jsonb_array_length(p_items), 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','devolution_id',v_devolution_id,'devolution_number',v_dev_number);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_devolution_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2 TO service_role;

COMMENT ON FUNCTION public.create_devolution_v2 IS
  'Iteración 11.3 + Fiscal: Uses next_document_number for sequential credit_note numbering (F-H1).';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.create_devolution_v2;
-- -- Restaurar versión de 11.3 con epoch numbering
-- ============================================================================
