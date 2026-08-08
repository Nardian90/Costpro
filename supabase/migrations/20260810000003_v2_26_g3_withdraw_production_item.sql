-- ══════════════════════════════════════════════════════════════════════
-- F-16 G3 — Fix withdraw_production_item
--
-- Cambios:
-- 1. Añadir parámetros p_user_id, p_idempotency_key
-- 2. has_store_access validation
-- 3. SELECT FOR UPDATE en production_order_items
-- 4. Idempotency con idempotency_key + param_hash
-- 5. audit_logs global
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.withdraw_production_item(
  p_item_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_store_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
  v_user_id UUID;
  v_qty_int INTEGER;
  v_order_store_id UUID;
  v_order_status TEXT;
  v_existing_result JSONB;
  v_param_hash TEXT;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- ─── 0. Idempotency ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || p_qty::text || p_unit_cost::text || p_store_id::text);

    SELECT metadata->>'result'
    INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ITEM_WITHDRAWN'
      AND metadata->>'idempotency_key' = p_idempotency_key
    LIMIT 1;

    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. Cargar item con FOR UPDATE ───
  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND';
  END IF;

  -- ─── 2. Cargar orden para validar store + status ───
  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar que la orden está en progreso ───
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;

  -- ─── 5. Validar qty > 0 ───
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_qty must be > 0';
  END IF;

  v_qty_int := GREATEST(p_qty, 0)::integer;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- ─── 6. Actualizar el item ───
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = p_unit_cost,
    withdrawn_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END,
    updated_at = now()
  WHERE id = p_item_id;

  -- ─── 7. Registrar movimiento de stock ───
  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int,
    p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object(
      'order_id', v_order_id,
      'product_id', v_product_id,
      'qty', p_qty,
      'unit_cost', p_unit_cost,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success')
    )
  );

  RETURN jsonb_build_object('status', 'success', 'order_id', v_order_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid, numeric, numeric, uuid, uuid, text) TO authenticated;
