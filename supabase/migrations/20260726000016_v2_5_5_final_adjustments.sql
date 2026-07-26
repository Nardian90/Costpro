-- V2.5.5 — Ajustes finales tras tests
--
-- 1. create_transfer: añadir p_user_id opcional para service_role.
--    auth.uid() es NULL con service_role, y el UUID sentinela falla FK.
--    Mejor: aceptar p_user_id explícito.
--
-- 2. perform_inventory_adjustment: actualizar products.stock_current
--    (no inventory.quantity que tiene trigger de immutabilidad).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. create_transfer con p_user_id
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_server_unit_cost NUMERIC;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
    v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
    -- V2.5 H1a: autorización BOLA
    IF v_caller_uid IS NOT NULL THEN
      IF NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
      END IF;
      IF NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
      END IF;
    END IF;

    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id,
      v_caller_uid,
      p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date
    );

    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        SELECT cost_average INTO v_server_unit_cost
        FROM public.products
        WHERE id = v_item.product_id AND store_id = p_origin_store_id;
        IF v_server_unit_cost IS NULL THEN
          v_server_unit_cost := 0;
        END IF;

        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_server_unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. perform_inventory_adjustment — usar products.stock_current (no inventory.quantity)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(
  p_store_id UUID,
  p_product_id UUID,
  p_quantity_delta NUMERIC,
  p_reason TEXT,
  p_user_id UUID,
  p_unit_cost_adjustment NUMERIC DEFAULT NULL,
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_nuevo_costo_total NUMERIC;
  v_nuevo_costo_unitario NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- V2.5 H2a: autorización por TIENDA
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  -- V2.5.5: usar products.stock_current (inventory.quantity tiene trigger inmutable)
  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
    v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;
  END IF;

  -- V2.5.5: UPDATE en products (no en inventory que tiene trigger)
  UPDATE public.products
    SET stock_current = v_nuevo_stock,
        cost_average = CASE WHEN p_quantity_delta > 0 THEN v_nuevo_costo_unitario ELSE cost_average END,
        updated_at = v_effective_date
    WHERE id = p_product_id AND store_id = p_store_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date,
    p_skip_access_check := (v_caller_uid IS NULL)  -- V2.5.5: bypass si service_role
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock, 'new_cost_average', v_costo_promedio_actual);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone) TO service_role;

NOTIFY pgrst, 'reload schema';
