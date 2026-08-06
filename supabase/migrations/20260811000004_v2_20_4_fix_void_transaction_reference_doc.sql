-- ============================================================================
-- Migration: 20260811000004_v2_20_4_fix_void_transaction_reference_doc.sql
-- Hot-test patch (Iteración 11.5): fix pre-existing bug in void_transaction
-- ============================================================================
-- BUG: void_transaction called register_stock_movement with named parameter
-- `p_reference_doc` which does NOT exist in register_stock_movement's signature.
-- The correct parameter is `p_notes`. This is the same bug that was fixed for
-- register_reception in migration 20260727000014 (v2.12.21).
--
-- Error: 42883: function public.register_stock_movement(p_product_id => uuid, ...)
--        No function matches the given name and argument types.
--
-- FIX: change `p_reference_doc := p_transaction_id::text` → `p_notes := p_transaction_id::text`
-- ============================================================================

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT now(), p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore numeric;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- FIX C-7: Restaurar stock considerando conversion_factor de variantes.
  -- Si transaction_items.variant_id está poblado, buscar conversion_factor.
  -- Si variant_id es NULL (ventas legacy), usar 1 (sin conversión) para
  -- mantener simetría con create_sale legacy.
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_void',
      p_notes := p_transaction_id::text,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Void de venta',
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;

$$;

COMMENT ON FUNCTION public.void_transaction IS
  'Iteracion 11.5 hot-test patch: fixed p_reference_doc → p_notes (same bug as register_reception v2.12.21).';
