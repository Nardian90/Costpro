CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_store_id UUID;
BEGIN
  -- 1. Obtener transacción (incluye store_id)
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;
  IF v_tx.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use reverse_transaction solo en tx completas'; END IF;

  -- 2. Validar acceso a la tienda (FIX V2.3: v_tx.store_id, NO p_transaction_id).
  -- Si v_uid es NULL significa que el caller es service_role (API server-side) → bypass.
  v_store_id := v_tx.store_id;
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Devolver stock por cada item + revertir lote + kardex
  FOR v_item IN
    SELECT product_id, quantity, variant_id FROM public.transaction_items WHERE transaction_id = p_transaction_id
  LOOP
    -- Devolver stock al producto
    UPDATE public.products
      SET stock_current = stock_current + v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id;

    -- Devolver stock al lote si estaba vinculado
    UPDATE public.product_lots
      SET quantity_remaining = quantity_remaining + v_item.quantity,
          status = CASE WHEN quantity_remaining + v_item.quantity > 0 THEN 'active' ELSE status END
      FROM public.transaction_item_lots til
      WHERE til.transaction_item_id IN (
        SELECT id FROM public.transaction_items
        WHERE transaction_id = p_transaction_id AND product_id = v_item.product_id
      ) AND til.lot_id = product_lots.id;

    -- Kardex: devolution_in (reversión de salida por venta)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_store_id, v_item.product_id, 'devolution_in', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_transaction_id, 'Reversión de venta ' || p_transaction_id, v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  -- 4. Marcar transacción como reversed
  UPDATE public.transactions
    SET status = 'reversed',
        reversed_at = now(),
        reversed_by = v_uid,
        reversal_reason = p_reason
    WHERE id = p_transaction_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transaction_id', p_transaction_id);
END;
$function$

