-- ============================================================================
-- Migration: 20260808000001_v2_17_1_reverse_transaction_v2.sql
-- Iteración 11.3 — Fix C-8
-- ============================================================================
-- reverse_transaction_v2: usa register_stock_movement + stock_movements +
-- audit_logs + SELECT FOR UPDATE + valida status='completed'.
--
-- Aclaración 1: movement_type='sale_reverse' en ambos ledgers (stock_movements
-- Y kardex_entries). Para kardex_entries, alterar el CHECK constraint para
-- aceptar 'sale_reverse'.
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Añadir 'sale_reverse' al enum movement_type (para stock_movements)
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'sale_reverse';

-- 2. Alterar CHECK de kardex_entries para aceptar 'sale_reverse'
ALTER TABLE public.kardex_entries DROP CONSTRAINT IF EXISTS kardex_entries_movement_type_check;
ALTER TABLE public.kardex_entries ADD CONSTRAINT kardex_entries_movement_type_check
  CHECK (movement_type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text,
    'transfer_in'::text, 'transfer_out'::text, 'devolution_in'::text, 'devolution_out'::text,
    'sale_reverse'::text]));

-- 3. Crear reverse_transaction_v2
DROP FUNCTION IF EXISTS public.reverse_transaction_v2;

CREATE OR REPLACE FUNCTION public.reverse_transaction_v2(
  p_transaction_id uuid,
  p_reason text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_conversion_factor integer := 1;
  v_units_to_restore numeric;
BEGIN
  -- 1. SELECT FOR UPDATE + validar status
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TX_NOT_FOUND';
  END IF;

  -- Validar status (solo completed puede ser reversed)
  IF v_tx.status = 'reversed' THEN
    RAISE EXCEPTION 'ERR_ALREADY_REVERSED';
  END IF;
  IF v_tx.status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED';
  END IF;
  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only completed transactions can be reversed';
  END IF;

  -- 2. Auth
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Restaurar stock via register_stock_movement (NO UPDATE directo)
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_reverse'::text,
      p_sale_id := p_transaction_id,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Reverso de venta'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- kardex_entries consistente (mismo movement_type)
    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      reference_type, reference_id, reference_description, created_at, created_by
    ) VALUES (
      v_tx.store_id, v_item.product_id, 'sale_reverse', v_units_to_restore,
      v_item.cost_at_sale, v_units_to_restore * v_item.cost_at_sale,
      'reversal', p_transaction_id, 'Reverso de venta: ' || COALESCE(p_reason, ''),
      NOW(), v_caller_uid
    );
  END LOOP;

  -- 4. UPDATE transactions
  UPDATE public.transactions
    SET status = 'reversed', reversed_at = NOW(), reversed_by = v_caller_uid,
        reversal_reason = p_reason, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- 5. Audit log atómico
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_SALE_V2', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status,
      'total_amount', v_tx.total_amount, 'payment_method', v_tx.payment_method,
      'v2_reverse', true));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reverse_transaction_v2 FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_transaction_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction_v2 TO service_role;

COMMENT ON FUNCTION public.reverse_transaction_v2 IS
  'Iteración 11.3 (C-8): Reverses transaction using register_stock_movement + stock_movements + audit_logs. Validates status=completed. Uses sale_reverse in both ledgers.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.reverse_transaction_v2;
-- ALTER TABLE public.kardex_entries DROP CONSTRAINT IF EXISTS kardex_entries_movement_type_check;
-- ALTER TABLE public.kardex_entries ADD CONSTRAINT kardex_entries_movement_type_check
--   CHECK (movement_type = ANY (ARRAY['in','out','adjustment','transfer_in','transfer_out','devolution_in','devolution_out']));
-- ============================================================================
