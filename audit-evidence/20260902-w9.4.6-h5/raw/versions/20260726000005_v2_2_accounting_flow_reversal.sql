-- ════════════════════════════════════════════════════════════════════════
-- V2.2 — AUDITORÍA CONTABLE: ESTADOS DE FLUJOS + REVERSIÓN
-- ════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA DETECTADO:
-- Los flujos del sistema no siguen un ciclo contable consistente.
-- Falta el estado "confirmado" (que refleja en kardex) y el "revertido"
-- (que invierte la operación). Actualmente muchas operaciones se completan
-- inmediatamente sin paso de confirmación, y las anulaciones son físicas
-- o no revierten el stock.
--
-- SOLUCIÓN:
-- 1. Añadir estado 'confirmed' a receipts, transfers, inventory_adjustments
-- 2. Añadir estado 'reversed' a transactions, receipts, transfers, devolutions
-- 3. Crear RPC reverse_transaction que invierte una venta (devuelve stock + crea NC)
-- 4. Crear RPC reverse_receipt que invierte una recepción (descuenta stock)
-- 5. Crear RPC reverse_transfer que cancela transferencia confirmada (devuelve stock)
-- 6. Crear RPC reverse_adjustment que invierte un ajuste
-- 7. Modificar confirm_transfer para que solo afecte stock si está CONFIRMADA
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. AMPLIAR ESTADOS EN TABLAS EXISTENTES
-- ──────────────────────────────────────────────────────────────────────────

-- Receipts: añadir 'confirmed' y 'reversed'
ALTER TABLE public.receipts DROP CONSTRAINT IF EXISTS receipts_status_check;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'active'::text, 'partial'::text, 'voided'::text, 'reversed'::text]));

-- Añadir columnas de auditoría para reversión
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS original_receipt_id UUID REFERENCES public.receipts(id);

-- Transfers: añadir 'REVERSADA' al enum
ALTER TYPE public.transfer_status ADD VALUE IF NOT EXISTS 'REVERSADA';

ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- Transactions: añadir 'reversed' al enum
ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'reversed';

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES public.transactions(id);

-- Inventory Adjustments: añadir estados
ALTER TABLE public.inventory_adjustments DROP CONSTRAINT IF EXISTS inventory_adjustments_status_check;
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed';
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.inventory_adjustments ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
ALTER TABLE public.inventory_adjustments ADD CONSTRAINT inventory_adjustments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'reversed'::text]));

-- Production Orders: añadir 'reversed'
ALTER TABLE public.production_orders DROP CONSTRAINT IF EXISTS production_orders_status_check;
ALTER TABLE public.production_orders ADD CONSTRAINT production_orders_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'in_progress'::text, 'paused'::text, 'completed'::text, 'closed'::text, 'voided'::text, 'reversed'::text]));

ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.production_orders ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- Devolutions: añadir 'reversed'
ALTER TABLE public.devolutions DROP CONSTRAINT IF EXISTS devolutions_status_check;
ALTER TABLE public.devolutions ADD CONSTRAINT devolutions_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'voided'::text, 'reversed'::text]));

