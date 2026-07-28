-- ════════════════════════════════════════════════════════════════════════
-- V2.12.18 — Cerrar inconsistencia: 5 funciones con patrón residual
--
-- Bug residual detectado por el usuario tras V2.12.12:
--   V2.12.12 corrigió 22 funciones con patrón `IS NOT NULL AND NOT` → `IS NULL OR NOT`.
--   Pero 5 funciones se quedaron con variantes del patrón viejo:
--
--   Patrón vulnerable (3 funciones):
--     IF v_caller_uid IS NOT NULL THEN
--       IF NOT public.has_store_access_as(...) THEN RAISE; END IF;
--     END IF;
--   → Si v_caller_uid IS NULL (service_role sin p_user_id), se OMITE el bloque
--     entero y la función procede sin autorización.
--
--   Patrón débil (2 funciones, no vulnerable pero inconsistente):
--     IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE; END IF;
--   → has_store_access_as(NULL, ...) retorna FALSE → NOT FALSE = TRUE → raise.
--   → Funciona, pero no es explícito sobre el caso NULL. Por consistencia
--     con las 27 funciones ya corregidas, lo alineamos a `IS NULL OR NOT`.
--
-- Funciones afectadas:
--   1. create_transfer (vulnerable - patrón IS NOT NULL THEN)
--   2. void_transaction (vulnerable - patrón IS NOT NULL THEN)
--   3. set_transfer_approval_rule (vulnerable - patrón IS NOT NULL THEN)
--   4. close_fiscal_period (débil - patrón IF NOT directo)
--   5. receive_to_warehouse (débil - patrón IF NOT directo)
--
-- Explotabilidad real: baja (requiere service_role sin p_user_id explícito,
-- algo que no ocurre en el flujo normal de la API). Pero es la misma clase
-- de bug que ya cerramos en V2.12.12, así que lo cerramos por consistencia.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- Necesario: DROP functions que cambian return type (uuid → jsonb en create_transfer,
-- uuid → jsonb en set_transfer_approval_rule). Las otras 3 mantienen return type
-- pero las dropeamos también para evitar conflictos de CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.void_transaction(uuid, text, timestamp with time zone, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.set_transfer_approval_rule(uuid, uuid, numeric, numeric, text[], boolean, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.close_fiscal_period(uuid, integer, integer, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.receive_to_warehouse(uuid, uuid, numeric, numeric, uuid, text, date, uuid, text) CASCADE;

-- ────────────────────────────────────────────────────────────────────────
-- 1. create_transfer
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL::text,
  p_transaction_id uuid DEFAULT NULL::uuid,
  p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
  v_item JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_cost NUMERIC := 0;
  v_count INTEGER := 0;
  v_dest_product UUID;
  v_origin_product RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT (consistencia con V2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar que no sea la misma store
  IF p_origin_store_id = p_destination_store_id THEN
    RAISE EXCEPTION 'ERR_SAME_STORE';
  END IF;

  -- Insertar transferencia
  INSERT INTO public.transfers (
    id, origin_store_id, destination_store_id, status, notes, total_cost,
    created_by, created_at
  ) VALUES (
    v_transfer_id, p_origin_store_id, p_destination_store_id, 'PENDIENTE', p_notes, 0,
    v_caller_uid, v_effective_date
  );

  -- Procesar items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    -- V2.12.9: leer costo del server (no confiar en p_items[].unit_cost)
    SELECT id, stock_current, cost_average INTO v_origin_product
    FROM public.products
    WHERE id = v_pid AND store_id = p_origin_store_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid; END IF;

    v_unit_cost := v_origin_product.cost_average;
    v_line_total := v_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_line_total;
    v_count := v_count + 1;

    -- Buscar o crear producto en destino
    SELECT id INTO v_dest_product FROM public.products WHERE sku = (SELECT sku FROM public.products WHERE id = v_pid) AND store_id = p_destination_store_id LIMIT 1;

    INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, total)
    VALUES (v_transfer_id, v_pid, v_qty, v_unit_cost, v_line_total);
  END LOOP;

  UPDATE public.transfers SET total_cost = v_total_cost WHERE id = v_transfer_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_TRANSFER', 'transfers', v_transfer_id, p_origin_store_id, v_caller_uid,
    jsonb_build_object('dest', p_destination_store_id, 'total_cost', v_total_cost, 'items_count', v_count));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id, 'total_cost', v_total_cost);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone, uuid) IS
'V2.12.18: patrón IS NULL OR NOT aplicado (consistencia V2.12.12). V2.12.9: anti-spoofing + costo server-side.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. void_transaction
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_operation_date timestamp with time zone DEFAULT now(),
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tx RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;

  -- V2.12.18: patrón IS NULL OR NOT
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- Reversar stock via register_stock_movement
  PERFORM public.register_stock_movement(
    p_product_id := ti.product_id,
    p_store_id := v_tx.store_id,
    p_user_id := v_caller_uid,
    p_quantity := ti.quantity,
    p_movement_type := 'sale_void',
    p_reference_doc := p_transaction_id::text,
    p_unit_cost := ti.cost_at_sale,
    p_reason := 'Void de venta',
    p_operation_date := v_eff,
    p_skip_access_check := TRUE
  )
  FROM public.transaction_items ti
  WHERE ti.transaction_id = p_transaction_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) IS
'V2.12.18: patrón IS NULL OR NOT aplicado. V2.12.9: anti-spoofing p_user_id.';

