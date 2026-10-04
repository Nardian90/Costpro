-- ============================================================================
-- ENERVIDA-EXCEL-IMPORT (2026-10-04) — Corrección de consistencia APROBADA (1 línea)
-- perform_inventory_adjustment: p_skip_access_check := TRUE
--
-- Contexto: el RPC ya valida acceso en su entrada con
--   has_store_access_as(v_caller_uid, p_store_id)  [v_caller_uid resuelto con
--   patrón service_role COALESCE(p_user_id, auth.uid())], pero delegaba al
--   escritor interno register_stock_movement con p_skip_access_check =
--   (v_caller_uid IS NULL). Bajo service_role con p_user_id ese flag quedaba
--   en FALSE y el escritor interno exigía una sesión JWT (auth.uid() nulo)
--   → 'Unauthorized store access'. Los otros 6 RPCs certificados
--   (create_sale_v2, create_vale_salida, register_reception,
--   create_devolution_v2, close_production_order_v2, register_supplier_payment)
--   pasan p_skip_access_check := TRUE tras su propio gate. Esta migración
--   alinea perform_inventory_adjustment con ese patrón.
-- Cambio: exactamente 1 línea. Sin cambios de firma, RLS, grants ni lógica.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);
  v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);

  IF p_quantity_delta > 0 THEN
    -- DF-01: blend vía escritor único (antes: CASE dentro del UPDATE)
    PERFORM public.fn_recalc_wac(p_store_id, p_product_id, 'adjustment_plus',
                 p_quantity_delta, v_costo_unitario_movimiento,
                 jsonb_build_object('rpc','perform_inventory_adjustment','reason',p_reason));
  END IF;
  -- Δ<0: WAC invariante (correcto por diseño A1/salida pura)

  UPDATE public.products
    SET stock_current = v_nuevo_stock, updated_at = v_effective_date
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
    p_skip_access_check := TRUE
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock,
    'new_cost_average', (SELECT cost_average FROM public.products WHERE id=p_product_id AND store_id=p_store_id));
END $function$