ALTER TABLE public.devolutions ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.devolutions ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.devolutions ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RPC: reverse_transaction — invierte una venta
--    Devuelve stock + marca tx como reversed + crea kardex entry
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
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_transaction_id) THEN
    -- Actually we need store_id from the transaction
    SELECT store_id INTO v_tx.store_id FROM public.transactions WHERE id = p_transaction_id;
    IF v_tx.store_id IS NULL THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;
    IF NOT public.has_store_access_as(v_uid, v_tx.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  END IF;

  -- Get transaction
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF v_tx IS NULL THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;
  IF v_tx.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  -- Return stock for each item
  FOR v_item IN
    SELECT product_id, quantity, variant_id FROM public.transaction_items WHERE transaction_id = p_transaction_id
  LOOP
    -- Return stock to product
    UPDATE public.products SET stock_current = stock_current + v_item.quantity WHERE id = v_item.product_id;

    -- Return stock to lot if linked
    UPDATE public.product_lots
    SET quantity_remaining = quantity_remaining + v_item.quantity,
        status = CASE WHEN quantity_remaining + v_item.quantity > 0 THEN 'active' ELSE status END
    FROM public.transaction_item_lots til
    WHERE til.transaction_item_id IN (
      SELECT id FROM public.transaction_items WHERE transaction_id = p_transaction_id AND product_id = v_item.product_id
    ) AND til.lot_id = product_lots.id;

    -- Kardex entry (reversal = devolution_in)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_tx.store_id, v_item.product_id, 'devolution_in', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_transaction_id, 'Reversión de venta ' || p_transaction_id, v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark transaction as reversed
  UPDATE public.transactions
  SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transaction_id', p_transaction_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RPC: reverse_receipt — invierte una recepción
--    Descuenta stock + marca receipt como reversed
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_receipt(
  p_receipt_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_receipt.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF NOT public.has_store_access_as(v_uid, v_receipt.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  -- Reverse stock for each item
  FOR v_item IN
    SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    -- Deduct stock (reverse of reception)
    UPDATE public.products
    SET stock_current = GREATEST(0, stock_current - v_item.quantity),
        updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    -- Kardex entry (reversal = out)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_receipt.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_receipt_id, 'Reversión de recepción', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark receipt as reversed
  UPDATE public.receipts
  SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
  WHERE id = p_receipt_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'receipt_id', p_receipt_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_receipt TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_receipt TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC: reverse_transfer — cancela transferencia confirmada
--    Devuelve stock a origen + quita de destino
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_transfer(
  p_transfer_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN RAISE EXCEPTION 'ERR_NOT_CONFIRMED: Solo se pueden revertir transferencias confirmadas'; END IF;
  IF NOT public.has_store_access_as(v_uid, v_transfer.origin_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  -- For each item: return to origin, deduct from destination
  FOR v_item IN
    SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- Return to origin
    UPDATE public.products SET stock_current = stock_current + v_item.quantity, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_transfer.origin_store_id;

    -- Deduct from destination
    UPDATE public.products SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_transfer.destination_store_id;

    -- Kardex for origin (transfer_in = reversal of transfer_out)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_transfer.origin_store_id, v_item.product_id, 'transfer_in', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_transfer_id, 'Reversión de transferencia', v_uid
    FROM public.products p WHERE p.id = v_item.product_id AND p.store_id = v_transfer.origin_store_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark transfer as reversed
  UPDATE public.transfers
  SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_transfer TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transfer TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RPC: reverse_adjustment — invierte un ajuste de inventario
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_adjustment(
  p_adjustment_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF NOT public.has_store_access_as(v_uid, v_adj.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  -- Reverse each item
  FOR v_item IN
    SELECT product_id, quantity_change FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Invert the adjustment
    UPDATE public.products
    SET stock_current = stock_current - v_item.quantity_change, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_adj.store_id;

    -- Kardex
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_adj.store_id, v_item.product_id, 'adjustment', ABS(v_item.quantity_change), 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_adjustment_id, 'Reversión de ajuste', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark as reversed
  UPDATE public.inventory_adjustments
  SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
  WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'adjustment_id', p_adjustment_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_adjustment TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RPC: reverse_devolution — invierte una devolución
--    Descuenta el stock que se había restaurado
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_devolution(
  p_devolution_id UUID,
  p_reason TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  -- Reverse each item: deduct the stock that was returned
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    UPDATE public.products
    SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
    WHERE id = v_item.product_id;

    -- Kardex (out = reversal of devolution_in)
    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_dev.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_devolution_id, 'Reversión de devolución', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark as reversed
  UPDATE public.devolutions
  SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
  WHERE id = p_devolution_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_devolution TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_devolution TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. ÍNDICES PARA REVERSIÓN
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_reversed ON public.transactions(status, reversed_at) WHERE status = 'reversed';
CREATE INDEX IF NOT EXISTS idx_receipts_reversed ON public.receipts(status, reversed_at) WHERE status = 'reversed';
CREATE INDEX IF NOT EXISTS idx_transfers_reversed ON public.transfers(status, reversed_at) WHERE status = 'REVERSADA';
CREATE INDEX IF NOT EXISTS idx_adjustments_reversed ON public.inventory_adjustments(status, reversed_at) WHERE status = 'reversed';

-- ──────────────────────────────────────────────────────────────────────────
-- 8. COMMENT ON FUNCTIONS
-- ──────────────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.reverse_transaction(UUID, TEXT, UUID) IS
'V2.2: Invierte una venta. Devuelve stock a productos/lotes, marca tx como reversed, crea kardex entries. No se puede revertir una tx ya reversed o voided.';

COMMENT ON FUNCTION public.reverse_receipt(UUID, TEXT, UUID) IS
'V2.2: Invierte una recepción. Descuenta stock, marca receipt como reversed, crea kardex entries.';

COMMENT ON FUNCTION public.reverse_transfer(UUID, TEXT, UUID) IS
'V2.2: Invierte una transferencia confirmada. Devuelve stock a origen, descuenta de destino, marca como REVERSADA.';

COMMENT ON FUNCTION public.reverse_adjustment(UUID, TEXT, UUID) IS
'V2.2: Invierte un ajuste de inventario. Invierte el quantity_change, marca como reversed.';

COMMENT ON FUNCTION public.reverse_devolution(UUID, TEXT, UUID) IS
'V2.2: Invierte una devolución. Descuenta el stock que se había restaurado, marca como reversed.';
