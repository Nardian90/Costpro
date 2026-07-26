-- ════════════════════════════════════════════════════════════════════════
-- V2.3 — AUDITORÍA CONTABLE (PARTE 2): PRODUCCIÓN + VALIDACIÓN + FIXES
-- ════════════════════════════════════════════════════════════════════════
--
-- PROBLEMAS DETECTADOS en V2.2:
-- 1. Falta RPC reverse_production_order (producción sólo tenía voided, no reversed)
-- 2. Bug en reverse_transaction: pasa p_transaction_id como store_id a has_store_access_as
-- 3. No hay validación de transiciones de estado (se puede pasar de voided a confirmed)
-- 4. Falta referencia_type='reversal' documentado en kardex
-- 5. reverse_transaction no maneja productos compuestos (production output)
-- 6. No hay índice para production_orders reversed
--
-- SOLUCIÓN:
-- 1. RPC reverse_production_order: revierte orden confirmada/cerrada (descuenta output + reabastece insumos)
-- 2. Fix reverse_transaction: obtener store_id antes del check de acceso
-- 3. Trigger validate_document_transition: rechaza transiciones inválidas
-- 4. Comentarios en kardex_entries.reference_type para documentar 'reversal'
-- 5. Índice faltante para production_orders.status='reversed'
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. FIX BUG: reverse_transaction pasaba transaction_id como store_id
--    Reescribimos la función correctamente
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_transaction(
  p_transaction_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
  v_store_id UUID;
BEGIN
  -- 1. Obtener transacción (incluye store_id)
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;
  IF v_tx.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use reverse_transaction solo en tx completas'; END IF;

  -- 2. Validar acceso a la tienda (FIX V2.3: v_tx.store_id, NO p_transaction_id).
  -- Si v_uid es NULL significa que el caller es service_role (API server-side) → bypass.
  v_store_id := v_tx.store_id;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Devolver stock por cada item + revertir lote + kardex
  FOR v_item IN
    SELECT product_id, quantity, variant_id FROM public.transaction_items WHERE transaction_id = p_transaction_id
  LOOP
    -- Devolver stock al producto
    UPDATE public.products
      SET stock_current = stock_current + v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id;

    -- Devolver stock al lote si estaba vinculado
    UPDATE public.product_lots
      SET quantity_remaining = quantity_remaining + v_item.quantity,
          status = CASE WHEN quantity_remaining + v_item.quantity > 0 THEN 'active' ELSE status END
      FROM public.transaction_item_lots til
      WHERE til.transaction_item_id IN (
        SELECT id FROM public.transaction_items
        WHERE transaction_id = p_transaction_id AND product_id = v_item.product_id
      ) AND til.lot_id = product_lots.id;

    -- Kardex: devolution_in (reversión de salida por venta)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_store_id, v_item.product_id, 'devolution_in', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_transaction_id, 'Reversión de venta ' || p_transaction_id, v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  -- 4. Marcar transacción como reversed
  UPDATE public.transactions
    SET status = 'reversed',
        reversed_at = now(),
        reversed_by = v_uid,
        reversal_reason = p_reason
    WHERE id = p_transaction_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transaction_id', p_transaction_id);
END;
$$;

COMMENT ON FUNCTION public.reverse_transaction(UUID, TEXT, UUID) IS
'V2.3 (fix V2.2 bug): Invierte una venta completada. Devuelve stock a productos/lotes, marca tx como reversed, crea kardex entries. No aplica a tx ya reversed/voided.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. NUEVA RPC: reverse_production_order
--    Invierte una orden de producción/servicio confirmada o cerrada.
--    - Descuenta el output_product del stock (si se añadió)
--    - Reabastece los insumos consumidos (si se descontaron)
--    - Crea kardex entries de reversión
--    - Marca la orden como 'reversed'
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_production_order(
  p_order_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_order.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use reverse solo en órdenes avanzadas'; END IF;
  IF v_order.status IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: no se puede revertir una orden sin avance (use void)';
  END IF;
  IF NOT public.has_store_access_as(v_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 1. Reabastecer insumos (production_order_items con actual_qty > 0)
  FOR v_item IN
    SELECT product_id, actual_qty, variant_id
    FROM public.production_order_items
    WHERE order_id = p_order_id AND actual_qty > 0
  LOOP
    UPDATE public.products
      SET stock_current = stock_current + v_item.actual_qty, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_order.store_id;

    -- Kardex: devolution_in (insumos vuelven a stock)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_order.store_id, v_item.product_id, 'devolution_in', v_item.actual_qty, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_order_id, 'Reversión de orden: insumo devuelto', v_uid
    FROM public.products p WHERE p.id = v_item.product_id AND p.store_id = v_order.store_id;

    v_count := v_count + 1;
  END LOOP;

  -- 2. Descontar output_product si se había añadido al stock (solo production, no service/work)
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_order.output_quantity), updated_at = now()
      WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

    -- Kardex: out (output retirado)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_order.store_id, v_order.output_product_id, 'out', v_order.output_quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_order_id, 'Reversión de orden: output retirado', v_uid
    FROM public.products p WHERE p.id = v_order.output_product_id AND p.store_id = v_order.store_id;

    v_count := v_count + 1;
  END IF;

  -- 3. Marcar orden como reversed
  UPDATE public.production_orders
    SET status = 'reversed',
        reversed_at = now(),
        reversed_by = v_uid,
        reversal_reason = p_reason
    WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_production_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_production_order TO service_role;

COMMENT ON FUNCTION public.reverse_production_order(UUID, TEXT, UUID) IS
'V2.3: Invierte una orden de producción/servicio. Reabastece insumos consumidos, descuenta output product (si production completada), crea kardex entries, marca como reversed.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. TRIGGER: validate_document_transition
--    Evita transiciones inválidas de estado (ej: reversed -> completed)
--    Aplica a: transactions, receipts, transfers, devolutions, inventory_adjustments, production_orders
-- ──────────────────────────────────────────────────────────────────────────

-- Helper: validación de transiciones por tabla
CREATE OR REPLACE FUNCTION public.fn_validate_document_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Cast explícito a TEXT para evitar problemas con enums/NULL
  v_old_status TEXT := OLD.status::TEXT;
  v_new_status TEXT := NEW.status::TEXT;
  v_table_name TEXT := TG_ARGV[0];
  v_valid_transitions JSONB;
BEGIN
  -- Si no cambia status, no validar
  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  -- Mapa de transiciones válidas por tabla
  v_valid_transitions := jsonb_build_object(
    'transactions', jsonb_build_object(
      'pending',     '["completed","voided","cancelled"]'::jsonb,
      'completed',   '["reversed","voided"]'::jsonb,
      'reversed',    '[]'::jsonb,
      'voided',      '[]'::jsonb,
      'failed',      '["pending","cancelled"]'::jsonb,
      'cancelled',   '[]'::jsonb,
      'compensated', '["completed","voided"]'::jsonb,
      'refunded',    '["reversed"]'::jsonb
    ),
    'receipts', jsonb_build_object(
      'pending',   '["confirmed","active","voided"]'::jsonb,
      'confirmed', '["active","reversed","voided"]'::jsonb,
      'active',    '["reversed","voided"]'::jsonb,
      'partial',   '["active","confirmed","reversed","voided"]'::jsonb,
      'reversed',  '[]'::jsonb,
      'voided',    '[]'::jsonb
    ),
    'transfers', jsonb_build_object(
      'PENDIENTE',  '["CONFIRMADA","CANCELADA"]'::jsonb,
      'CONFIRMADA', '["REVERSADA"]'::jsonb,
      'CANCELADA',  '[]'::jsonb,
      'REVERSADA',  '[]'::jsonb
    ),
    'devolutions', jsonb_build_object(
      'pending',   '["completed","voided"]'::jsonb,
      'completed', '["reversed","voided"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'inventory_adjustments', jsonb_build_object(
      'pending',   '["confirmed","reversed"]'::jsonb,
      'confirmed', '["reversed"]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'production_orders', jsonb_build_object(
      'draft',       '["approved","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["paused","completed","voided","reversed"]'::jsonb,
      'paused',      '["in_progress","voided","reversed"]'::jsonb,
      'completed',   '["closed","reversed"]'::jsonb,
      'closed',      '["reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    )
  );

  -- Si el estado viejo no está en el mapa o no permite la nueva transición, fallar
  IF NOT (
    v_valid_transitions->v_table_name ? v_old_status
    AND (v_valid_transitions->v_table_name->v_old_status) ? v_new_status
  ) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % no puede pasar de % a %',
      v_table_name, v_old_status, v_new_status;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_validate_document_transition TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_document_transition TO service_role;

DROP TRIGGER IF EXISTS trg_validate_tx_transition ON public.transactions;
CREATE TRIGGER trg_validate_tx_transition
  BEFORE UPDATE OF status ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_document_transition('transactions');

DROP TRIGGER IF EXISTS trg_validate_receipt_transition ON public.receipts;
CREATE TRIGGER trg_validate_receipt_transition
  BEFORE UPDATE OF status ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_document_transition('receipts');

DROP TRIGGER IF EXISTS trg_validate_transfer_transition ON public.transfers;
CREATE TRIGGER trg_validate_transfer_transition
  BEFORE UPDATE OF status ON public.transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_document_transition('transfers');

DROP TRIGGER IF EXISTS trg_validate_devolution_transition ON public.devolutions;
CREATE TRIGGER trg_validate_devolution_transition
  BEFORE UPDATE OF status ON public.devolutions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_document_transition('devolutions');

DROP TRIGGER IF EXISTS trg_validate_adjustment_transition ON public.inventory_adjustments;
CREATE TRIGGER trg_validate_adjustment_transition
  BEFORE UPDATE OF status ON public.inventory_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_document_transition('inventory_adjustments');

DROP TRIGGER IF EXISTS trg_validate_production_transition ON public.production_orders;
CREATE TRIGGER trg_validate_production_transition
  BEFORE UPDATE OF status ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validate_document_transition('production_orders');

-- ──────────────────────────────────────────────────────────────────────────
-- 4. ÍNDICE FALTANTE
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_production_orders_reversed
  ON public.production_orders(status, reversed_at) WHERE status = 'reversed';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. COMMENT ON KARDEX ENTRIES para documentar reference_type='reversal'
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.kardex_entries.reference_type IS
'V2.3: Tipos válidos: sale, purchase, adjustment, return, initial, transfer, void, reversal, devolution, production. "reversal" se usa para entradas de kardex generadas por reverse_* RPCs.';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. HELPER VIEW: v_document_state_summary
--    Vista para dashboards: cuenta documentos por estado y tipo
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_document_state_summary AS
SELECT
  'transactions'::text AS document_type,
  store_id,
  status::text AS status,
  COUNT(*)::int AS count
FROM public.transactions
GROUP BY store_id, status
UNION ALL
SELECT
  'receipts'::text, store_id, status::text, COUNT(*)::int
FROM public.receipts
GROUP BY store_id, status
UNION ALL
SELECT
  'transfers'::text, origin_store_id, status::text, COUNT(*)::int
FROM public.transfers
GROUP BY origin_store_id, status
UNION ALL
SELECT
  'devolutions'::text, store_id, status::text, COUNT(*)::int
FROM public.devolutions
GROUP BY store_id, status
UNION ALL
SELECT
  'inventory_adjustments'::text, store_id, status::text, COUNT(*)::int
FROM public.inventory_adjustments
GROUP BY store_id, status
UNION ALL
SELECT
  'production_orders'::text, store_id, status::text, COUNT(*)::int
FROM public.production_orders
GROUP BY store_id, status;

COMMENT ON VIEW public.v_document_state_summary IS
'V2.3: Vista agregada que cuenta documentos por tipo + estado + tienda. Útil para dashboards de auditoría contable.';

GRANT SELECT ON public.v_document_state_summary TO authenticated;
