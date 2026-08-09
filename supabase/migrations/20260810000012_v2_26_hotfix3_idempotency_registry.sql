-- F-16 HOTFIX v3 — Fix idempotency check bypassing RLS on audit_logs
-- Problem: SET LOCAL role 'authenticated' makes SECURITY DEFINER functions
-- subject to RLS on audit_logs. The idempotency SELECT doesn't find entries.
-- Fix: Use a dedicated idempotency_keys table instead of audit_logs for checks.

CREATE TABLE IF NOT EXISTS public.idempotency_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  record_id uuid NOT NULL,
  param_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_key_operation
  ON public.idempotency_registry (idempotency_key, operation)
  WHERE idempotency_key IS NOT NULL;

-- RLS: service_role can do everything, authenticated can only read their own
ALTER TABLE public.idempotency_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY idem_reg_service_role_all ON public.idempotency_registry
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Helper function: check_and_register_idempotency
CREATE OR REPLACE FUNCTION public.check_idempotency(
  p_key text, p_operation text, p_record_id uuid, p_param_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_existing jsonb;
BEGIN
  IF p_key IS NULL THEN RETURN NULL; END IF;
  
  SELECT result INTO v_existing FROM idempotency_registry
  WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
  
  IF v_existing IS NOT NULL THEN
    SELECT param_hash INTO v_existing FROM idempotency_registry
    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    
    IF v_existing::text != p_param_hash THEN
      RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
    END IF;
    
    SELECT result INTO v_existing FROM idempotency_registry
    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    RETURN v_existing;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Helper function: register_idempotency
CREATE OR REPLACE FUNCTION public.register_idempotency(
  p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  INSERT INTO idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
  VALUES (p_key, p_operation, p_record_id, p_param_hash, p_result)
  ON CONFLICT (idempotency_key, operation) DO NOTHING;
END;
$$;

-- Now update G3 withdraw_production_item to use the helper
CREATE OR REPLACE FUNCTION public.withdraw_production_item(
  p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid,
  p_user_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_qty_int INTEGER; v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_unit_cost::text || '|' || p_store_id::text || '|' || COALESCE(p_user_id::text, ''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  v_qty_int := GREATEST(p_qty, 0)::integer;
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty, actual_unit_cost = p_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(p_product_id := v_product_id, p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int, p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text, p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost, p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id, p_skip_access_check := TRUE);

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id);
  
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost', p_unit_cost, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$func$;
GRANT EXECUTE ON FUNCTION public.withdraw_production_item(uuid, numeric, numeric, uuid, uuid, text) TO authenticated;
