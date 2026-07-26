-- ════════════════════════════════════════════════════════════════════════
-- V2.11 — RPCs para Ajustes Documentales: confirm + void con autorización
--
-- BUGS CRÍTICOS CERRADOS:
-- C1: handleConfirm llamaba apply_physical_count (RPC de physical_counts,
--     tabla equivocada). Ahora usa confirm_inventory_adjustment.
-- C2: El fallback solo hacía UPDATE status sin aplicar stock. Eliminado.
-- C3: UPDATE directo desde cliente sin autorización. Ahora via RPC con
--     has_store_access_as.
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. confirm_inventory_adjustment — aplica stock + kardex + marca confirmed
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
  v_new_stock NUMERIC;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Aplicar cada item: actualizar stock + kardex
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Actualizar stock del producto (atómico)
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Registrar movimiento en kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_adj.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.counted_quantity - v_item.expected_quantity,
      p_movement_type := 'adjustment',
      p_unit_cost := 0,
      p_reason := 'Ajuste documental confirmado',
      p_operation_date := NOW(),
      p_skip_access_check := TRUE  -- ya validamos con has_store_access_as
    );

    v_count := v_count + 1;
  END LOOP;

  -- Marcar como confirmed
  UPDATE public.inventory_adjustments
    SET status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = v_caller_uid
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'items_applied', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.confirm_inventory_adjustment(UUID, UUID) IS
'V2.11: Confirma un ajuste documental pendiente. Aplica stock (UPDATE products) + kardex entries + marca status=confirmed. Autorización: has_store_access_as.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. void_inventory_adjustment — anula un ajuste pendiente (sin efecto en stock)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_inventory_adjustment(
  p_adjustment_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_adj RECORD;
  v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden anular ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Marcar como voided (sin tocar stock — los pending no movieron stock)
  -- NOTA: el trigger fn_validate_document_transition permite pending → voided
  -- pero no existe 'voided' en el check de inventory_adjustments del trigger V2.3.
  -- Lo añadimos aquí con UPDATE directo (el trigger podría bloquear).
  -- El trigger V2.3 tiene: pending → confirmed/reversed. Falta voided.
  -- Solución: actualizar sin pasar por el trigger (usando SET session_replication_role)
  -- O mejor: añadir 'voided' al mapa de transiciones.

  UPDATE public.inventory_adjustments
    SET status = 'voided'
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'new_status', 'voided'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_inventory_adjustment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_inventory_adjustment(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.void_inventory_adjustment(UUID, UUID) IS
'V2.11: Anula un ajuste documental pendiente. Sin efecto en stock (los pending no movieron stock). Autorización: has_store_access_as.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Añadir 'voided' a las transiciones válidas de inventory_adjustments
--    en el trigger fn_validate_document_transition
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_document_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_old_status TEXT := OLD.status::TEXT;
  v_new_status TEXT := NEW.status::TEXT;
  v_table_name TEXT := TG_ARGV[0];
  v_valid_transitions JSONB;
BEGIN
  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

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
      -- V2.11: añadido 'voided' a las transiciones desde pending
      'pending',   '["confirmed","reversed","voided"]'::jsonb,
      'confirmed', '["reversed"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'production_orders', jsonb_build_object(
      'draft',       '["approved","in_progress","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["paused","completed","voided","reversed"]'::jsonb,
      'paused',      '["in_progress","voided","reversed"]'::jsonb,
      'completed',   '["closed","reversed"]'::jsonb,
      'closed',      '["reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    )
  );

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

GRANT EXECUTE ON FUNCTION public.fn_validate_document_transition() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_document_transition() TO service_role;

NOTIFY pgrst, 'reload schema';
