-- DECLARED FINAL STATE (Git) de void_reception_with_reversal
-- fuente: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql stmt#22

CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
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
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  -- V2.5 H2d: autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  FOR v_item IN
    SELECT product_id, quantity, unit_cost, tasa_cambio_recepcion
    FROM receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) - v_item.quantity;

    IF v_new_stock <= 0 THEN
      v_new_avg := v_current_avg;
    ELSE
      v_new_avg := (COALESCE(v_current_stock, 0) * COALESCE(v_current_avg, 0)
                   - v_item.quantity * v_unit_cost_cup) / v_new_stock;
    END IF;

    UPDATE products
      SET stock_current = GREATEST(0, v_new_stock), cost_average = v_new_avg, updated_at = v_effective_date
      WHERE id = v_item.product_id;
  END LOOP;

  UPDATE receipts SET status = 'voided', updated_at = v_effective_date WHERE id = p_receipt_id;
END;
$function$