-- ────────────────────────────────────────────────────────────────────────
-- 3. set_transfer_approval_rule
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_transfer_approval_rule(
  p_tenant_id uuid,
  p_store_id uuid,
  p_threshold_amount numeric DEFAULT NULL::numeric,
  p_threshold_quantity numeric DEFAULT NULL::numeric,
  p_approver_roles text[] DEFAULT ARRAY['admin'::text, 'manager'::text],
  p_is_active boolean DEFAULT true,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_existing UUID;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT (antes era IF v_caller_uid IS NOT NULL THEN ... END IF)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el usuario sea admin o manager
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_user_role IS NULL OR (v_user_role <> 'admin' AND v_user_role <> 'superadmin' AND NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text])) THEN
    RAISE EXCEPTION 'ERR_INSUFFICIENT_ROLE';
  END IF;

  -- Upsert
  SELECT id INTO v_existing FROM public.transfer_approval_rules
    WHERE store_id = p_store_id AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE public.transfer_approval_rules
      SET threshold_amount = COALESCE(p_threshold_amount, threshold_amount),
          threshold_quantity = COALESCE(p_threshold_quantity, threshold_quantity),
          approver_roles = COALESCE(p_approver_roles, approver_roles),
          is_active = COALESCE(p_is_active, is_active),
          updated_at = NOW()
      WHERE id = v_existing;
  ELSE
    INSERT INTO public.transfer_approval_rules (tenant_id, store_id, threshold_amount, threshold_quantity, approver_roles, is_active, created_at, updated_at)
    VALUES (p_tenant_id, p_store_id, p_threshold_amount, p_threshold_quantity, p_approver_roles, p_is_active, NOW(), NOW())
    RETURNING id INTO v_existing;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SET_TRANSFER_APPROVAL_RULE', 'transfer_approval_rules', v_existing, p_store_id, v_caller_uid,
    jsonb_build_object('threshold_amount', p_threshold_amount, 'threshold_quantity', p_threshold_quantity, 'is_active', p_is_active));

  RETURN jsonb_build_object('status', 'success', 'rule_id', v_existing);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_transfer_approval_rule(uuid, uuid, numeric, numeric, text[], boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(uuid, uuid, numeric, numeric, text[], boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_transfer_approval_rule(uuid, uuid, numeric, numeric, text[], boolean, uuid) TO service_role;

COMMENT ON FUNCTION public.set_transfer_approval_rule(uuid, uuid, numeric, numeric, text[], boolean, uuid) IS
'V2.12.18: patrón IS NULL OR NOT aplicado. V2.12.9: anti-spoofing p_user_id.';

-- ────────────────────────────────────────────────────────────────────────
-- 4. close_fiscal_period (patrón débil → alineado a IS NULL OR NOT)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_fiscal_period(
  p_store_id uuid,
  p_year integer,
  p_month integer,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_period_start DATE := make_date(p_year, p_month, 1);
  v_period_end DATE := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_tx_count INTEGER;
  v_revenue NUMERIC := 0;
  v_closed_id UUID;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT explícito (antes: IF NOT has_store_access_as(v_uid, ...))
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que no esté ya cerrado
  IF EXISTS (SELECT 1 FROM public.fiscal_period_closures WHERE store_id = p_store_id AND year = p_year AND month = p_month) THEN
    RAISE EXCEPTION 'ERR_PERIOD_ALREADY_CLOSED';
  END IF;

  -- Calcular revenue del período
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0) INTO v_tx_count, v_revenue
  FROM public.transactions
  WHERE store_id = p_store_id
    AND status = 'completed'
    AND completed_at >= v_period_start
    AND completed_at <= v_period_end + INTERVAL '1 day';

  -- Insertar cierre
  INSERT INTO public.fiscal_period_closures (store_id, year, month, period_start, period_end, transaction_count, total_revenue, closed_by, closed_at)
  VALUES (p_store_id, p_year, p_month, v_period_start, v_period_end, v_tx_count, v_revenue, v_uid, NOW())
  RETURNING id INTO v_closed_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CLOSE_FISCAL_PERIOD', 'fiscal_period_closures', v_closed_id, p_store_id, v_uid,
    jsonb_build_object('period', p_year || '-' || LPAD(p_month::text, 2, '0'), 'tx_count', v_tx_count, 'revenue', v_revenue));

  RETURN jsonb_build_object('status', 'success', 'closure_id', v_closed_id, 'tx_count', v_tx_count, 'revenue', v_revenue);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.close_fiscal_period(uuid, integer, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(uuid, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(uuid, integer, integer, uuid) TO service_role;

COMMENT ON FUNCTION public.close_fiscal_period(uuid, integer, integer, uuid) IS
'V2.12.18: patrón IS NULL OR NOT explícito (consistencia V2.12.12). V2.12.9: anti-spoofing.';

-- ────────────────────────────────────────────────────────────────────────
-- 5. receive_to_warehouse (patrón débil → alineado a IS NULL OR NOT)
-- ────────────────────────────────────────────────────────────────────────
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
$function$;

REVOKE EXECUTE ON FUNCTION public.receive_to_warehouse(uuid, uuid, numeric, numeric, uuid, text, date, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_to_warehouse(uuid, uuid, numeric, numeric, uuid, text, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_to_warehouse(uuid, uuid, numeric, numeric, uuid, text, date, uuid, text) TO service_role;

COMMENT ON FUNCTION public.receive_to_warehouse(uuid, uuid, numeric, numeric, uuid, text, date, uuid, text) IS
'V2.12.18: patrón IS NULL OR NOT explícito (consistencia V2.12.12). V2.12.9: anti-spoofing.';

NOTIFY pgrst, 'reload schema';

COMMIT;
