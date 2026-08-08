-- ══════════════════════════════════════════════════════════════════════
-- F-16 G7 — RPC create_production_order_v2 (atomic)
-- Atomic: INSERT order + INSERT items + register_supplier_payment + audit_logs
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_production_order_v2(
  p_store_id uuid,
  p_order_type text DEFAULT 'service',
  p_customer_name text DEFAULT NULL,
  p_customer_ci text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_customer_address text DEFAULT NULL,
  p_budget_total numeric DEFAULT 0,
  p_budget_currency text DEFAULT 'CUP',
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_advance_amount numeric DEFAULT 0,
  p_advance_method text DEFAULT NULL,
  p_advance_currency text DEFAULT 'CUP',
  p_created_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_item_count integer := 0;
  v_caller_uid uuid := COALESCE(p_created_by, auth.uid());
  v_existing_id uuid;
  v_param_hash text;
BEGIN
  -- ─── 0. Idempotency ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_store_id::text || p_order_type || p_budget_total::text || COALESCE(p_items::text, ''));
    SELECT id INTO v_existing_id FROM production_orders WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      IF md5(p_store_id::text || p_order_type || p_budget_total::text || COALESCE(p_items::text, '')) != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN jsonb_build_object('status', 'success', 'order_id', v_existing_id, 'idempotent', true);
    END IF;
  END IF;

  -- ─── 1. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. Validar order_type ───
  IF p_order_type NOT IN ('production', 'service', 'work') THEN
    RAISE EXCEPTION 'ERR_INVALID_ORDER_TYPE';
  END IF;

  -- ─── 3. INSERT order (order_number auto-generado por trigger) ───
  INSERT INTO production_orders (
    store_id, order_type, status, budget_total, budget_currency,
    customer_name, customer_ci, customer_phone, customer_address,
    description, notes, created_by,
    paid_amount, payment_status,
    idempotency_key,
    advance_amount, advance_method, advance_currency
  ) VALUES (
    p_store_id, p_order_type, 'draft', p_budget_total, p_budget_currency,
    p_customer_name, p_customer_ci, p_customer_phone, p_customer_address,
    p_description, p_notes, v_caller_uid,
    0, 'unpaid',
    p_idempotency_key,
    p_advance_amount, p_advance_method, p_advance_currency
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  -- ─── 4. INSERT items ───
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      -- Validar que el producto pertenece a la store
      IF NOT EXISTS (SELECT 1 FROM products WHERE id = (v_item->>'product_id')::uuid AND store_id = p_store_id) THEN
        RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: %', v_item->>'product_id';
      END IF;

      INSERT INTO production_order_items (
        order_id, product_id, variant_id, budgeted_qty, budgeted_unit_cost, status
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::uuid,
        NULLIF(v_item->>'variant_id', '')::uuid,
        (v_item->>'budgeted_qty')::numeric,
        (v_item->>'budgeted_unit_cost')::numeric,
        'pending'
      );
      v_item_count := v_item_count + 1;
    END LOOP;
  END IF;

  -- ─── 5. Registrar anticipo (atómico) ───
  IF p_advance_amount > 0 AND p_advance_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := p_store_id,
      p_ref_type := CASE WHEN p_order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := v_order_id,
      p_amount := p_advance_amount,
      p_payment_method := p_advance_method,
      p_paid_by := v_caller_uid,
      p_currency := p_advance_currency,
      p_idempotency_key := 'advance-' || v_order_id::text
    );
  END IF;

  -- ─── 6. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'PRODUCTION_ORDER_CREATED', 'production_orders', v_order_id,
    jsonb_build_object(
      'order_number', v_order_number,
      'order_type', p_order_type,
      'budget_total', p_budget_total,
      'items_count', v_item_count,
      'advance_amount', p_advance_amount,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', v_order_id,
    'order_number', v_order_number,
    'items_count', v_item_count
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_production_order_v2(uuid, text, text, text, text, text, numeric, text, text, text, jsonb, numeric, text, text, uuid, text) TO authenticated;
