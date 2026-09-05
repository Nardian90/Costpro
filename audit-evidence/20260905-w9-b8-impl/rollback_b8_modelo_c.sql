-- ============================================================================
-- W9.5 — B-8 · MODELO C — ROLLBACK (restaura estado c57e8de1 exacto)
-- NO ejecutar salvo reversión explícita de la implementación.
-- Restaura los cuerpos PRE (capturados live antes de la migración) y
-- elimina los helpers normativos. ACLs de los RPC nunca fueron tocadas
-- por la migración (CREATE OR REPLACE preserva ACL), por lo que no se
-- requieren sentencias GRANT/REVOKE aquí.
-- ============================================================================

DROP FUNCTION IF EXISTS public.can_pos_undo_transaction(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_admin_reverse_transaction(uuid, uuid);

CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT now(), p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore numeric;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- FIX C-7: Restaurar stock considerando conversion_factor de variantes.
  -- Si transaction_items.variant_id está poblado, buscar conversion_factor.
  -- Si variant_id es NULL (ventas legacy), usar 1 (sin conversión) para
  -- mantener simetría con create_sale legacy.
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
      p_movement_type := 'sale_void',
      p_notes := p_transaction_id::text,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Void de venta',
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;

$function$
;

CREATE OR REPLACE FUNCTION public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_units_to_restore numeric;
  v_total_restored numeric := 0;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  IF v_tx.status = 'voided' THEN
    RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
  END IF;

  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only completed transactions can be reversed (status=%)', v_tx.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT ti.product_id, ti.quantity, ti.cost_at_sale
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_transaction_id AND ti.product_id IS NOT NULL
  LOOP
    v_units_to_restore := v_item.quantity;

    -- register_stock_movement genera el stock_movement → trigger genera kardex
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

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO

    v_total_restored := v_total_restored + v_units_to_restore;
  END LOOP;

  UPDATE public.transactions
  SET status = 'voided',
      updated_at = NOW()
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_TRANSACTION_V2', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'units_restored', v_total_restored
  );
END;
$function$
;
