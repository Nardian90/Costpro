-- ============================================================================
-- Extensión de Política Forward-Only a RPCs de Anulación/Void
-- ----------------------------------------------------------------------------
-- Modifica:
--   - void_transaction (2 sobrecargas)
--   - void_reception_with_reversal
--
-- Las anulaciones también son eventos operativos que generan movimientos
-- de stock y audit_logs, por lo que deben respetar la política forward-only.
-- ============================================================================

-- ============================================================
-- 1. void_transaction (sobrecarga 3 args: id, reason, user_id)
-- ============================================================
-- Esta versión usa tablas legacy `sales` y `sale_items`.
-- La conservamos por compatibilidad, añadiendo p_operation_date.

DROP FUNCTION IF EXISTS public.void_transaction(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id UUID,
  p_reason TEXT,
  p_user_id UUID,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_item RECORD;
    v_current_stock INT;
    v_new_stock INT;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date);

    IF EXISTS (SELECT 1 FROM public.sales WHERE id = p_transaction_id AND status = 'voided') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transacción ya anulada');
    END IF;

    FOR v_item IN SELECT * FROM public.sale_items WHERE sale_id = p_transaction_id
    LOOP
        SELECT stock_current INTO v_current_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        v_new_stock := COALESCE(v_current_stock, 0) + v_item.quantity;

        UPDATE public.products
        SET stock_current = v_new_stock, updated_at = v_effective_date
        WHERE id = v_item.product_id;

        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after, created_at)
        VALUES (v_item.product_id, 'ADJ_IN', v_item.quantity, p_transaction_id, p_user_id, v_new_stock, v_effective_date);
    END LOOP;

    UPDATE public.sales SET status = 'voided' WHERE id = p_transaction_id;

    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, metadata, created_at)
    VALUES (p_user_id, 'sales', p_transaction_id, 'VOID', jsonb_build_object('reason', p_reason), v_effective_date);

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, TEXT, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 2. void_transaction (sobrecarga 2 args: id, reason)
-- ============================================================
-- Esta versión usa tablas actuales `transactions` y `transaction_items`.
-- Es la que usa el frontend moderno.

DROP FUNCTION IF EXISTS public.void_transaction(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id UUID,
  p_reason TEXT,
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_transaction RECORD;
    v_result JSONB;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date);

    SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NOT_FOUND'; END IF;
    IF v_transaction.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin')) THEN
        RAISE EXCEPTION 'ERR_PERMISSION_DENIED';
    END IF;

    -- Marcar como voided con la fecha efectiva
    UPDATE transactions
    SET status = 'voided',
        notes = COALESCE(notes, '') || ' | VOID: ' || p_reason,
        updated_at = v_effective_date,
        cancelled_at = v_effective_date
    WHERE id = p_transaction_id;

    -- Registrar movimientos de stock de reversión con fecha efectiva
    INSERT INTO stock_movements (product_id, store_id, quantity_change, movement_type, reference_doc, user_id, movement_date, created_at)
    SELECT ti.product_id, v_transaction.store_id, ti.quantity, 'adjustment',
           'VOID-' || p_transaction_id::TEXT, auth.uid(), v_effective_date, v_effective_date
    FROM transaction_items ti WHERE ti.transaction_id = p_transaction_id;

    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, created_at)
    VALUES (auth.uid(), 'VOID_TRANSACTION', 'transactions', p_transaction_id,
            to_jsonb(v_transaction),
            jsonb_build_object('status', 'voided', 'reason', p_reason),
            v_effective_date);

    RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_transaction(UUID, TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 3. void_reception_with_reversal
-- ============================================================

DROP FUNCTION IF EXISTS public.void_reception_with_reversal(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(
  p_receipt_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT 'Anulacion con reversion',
  -- NUEVO: fecha de operación (forward-only locking)
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID
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
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date);

  SELECT store_id INTO v_store_id FROM receipts
  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
  END IF;

  FOR v_item IN SELECT product_id, quantity, unit_cost FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
    FROM products WHERE id = v_item.product_id FOR UPDATE;
    v_new_stock := COALESCE(v_current_stock, 0) - v_item.quantity;
    IF v_new_stock > 0 AND v_current_stock > 0 THEN
      v_new_avg := (v_current_stock * v_current_avg - v_item.quantity * v_item.unit_cost) / v_new_stock;
      IF v_new_avg < 0 THEN v_new_avg := 0; END IF;
    ELSE
      v_new_avg := v_current_avg;
    END IF;
    UPDATE products
    SET stock_current = v_new_stock, cost_average = v_new_avg, updated_at = v_effective_date
    WHERE id = v_item.product_id;

    -- Movimiento de retorno con fecha efectiva
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'return'::movement_type, -v_item.quantity, v_item.unit_cost,
            p_reason, v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'voided', updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'active';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_reception_with_reversal(UUID, UUID, TEXT, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- ============================================================
-- 4. Actualizar vista v_global_operation_dates para incluir status='voided'
-- ============================================================
-- Las anulaciones también son eventos operativos. Actualizamos la vista
-- para incluir transacciones y recepciones anuladas (status='voided').
-- Esto asegura que la fecha MAX global refleje cualquier anulación reciente.

CREATE OR REPLACE VIEW public.v_global_operation_dates AS
-- Ventas (incluye anuladas — la anulación es un evento operativo)
SELECT 'sale'::text AS doc_type, id AS doc_id, store_id,
       COALESCE(cancelled_at, created_at) AS operation_date
FROM public.transactions
WHERE status IN ('completed', 'voided')
UNION ALL
-- Transferencias
SELECT 'transfer'::text, id, origin_store_id, created_at FROM public.transfers
WHERE status IN ('PENDIENTE', 'CONFIRMADA')
UNION ALL
-- Ajustes de inventario
SELECT 'inventory_adjustment'::text, id, store_id, created_at FROM public.inventory_adjustments
WHERE status IS NOT NULL
UNION ALL
-- Órdenes de compra
SELECT 'purchase_order'::text, id, store_id, COALESCE(received_at, created_at) FROM public.purchase_orders
WHERE status IS NOT NULL
UNION ALL
-- Recepciones (incluye anuladas)
SELECT 'receipt'::text, id, store_id, COALESCE(reception_date, created_at) FROM public.receipts
WHERE status IS NOT NULL
UNION ALL
-- Cierres de caja
SELECT 'cash_closure'::text, id, store_id, COALESCE(closed_at, created_at) FROM public.cash_closures
UNION ALL
-- Movimientos de caja
SELECT 'cash_movement'::text, id, store_id, created_at FROM public.cash_movements
UNION ALL
-- Sesiones de caja
SELECT 'cash_session'::text, id, store_id, COALESCE(opening_at, created_at) FROM public.cash_sessions
UNION ALL
-- Movimientos de stock
SELECT 'stock_movement'::text, id, store_id, COALESCE(movement_date, created_at) FROM public.stock_movements
UNION ALL
-- Ofertas
SELECT 'oferta'::text, id, store_id, fecha::timestamp with time zone FROM public.ofertas
WHERE fecha IS NOT NULL AND fecha != '';

-- ============================================================
-- 5. Verificación
-- ============================================================

SELECT proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('void_transaction', 'void_reception_with_reversal')
ORDER BY p.proname, p.oid;
