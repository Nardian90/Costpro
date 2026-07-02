-- ============================================================================
-- Migration: 20260702000007_fix_confirm_pending_update_price.sql
-- Fix G8: confirm_pending_reception actualiza products.price y price_currency
--
-- Cuando se confirma una recepción pendiente, los items pueden tener
-- sale_price y price_currency configurados. Antes se ignoraban.
-- Ahora se actualizan en products si están presentes.
-- ============================================================================

DROP FUNCTION IF EXISTS public.confirm_pending_reception(uuid, uuid, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_item RECORD;
  v_current_stock NUMERIC;
  v_current_avg NUMERIC;
  v_new_stock NUMERIC;
  v_new_avg NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  FOR v_item IN
    SELECT ri.product_id, ri.quantity, ri.unit_cost, ri.tasa_cambio_recepcion,
           ri.moneda_recepcion
    FROM receipt_items ri
    WHERE ri.receipt_id = p_receipt_id
  LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;

    v_new_avg := CASE WHEN v_new_stock > 0
      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_unit_cost_cup) / v_new_stock
      ELSE v_unit_cost_cup END;

    UPDATE products
    SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_item.quantity, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  -- FIX-G8: Actualizar products.price y price_currency desde receipt_items
  -- si el item tiene sale_price configurado
  UPDATE products p
  SET price = ri.sale_price,
      price_currency = COALESCE(ri.moneda_recepcion, 'CUP'),
      updated_at = v_effective_date
  FROM receipt_items ri
  JOIN receipts r ON ri.receipt_id = r.id
  WHERE ri.receipt_id = p_receipt_id
    AND ri.product_id = p.id
    AND ri.sale_price IS NOT NULL
    AND ri.sale_price > 0;

  UPDATE receipts SET status = 'active', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END;
$function$;

COMMENT ON FUNCTION public.confirm_pending_reception IS
  'Confirma una recepción pendiente. FIX-G8: actualiza products.price y
  price_currency desde receipt_items.sale_price cuando está configurado.
  FIX-P0: WAC usa unit_cost * tasa_cambio_recepcion.';

NOTIFY pgrst, 'reload schema';
