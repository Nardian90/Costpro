-- DECLARED FINAL STATE (Git) de receive_to_warehouse
-- fuente: 20260727000012_v2_12_18_fix_5_residual_is_not_null.sql stmt#26

CREATE OR REPLACE FUNCTION public.receive_to_warehouse(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_lot_number text DEFAULT NULL::text,
  p_expiration_date date DEFAULT NULL::date,
  p_user_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_movement_id UUID;
  v_new_stock NUMERIC;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT explícito
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar producto pertenece a la store
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND store_id = p_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND';
  END IF;

  -- Registrar movimiento
  v_movement_id := public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_uid,
    p_quantity := p_quantity,
    p_movement_type := 'purchase',
    p_reference_doc := NULL,
    p_unit_cost := p_unit_cost,
    p_reason := COALESCE(p_reason, 'Recepción a almacén'),
    p_operation_date := NOW(),
    p_skip_access_check := TRUE
  );

  -- Actualizar stock + WAC
  SELECT stock_current INTO v_new_stock FROM public.products WHERE id = p_product_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('RECEIVE_TO_WAREHOUSE', 'products', p_product_id, p_store_id, v_uid,
    jsonb_build_object('quantity', p_quantity, 'unit_cost', p_unit_cost, 'warehouse_id', p_warehouse_id, 'lot', p_lot_number));

  RETURN jsonb_build_object('status', 'success', 'movement_id', v_movement_id, 'new_stock', v_new_stock);
END;
$function$
