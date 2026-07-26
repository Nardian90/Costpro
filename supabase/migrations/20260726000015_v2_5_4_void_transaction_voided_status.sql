-- V2.5.4 — void_transaction debe usar 'voided' (no 'cancelled')
-- El trigger V2.3 fn_validate_document_transition solo permite
-- completed → reversed/voided. 'cancelled' no está permitido desde completed.
-- void_transaction estaba usando 'cancelled', lo que rompe el flujo.

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx RECORD; v_item RECORD;
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore integer;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- V2.5 H2b: autorización por tienda
  IF v_caller_uid IS NOT NULL THEN
    SELECT store_id INTO v_tx.store_id FROM public.transactions WHERE id = p_transaction_id;
    IF v_tx.store_id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
    IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  -- V2.5.4: usar 'voided' (compatible con trigger fn_validate_document_transition)
  UPDATE public.transactions
    SET status = 'voided', cancelled_at = v_eff, void_reason = p_reason
    WHERE id = p_transaction_id;

  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      v_item.product_id, v_tx.store_id, v_units_to_restore, 'sale_void',
      v_caller_uid, v_eff
    );
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'transaction_id', p_transaction_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
