-- ══════════════════════════════════════════════════════════════════════
-- FIX QA: Bugs críticos detectados en auditoría
-- ══════════════════════════════════════════════════════════════════════

-- FIX T5-01: confirm_transfer debe validar status='PENDIENTE' antes de confirmar
-- Evita doble confirmación que duplica movimientos de stock
CREATE OR REPLACE FUNCTION public.confirm_transfer(
  p_transfer_id UUID,
  p_user_id UUID,
  p_operation_date TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_dest_product RECORD;
  v_result JSONB;
  v_movement JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- FIX T5-01: SELECT FOR UPDATE + validar status
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferencia no encontrada';
  END IF;

  -- FIX T5-01: solo se puede confirmar si está PENDIENTE
  IF v_transfer.status <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING: La transferencia ya fue confirmada o cancelada (estado: %)', v_transfer.status;
  END IF;

  -- Actualizar estado
  UPDATE public.transfers
  SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = p_user_id
  WHERE id = p_transfer_id;

  -- Procesar items
  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    -- Stock out del origen
    v_movement := public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_transfer.origin_store_id,
      p_quantity := -v_item.quantity,
      p_movement_type := 'transfer_out',
      p_reference_id := p_transfer_id,
      p_user_id := p_user_id,
      p_unit_cost := v_item.unit_cost,
      p_operation_date := p_operation_date
    );
    v_movements := array_append(v_movements, v_movement);

    -- Stock in del destino
    SELECT * INTO v_dest_product FROM public.products
    WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
    AND store_id = v_transfer.destination_store_id
    FOR UPDATE;

    IF v_dest_product.id IS NULL THEN
      RAISE EXCEPTION 'ERR_DEST_PRODUCT_NOT_FOUND: Producto SKU no existe en tienda destino';
    END IF;

    v_movement := public.register_stock_movement(
      p_product_id := v_dest_product.id,
      p_store_id := v_transfer.destination_store_id,
      p_quantity := v_item.quantity,
      p_movement_type := 'transfer_in',
      p_reference_id := p_transfer_id,
      p_user_id := p_user_id,
      p_unit_cost := v_item.unit_cost,
      p_operation_date := p_operation_date
    );
    v_movements := array_append(v_movements, v_movement);
  END LOOP;

  -- FIX T5-05: auditoría server-side (no client-side)
  INSERT INTO public.audit_logs (user_id, store_id, action, entity_type, entity_id, details)
  VALUES (
    p_user_id,
    v_transfer.origin_store_id,
    'transfer_confirmed',
    'transfer',
    p_transfer_id,
    jsonb_build_object(
      'origin_store_id', v_transfer.origin_store_id,
      'destination_store_id', v_transfer.destination_store_id,
      'confirmed_at', NOW(),
      'items_count', (SELECT COUNT(*) FROM public.transfer_items WHERE transfer_id = p_transfer_id)
    )
  );

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id, 'movements', to_jsonb(v_movements));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIX F3-02: UNIQUE constraint — solo 1 cash_closure pendiente por store
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_cash_closure_per_store
  ON public.cash_closures (store_id)
  WHERE status = 'pendiente';

-- FIX F2-05: CHECK constraint — cash + transfer = total_amount cuando payment_method = 'mixed'
-- Solo si la tabla tiene las columnas (si no, falla silenciosamente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
    AND column_name IN ('cash_amount', 'transfer_amount')
  ) THEN
    -- Ya tiene las columnas, añadir constraint si no existe
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'chk_mixed_payment_consistency'
    ) THEN
      ALTER TABLE public.transactions
      ADD CONSTRAINT chk_mixed_payment_consistency
      CHECK (payment_method != 'mixed' OR (cash_amount + transfer_amount = total_amount));
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo añadir constraint chk_mixed_payment_consistency: %', SQLERRM;
END $$;
