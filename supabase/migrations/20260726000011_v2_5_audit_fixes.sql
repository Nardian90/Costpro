-- ════════════════════════════════════════════════════════════════════════
-- V2.5 — FIX CRÍTICO AUDITORÍA MULTI-TIENDA (4 issues)
--
-- Auditoría: CostPro_Auditoria_MultiTienda_2026-07-25
-- Commit auditado: 1297e4d
-- Hallazgos a cerrar en esta migración:
--   H1a: create_transfer sin has_store_access (BOLA crítico)
--   H2a: perform_inventory_adjustment usa rol global no has_store_access
--   H2b: void_transaction sin autorización por tienda
--   H2c: confirm_pending_reception sin validar membresía
--   H2d: void_reception_with_reversal sin validar membresía
--   H3:  cancel_transfer no existe (feature rota en frontend)
--   Costo: create_transfer usa p_unit_cost del cliente (riesgo contable)
--
-- PATRÓN: cada RPC SECURITY DEFINER con store_id debe llamar
-- has_store_access(p_store_id) al inicio. Excepción: cuando el caller
-- es service_role (p_user_id IS NULL), bypass (se invoca desde API route
-- que ya hizo canManageStore).
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- H1a + Costo: create_transfer
--   - Añadir has_store_access(origin + destination)
--   - Ignorar p_unit_cost del cliente, usar products.cost_average
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.create_transfer(
  p_origin_store_id uuid,
  p_destination_store_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_transaction_id uuid DEFAULT NULL,
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_server_unit_cost NUMERIC;  -- V2.5: server-side, no cliente
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
    v_caller_uid UUID := auth.uid();
BEGIN
    -- V2.5 H1a: autorización BOLA — el caller debe tener acceso a AMBAS tiendas
    -- Si v_caller_uid IS NULL → service_role (desde API route que ya validó), bypass
    IF v_caller_uid IS NOT NULL THEN
      IF NOT public.has_store_access(p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
      END IF;
      IF NOT public.has_store_access(p_destination_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
      END IF;
    END IF;

    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id, v_caller_uid, p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date
    );

    -- V2.5 (Costo server-side): ignorar unit_cost del cliente y usar products.cost_average
    -- del store origen. Esto previene manipulación del WAC por parte del cliente.
    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,         -- ignorado, recalculado server-side
        tasa_cambio NUMERIC        -- ignorado, no se necesita (cost_average ya está en CUP)
      )
    LOOP
        SELECT cost_average INTO v_server_unit_cost
        FROM public.products
        WHERE id = v_item.product_id AND store_id = p_origin_store_id;
        IF v_server_unit_cost IS NULL THEN
          -- producto no existe en origen o no tiene cost_average: usar 0 y log
          v_server_unit_cost := 0;
        END IF;

        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_server_unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone) TO service_role;

COMMENT ON FUNCTION public.create_transfer(uuid, uuid, jsonb, text, uuid, timestamp with time zone) IS
'V2.5: Crea transferencia entre tiendas. (1) Autorización BOLA: has_store_access(origin+destination). (2) Costo server-side: ignora p_unit_cost del cliente, usa products.cost_average del store origen.';

-- ──────────────────────────────────────────────────────────────────────────
-- H2a: perform_inventory_adjustment
--   Cambiar has_role global por has_store_access(p_store_id)
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone);
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
  -- V2.5 H2a: autorización por TIENDA (no rol global)
  -- Si v_caller_uid IS NULL → service_role desde API route, bypass
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  SELECT COALESCE(cost_average, cost_price, 0) INTO v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id FOR UPDATE;

  SELECT COALESCE(quantity, 0) INTO v_stock_actual
  FROM public.inventory WHERE store_id = p_store_id AND product_id = p_product_id FOR UPDATE;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
    v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;
    UPDATE public.products SET cost_average = v_nuevo_costo_unitario WHERE id = p_product_id;
  END IF;

  UPDATE public.inventory
    SET quantity = v_nuevo_stock, updated_at = v_effective_date
    WHERE store_id = p_store_id AND product_id = p_product_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock, 'new_cost_average', v_costo_promedio_actual);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone) TO service_role;

