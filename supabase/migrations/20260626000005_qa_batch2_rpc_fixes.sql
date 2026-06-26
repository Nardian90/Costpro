
-- ═══ DROP TODAS las versiones existentes de las 4 funciones ═══
DO $drop_all$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid FROM pg_proc
    WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND proname IN ('register_stock_movement', 'create_sale', 'void_transaction', 'confirm_transfer')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid::regprocedure;
  END LOOP;
END
$drop_all$;

-- ═══ F4-01 + F5-18: register_stock_movement con p_skip_access_check + PMP con costos ═══
CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_product_id uuid, p_store_id uuid, p_quantity numeric,
  p_movement_type text DEFAULT NULL, p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL, p_unit_cost numeric DEFAULT NULL,
  p_notes text DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_skip_access_check boolean DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_new_qty NUMERIC; v_new_version BIGINT;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_dist_costs NUMERIC := 0;
BEGIN
  IF NOT p_skip_access_check AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;
  IF p_quantity = 0 THEN RETURN jsonb_build_object('status','skipped'); END IF;

  INSERT INTO public.stock_movements (
    product_id, store_id, created_by, variant_id, quantity_change,
    movement_type, reference_id, reference_doc, unit_cost, notes, movement_date, created_at
  ) VALUES (
    p_product_id, p_store_id, p_user_id, p_variant_id, p_quantity,
    LOWER(p_movement_type)::public.movement_type, p_sale_id::text, p_reason,
    COALESCE(p_unit_cost,0), p_notes, v_eff, v_eff
  ) RETURNING balance_after INTO v_new_qty;

  SELECT version INTO v_new_version FROM public.inventory
  WHERE product_id = p_product_id AND store_id = p_store_id;

  UPDATE public.products SET stock_current = v_new_qty, updated_at = v_eff
  WHERE id = p_product_id AND store_id = p_store_id;

  -- FIX F4-01: PMP incluye costos asociados distribuidos
  IF COALESCE(p_unit_cost,0) > 0 AND p_quantity > 0 THEN
    SELECT COALESCE(SUM(scd.distribution_amount),0) INTO v_dist_costs
    FROM public.service_cost_distributions scd
    JOIN public.receipts r ON r.id = scd.receipt_id
    WHERE scd.product_id = p_product_id AND r.store_id = p_store_id AND r.status != 'voided';

    UPDATE public.products SET cost_average = (
      SELECT CASE WHEN SUM(sm.quantity_change) = 0 THEN 0
        ELSE ROUND((SUM(sm.unit_cost * sm.quantity_change) + v_dist_costs) / SUM(sm.quantity_change), 4)
      END
      FROM public.stock_movements sm
      WHERE sm.product_id = p_product_id AND sm.store_id = p_store_id AND sm.quantity_change > 0
    ), updated_at = v_eff WHERE id = p_product_id AND store_id = p_store_id;
  END IF;

  INSERT INTO public.business_events (event_type, entity_id, payload, created_at) VALUES (
    'stock_movement', p_product_id,
    jsonb_build_object('store_id',p_store_id,'qty',p_quantity,'type',LOWER(p_movement_type),'new_qty',v_new_qty),
    v_eff
  );
  RETURN jsonb_build_object('status','ok','new_quantity',v_new_qty,'new_version',v_new_version);
END;
$func$;

-- ═══ F2-01+F2-02: create_sale con cash/transfer + idempotencia ═══
CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb,
  p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed',
  p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash',
  p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]',
  p_transaction_id uuid DEFAULT NULL, p_operation_date timestamp with time zone DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_stock numeric; v_existing uuid;
BEGIN
  -- FIX F2-02: Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- FIX F2-05: Validar cash+transfer=total
  IF p_payment_method = 'mixed' AND (p_cash_amount + p_transfer_amount) != p_total_amount THEN
    RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    cash_amount, transfer_amount, idempotency_key, created_at, completed_at
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed', p_payment_method,
    p_discount_type, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_cash_amount, p_transfer_amount, p_idempotency_key, v_eff, v_eff
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;

    SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid AND store_id = p_store_id FOR UPDATE;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND'; END IF;
    IF v_stock < v_qty THEN RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK'; END IF;

    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, unit_price, subtotal)
    VALUES (v_tx_id, v_pid, v_qty, v_price, v_qty * v_price);

    PERFORM public.register_stock_movement(v_pid, p_store_id, -v_qty, 'sale', v_tx_id::text, p_seller_id, NULL, v_tx_id, NULL, NULL, v_eff);
  END LOOP;

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$func$;

-- ═══ F2-06: void_transaction restaura stock ═══
CREATE OR REPLACE FUNCTION public.void_transaction(
  p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_tx RECORD; v_item RECORD;
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status = 'cancelled' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions SET status = 'cancelled', cancelled_at = v_eff, void_reason = p_reason WHERE id = p_transaction_id;

  -- FIX F2-06: Restaurar stock
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    PERFORM public.register_stock_movement(
      v_item.product_id, v_tx.store_id, v_item.quantity, 'sale_void',
      p_transaction_id::text, v_tx.seller_id, NULL, p_transaction_id,
      NULL, 'Void: ' || COALESCE(p_reason,''), v_eff
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (auth.uid(), v_tx.store_id, 'sale_voided', 'transactions', p_transaction_id,
    jsonb_build_object('reason',p_reason,'voided_at',v_eff,'total',v_tx.total_amount));

  RETURN jsonb_build_object('status','success','transaction_id',p_transaction_id);
END;
$func$;

-- ═══ F5-01+F5-05+F5-11+F5-18: confirm_transfer completo ═══
CREATE OR REPLACE FUNCTION public.confirm_transfer(
  p_transfer_id UUID, p_user_id UUID, p_operation_date TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $func$
DECLARE
  v_transfer RECORD; v_item RECORD; v_dest RECORD; v_mov JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  UPDATE public.transfers SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = p_user_id WHERE id = p_transfer_id;

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    -- FIX F5-18: skip access check para origen
    v_mov := public.register_stock_movement(v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', p_transfer_id::text, p_user_id, NULL, NULL, v_item.unit_cost, NULL, p_operation_date, TRUE);
    v_movements := array_append(v_movements, v_mov);

    SELECT * INTO v_dest FROM public.products WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id) AND store_id = v_transfer.destination_store_id FOR UPDATE;
    IF v_dest.id IS NULL THEN RAISE EXCEPTION 'ERR_DEST_PRODUCT_NOT_FOUND'; END IF;

    -- FIX F5-11: pasar unit_cost para PMP en destino
    v_mov := public.register_stock_movement(v_dest.id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', p_transfer_id::text, p_user_id, NULL, NULL, v_item.unit_cost, NULL, p_operation_date, FALSE);
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (p_user_id, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest',v_transfer.destination_store_id,'at',NOW()));

  RETURN jsonb_build_object('status','success','transfer_id',p_transfer_id);
END;
$func$;

-- ═══ F3-01: cash_closures opening_balance ═══
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
ALTER TABLE public.cash_closures ADD COLUMN IF NOT EXISTS cash_movements_total NUMERIC DEFAULT 0;
