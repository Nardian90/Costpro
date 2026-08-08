-- ══════════════════════════════════════════════════════════════════════
-- F-16 G2 — Fix receive_production_output
--
-- Cambios:
-- 1. Añadir parámetros p_user_id, p_idempotency_key
-- 2. SELECT FOR UPDATE en production_orders (validar status='in_progress')
-- 3. has_store_access validation
-- 4. Validar p_quantity > 0
-- 5. Snapshot: output_total_cost + output_unit_cost al recibir output
-- 6. Idempotency: si idempotency_key ya existe, retornar resultado anterior
-- 7. audit_logs global
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.receive_production_output(
  p_order_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_user_id UUID;
  v_qty_int INTEGER;
  v_order_status TEXT;
  v_order_store_id UUID;
  v_existing_result JSONB;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_param_hash TEXT;
BEGIN
  -- ─── 0. Idempotency ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || p_product_id::text || p_quantity::text || p_store_id::text);

    SELECT metadata->>'result'
    INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_OUTPUT_RECEIVED'
      AND record_id = p_order_id::text
      AND metadata->>'idempotency_key' = p_idempotency_key
    LIMIT 1;

    IF v_existing_result IS NOT NULL THEN
      -- Verificar que los parámetros coinciden
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE con status check ───
  SELECT status, store_id INTO v_order_status, v_order_store_id
  FROM production_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  IF v_order_status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_IN_PROGRESS: status % is not in_progress', v_order_status;
  END IF;

  -- ─── 2. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Validar que el producto pertenece a la tienda ───
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND store_id = v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE';
  END IF;

  -- ─── 4. Validar quantity > 0 ───
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_quantity must be > 0';
  END IF;

  -- ─── 5. Calcular costo total de materiales ───
  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items
  WHERE order_id = p_order_id AND actual_qty > 0;

  -- ─── 6. Calcular nuevo WAC ───
  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id FOR UPDATE;

  v_new_stock := v_current_stock + p_quantity;
  v_new_cost := CASE WHEN v_new_stock > 0
    THEN (v_current_stock * v_current_cost + v_total_materials_cost) / v_new_stock
    ELSE v_total_materials_cost / GREATEST(p_quantity, 1)
  END;

  -- ─── 7. Actualizar production_orders (output + snapshot) ───
  UPDATE production_orders SET
    output_product_id = p_product_id,
    output_quantity = p_quantity,
    output_total_cost = v_total_materials_cost,
    output_unit_cost = CASE WHEN p_quantity > 0 THEN v_total_materials_cost / p_quantity ELSE 0 END,
    updated_at = now()
  WHERE id = p_order_id;

  -- ─── 8. Actualizar cost_average (WAC) ───
  UPDATE products SET
    cost_average = v_new_cost,
    cost_price = v_new_cost,
    updated_at = now()
  WHERE id = p_product_id;

  -- ─── 9. Registrar movimiento de stock ───
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  v_qty_int := GREATEST(p_quantity, 0)::integer;

  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := v_qty_int,
    p_movement_type := 'production_in',
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_new_cost,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid,
    p_skip_access_check := TRUE
  );

  -- ─── 10. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_OUTPUT_RECEIVED', 'production_orders', p_order_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'quantity', p_quantity,
      'total_materials_cost', v_total_materials_cost,
      'unit_cost', v_new_cost,
      'previous_wac', v_current_cost,
      'new_wac', v_new_cost,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'new_wac', v_new_cost, 'new_stock', v_new_stock)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'new_wac', v_new_cost,
    'new_stock', v_new_stock,
    'total_materials_cost', v_total_materials_cost
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.receive_production_output(uuid, uuid, numeric, uuid, uuid, text) TO authenticated;
