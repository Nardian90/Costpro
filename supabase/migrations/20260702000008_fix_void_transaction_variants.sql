-- ============================================================================
-- Migration: 20260702000008_fix_void_transaction_variants.sql
-- Fix G9: void_transaction considera variant_id + conversion_factor
--
-- Antes: anular una venta de 1 docena restauraba 1 unidad (no 12).
-- Ahora: lee variant_id de transaction_items, busca conversion_factor,
-- y restaura v_qty * conversion_factor unidades.
-- ============================================================================

DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx RECORD; v_item RECORD;
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore integer;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status = 'cancelled' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions SET status = 'cancelled', cancelled_at = v_eff, void_reason = p_reason WHERE id = p_transaction_id;

  -- FIX-G9: Restaurar stock considerando conversion_factor de variantes
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    -- FIX-G9: restaurar unidades convertidas (1 docena = 12 unidades)
    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      v_item.product_id, v_tx.store_id, v_units_to_restore, 'sale_void',
      p_transaction_id::text, v_tx.seller_id, v_item.variant_id, p_transaction_id,
      NULL, 'Void: ' || COALESCE(p_reason,''), v_eff
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (auth.uid(), v_tx.store_id, 'sale_voided', 'transactions', p_transaction_id,
    jsonb_build_object('reason',p_reason,'voided_at',v_eff,'total',v_tx.total_amount));

  RETURN jsonb_build_object('status','success','transaction_id',p_transaction_id);
END;
$func$;

COMMENT ON FUNCTION public.void_transaction IS
  'Anula una venta restaurando stock. FIX-G9: considera variant_id y
  conversion_factor al restaurar — anular 1 docena restaura 12 unidades.';

NOTIFY pgrst, 'reload schema';
