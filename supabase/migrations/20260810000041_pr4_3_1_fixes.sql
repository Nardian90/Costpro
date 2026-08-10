-- ============================================================================
-- PR-4.3.1 — Fix 1 + Fix 2
-- ============================================================================
-- Fix 1: create_devolution_v2 — eliminar overload dual + reconstruir como
--        función única con orden de parámetros de v2.19.4 + body de PR-4.3
--        (cost_at_sale lookup + register_stock_movement con costo correcto
--         + SIN INSERT directo a kardex_entries)
--
-- Fix 2: duplicate_inventory_adjustment_v2 — corregir nombres de columnas
--        inexistentes (adjustment_type, expected_qty, counted_qty, difference)
--        por los nombres reales del schema (reason, expected_quantity,
--        counted_quantity; difference es GENERATED, no se INSERTa)
--
-- NO toca datos históricos. NO hace backfill. NO elimina duplicados históricos.
-- Solo cambia comportamiento futuro.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 1: create_devolution_v2 — único overload LIVE
-- ════════════════════════════════════════════════════════════════════════════

-- 1.1 Eliminar AMBOS overloads existentes (v2.19.4 con bugs + PR-4.3 inalcanzable)
DROP FUNCTION IF EXISTS public.create_devolution_v2(
  uuid, jsonb, text, uuid, uuid, text, uuid, text, text, text
);
DROP FUNCTION IF EXISTS public.create_devolution_v2(
  uuid, jsonb, text, uuid, uuid, uuid, text, text, text, text
);

-- 1.2 Crear UNA función con orden de v2.19.4 + body de PR-4.3
--     Orden: p_payment_method ANTES de p_customer_id (compatibilidad API)
CREATE OR REPLACE FUNCTION public.create_devolution_v2(
  p_store_id uuid,
  p_items jsonb,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_original_transaction_id uuid DEFAULT NULL::uuid,
  p_payment_method text DEFAULT 'cash',
  p_customer_id uuid DEFAULT NULL::uuid,
  p_customer_name text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
  v_devolution_cost numeric;
  v_total numeric := 0;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing);
    END IF;
  END IF;

  -- Autorización (patrón canónico v2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar cross-store (preservado de v2.19.4)
  IF p_original_transaction_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_original_transaction_id AND store_id = p_store_id) THEN
      RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
    END IF;
  END IF;

  -- Numeración secuencial (preservado de v2.19.4 / F-H1)
  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    -- PR-4.3: determinar costo histórico correcto para kardex
    -- 1. Intentar cost_at_sale de la transacción original
    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id
        AND product_id = v_pid
      LIMIT 1;
    END IF;

    -- 2. Fallback: WAC actual (documentado como fallback operativo, no histórico)
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost
      FROM public.products WHERE id = v_pid;
    END IF;

    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    -- register_stock_movement con costo correcto → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_pid,
      p_store_id := p_store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_qty,
      p_movement_type := 'return',
      p_sale_id := v_devolution_id,
      p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement ahora genera la kardex con
    -- movement_type='devolution_in' y unit_cost=v_devolution_cost (correcto)
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items)
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_devolution_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution_v2 TO service_role;

COMMENT ON FUNCTION public.create_devolution_v2 IS
  'PR-4.3.1:单一 overload. Usa cost_at_sale cuando hay original_transaction_id, fallback a cost_average. Trigger es autoridad única para kardex.';

-- ════════════════════════════════════════════════════════════════════════════
-- Fix 2: duplicate_inventory_adjustment_v2 — corregir nombres de columnas
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.duplicate_inventory_adjustment_v2(uuid, uuid);

CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment_v2(
  p_original_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_new_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
BEGIN
  -- 1. SELECT FOR UPDATE original
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND';
  END IF;

  -- 2. Autorización (patrón canónico v2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. INSERT new adjustment
  --    PR-4.3.1 Fix: usar 'reason' (enum) en vez de 'adjustment_type' (inexistente)
  --    No incluir 'updated_at' (no existe en inventory_adjustments)
  --    No incluir 'difference' (es GENERATED en inventory_adjustment_items)
  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_new_id, v_original.store_id, 'confirmed',
    v_original.reason,
    v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  -- 4. FOR each item: copy + register_stock_movement (NO INSERT directo a kardex)
  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_original_id
  LOOP
    -- PR-4.3.1 Fix: usar expected_quantity, counted_quantity (no expected_qty, counted_qty)
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);

    IF v_diff = 0 THEN
      CONTINUE;
    END IF;

    -- PR-4.3.1 Fix: no incluir difference en el INSERT (es GENERATED)
    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity
    );

    -- register_stock_movement genera stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_new_id,
      p_unit_cost := 0,
      p_reason := 'Duplicación de ajuste'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement genera la kardex con
    -- movement_type='adjustment'
  END LOOP;

  -- 5. Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ADJUSTMENT_DUPLICATED_V2', 'inventory_adjustments', v_new_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('original_id', p_original_id, 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','new_adjustment_id',v_new_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_inventory_adjustment_v2 TO service_role;

COMMENT ON FUNCTION public.duplicate_inventory_adjustment_v2 IS
  'PR-4.3.1: corregidos nombres de columnas (reason, expected_quantity, counted_quantity; difference es GENERATED). Trigger es autoridad única para kardex.';
