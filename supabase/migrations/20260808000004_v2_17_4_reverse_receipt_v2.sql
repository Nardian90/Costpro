-- ============================================================================
-- Migration: 20260808000004_v2_17_4_reverse_receipt_v2.sql
-- Iteración 11.3 — Fix B-12
-- ============================================================================
-- reverse_receipt_v2: register_stock_movement + NO clamp (RAISE si stock < qty)
-- + recalcular WAC + audit_logs.
--
-- Aclaración 1: movement_type='purchase_reverse' en ambos ledgers.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Añadir 'purchase_reverse' al enum movement_type
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'purchase_reverse';

-- 2. Alterar CHECK de kardex_entries para aceptar 'purchase_reverse'
ALTER TABLE public.kardex_entries DROP CONSTRAINT IF EXISTS kardex_entries_movement_type_check;
ALTER TABLE public.kardex_entries ADD CONSTRAINT kardex_entries_movement_type_check
  CHECK (movement_type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text,
    'transfer_in'::text, 'transfer_out'::text, 'devolution_in'::text, 'devolution_out'::text,
    'sale_reverse'::text, 'purchase_reverse'::text]));

-- 3. Crear reverse_receipt_v2
DROP FUNCTION IF EXISTS public.reverse_receipt_v2;

CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(
  p_receipt_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_stock numeric;
  v_new_wac numeric;
  v_old_total_value numeric;
  v_new_total_value numeric;
  v_old_qty numeric;
  v_new_qty numeric;
BEGIN
  -- 1. SELECT FOR UPDATE receipt
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND';
  END IF;

  IF v_receipt.status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED';
  END IF;
  IF v_receipt.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only active receipts can be reversed';
  END IF;

  -- 2. Auth
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. FOR each receipt_item: validar stock + register_stock_movement
  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    -- Lock product
    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    v_stock := COALESCE(v_stock, 0);

    -- NO clamp — si stock insuficiente, error
    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %',
        v_item.product_id, v_stock, v_item.quantity;
    END IF;

    -- register_stock_movement (NO UPDATE directo, NO clamp)
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_receipt.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_item.quantity,
      p_movement_type := 'purchase_reverse',
      p_reference_doc := p_receipt_id::text,
      p_unit_cost := v_item.unit_cost,
      p_reason := 'Reverso de recepción: ' || COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- kardex_entries consistente (mismo movement_type)
    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      reference_type, reference_id, reference_description, created_at, created_by
    ) VALUES (
      v_receipt.store_id, v_item.product_id, 'purchase_reverse', -v_item.quantity,
      v_item.unit_cost, -v_item.quantity * v_item.unit_cost,
      'reversal', p_receipt_id, 'Reverso de recepción: ' || COALESCE(p_reason, ''),
      NOW(), v_caller_uid
    );

    -- 4. Recalcular WAC (revertir el costo promedio)
    -- El WAC se recalcula restando el costo de los items revertidos
    SELECT stock_current, cost_average INTO v_old_qty, v_new_wac FROM public.products WHERE id = v_item.product_id;
    v_old_total_value := (v_old_qty + v_item.quantity) * COALESCE(v_new_wac, 0);
    v_new_total_value := v_old_total_value - (v_item.quantity * v_item.unit_cost);
    v_new_qty := v_old_qty; -- ya decrementado por register_stock_movement

    IF v_new_qty > 0 THEN
      v_new_wac := v_new_total_value / v_new_qty;
      UPDATE public.products SET cost_average = v_new_wac WHERE id = v_item.product_id;
    ELSE
      -- Si stock queda en 0, mantener el WAC anterior (no dividir por 0)
      NULL;
    END IF;
  END LOOP;

  -- 5. UPDATE receipt status
  UPDATE public.receipts SET status = 'voided', updated_at = NOW()
    WHERE id = p_receipt_id;

  -- 6. Audit log atómico
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_RECEIPT_V2', 'receipts', p_receipt_id::text, v_receipt.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','receipt_id',p_receipt_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reverse_receipt_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_receipt_v2 TO service_role;

COMMENT ON FUNCTION public.reverse_receipt_v2 IS
  'Iteración 11.3 (B-12): Reverses receipt using register_stock_movement + RAISE on insufficient stock (no clamp) + WAC recalculation + audit_logs.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.reverse_receipt_v2;
-- ALTER TABLE public.kardex_entries DROP CONSTRAINT IF EXISTS kardex_entries_movement_type_check;
-- ALTER TABLE public.kardex_entries ADD CONSTRAINT kardex_entries_movement_type_check
--   CHECK (movement_type = ANY (ARRAY['in','out','adjustment','transfer_in','transfer_out','devolution_in','devolution_out','sale_reverse']));
-- ============================================================================