COMMENT ON FUNCTION public.perform_inventory_adjustment(uuid, uuid, numeric, text, uuid, numeric, timestamp with time zone) IS
'V2.5 H2a: Ajuste de inventario. Autorización por TIENDA (has_store_access_as) en vez de rol global.';

-- ──────────────────────────────────────────────────────────────────────────
-- H2b: void_transaction — añadir has_store_access(v_tx.store_id)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx RECORD; v_item RECORD;
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore integer;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- V2.5 H2b: autorización por tienda
  IF v_caller_uid IS NOT NULL THEN
    SELECT store_id INTO v_tx.store_id FROM public.transactions WHERE id = p_transaction_id;
    IF v_tx.store_id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
    IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status = 'cancelled' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions SET status = 'cancelled', cancelled_at = v_eff, void_reason = p_reason WHERE id = p_transaction_id;

  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      v_item.product_id, v_tx.store_id, v_units_to_restore, 'sale_void',
      v_caller_uid, v_eff
    );
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'transaction_id', p_transaction_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) TO service_role;

COMMENT ON FUNCTION public.void_transaction(uuid, text, timestamp with time zone, uuid) IS
'V2.5 H2b: Anula venta. Autorización por TIENDA (has_store_access_as). Añadido p_user_id opcional para service_role.';

-- ──────────────────────────────────────────────────────────────────────────
-- H2c: confirm_pending_reception — añadir has_store_access(v_store_id)
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.confirm_pending_reception(uuid, uuid, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(
  p_receipt_id UUID,
  p_user_id UUID,
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
) RETURNS VOID
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
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- V2.5 H2c: autorización por tienda
  SELECT store_id INTO v_store_id FROM public.receipts
  WHERE id = p_receipt_id AND status = 'pending' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta pendiente';
  END IF;
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  FOR v_item IN
    SELECT product_id, quantity, unit_cost, tasa_cambio_recepcion
    FROM receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;

    IF v_new_stock = 0 THEN
      v_new_avg := v_current_avg;
    ELSE
      v_new_avg := (
        (COALESCE(v_current_stock, 0) * COALESCE(v_current_avg, 0)) +
        (v_item.quantity * v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0))
      ) / v_new_stock;
    END IF;

    UPDATE products
      SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
      WHERE id = v_item.product_id;
  END LOOP;

  UPDATE receipts SET status = 'active', reception_date = v_effective_date WHERE id = p_receipt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(uuid, uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_pending_reception(uuid, uuid, timestamp with time zone) TO service_role;

COMMENT ON FUNCTION public.confirm_pending_reception(uuid, uuid, timestamp with time zone) IS
'V2.5 H2c: Confirma recepción pendiente. Autorización por TIENDA (has_store_access_as).';

-- ──────────────────────────────────────────────────────────────────────────
-- H2d: void_reception_with_reversal — añadir has_store_access(v_store_id)
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone);
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(
  p_receipt_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT 'Anulacion con reversion',
  p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS void
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
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  -- V2.5 H2d: autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
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
$function$;

GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone) TO service_role;

COMMENT ON FUNCTION public.void_reception_with_reversal(uuid, uuid, text, timestamp with time zone) IS
'V2.5 H2d: Anula recepción. Autorización por TIENDA (has_store_access_as).';

-- ──────────────────────────────────────────────────────────────────────────
-- H3: cancel_transfer — implementar la función que el frontend ya llama
--   Patrón: solo se puede cancelar si status='PENDIENTE' y el caller tiene
--   acceso al origen (donde se creó). No toca stock (las PENDIENTE no lo
--   movieron — eso lo hace confirm_transfer).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_transfer(
  p_transfer_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND';
  END IF;
  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden cancelar transferencias PENDIENTE (estado actual: %)', v_transfer.status;
  END IF;

  -- V2.5 H3: autorización — caller debe tener acceso al origen
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.transfers
    SET status = 'CANCELADA', updated_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'new_status', 'CANCELADA'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_transfer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.cancel_transfer(UUID, UUID) IS
'V2.5 H3: Cancela transferencia PENDIENTE. No afecta stock (las PENDIENTE no movieron stock). Autorización: has_store_access_as(origin_store_id).';

-- ──────────────────────────────────────────────────────────────────────────
-- Refrescar cache de PostgREST
-- ──────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
