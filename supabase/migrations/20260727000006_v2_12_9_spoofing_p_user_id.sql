-- ════════════════════════════════════════════════════════════════════════
-- V2.12.9 — FIX CRÍTICO: Spoofing de identidad vía p_user_id
--
-- Bug: 31 funciones usan el patrón:
--   v_caller_uid UUID := COALESCE(p_user_id, auth.uid());
--
-- p_user_id es un parámetro público del RPC, GRANTeado a authenticated.
-- Cualquier usuario autenticado puede pasar el UUID de otra persona y
-- bypassar el check de has_store_access_as() (que evalúa el acceso
-- de la persona whose UID fue pasado, no del caller real).
--
-- Fix: solo confiar en p_user_id cuando la llamada viene de service_role:
--   v_caller_uid UUID := CASE
--     WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
--     ELSE auth.uid()
--   END;
--
-- Funciones afectadas (31):
-- 1. apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean)
-- 2. approve_transfer(p_transfer_id uuid, p_user_id uuid)
-- 3. auto_match_bank_items(p_statement_id uuid, p_user_id uuid)
-- 4. calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)
-- 5. cancel_transfer(p_transfer_id uuid, p_user_id uuid)
-- 6. close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)
-- 7. close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid)
-- 8. compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid)
-- 9. confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)
-- 10. confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone)
-- 11. create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text)
-- 12. create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text)
-- 13. create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date)
-- 14. create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid)
-- 15. create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid)
-- 16. duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid)
-- 17. get_reorder_suggestions(p_store_id uuid, p_user_id uuid)
-- 18. perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone)
-- 19. receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text)
-- 20. record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text)
-- 21. reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
-- 22. reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid)
-- 23. reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid)
-- 24. reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid)
-- 25. reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid)
-- 26. reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid)
-- 27. reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
-- 28. set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid)
-- 29. void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)
-- 30. void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone)
-- 31. void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_apply_zero_diffs boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_applied INTEGER := 0;
  v_discrepancies INTEGER := 0;
  v_total_value NUMERIC := 0;
BEGIN
  SELECT * INTO v_count FROM public.physical_counts WHERE id = p_count_id FOR UPDATE;
  IF v_count IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;
  IF v_count.status != 'counted' AND v_count.status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATE: solo se pueden aplicar conteos en estado counted o in_progress';
  END IF;

  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Aplicar cada item con diferencia
  FOR v_item IN
    SELECT * FROM public.physical_count_items
    WHERE count_id = p_count_id
      AND counted_quantity IS NOT NULL
      AND (p_apply_zero_diffs OR difference != 0)
  LOOP
    -- Actualizar stock del producto
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_count.store_id;

    -- Registrar movimiento de stock
    -- V2.9: skip_access_check=TRUE porque ya validamos con has_store_access_as arriba
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_count.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.difference,
      p_movement_type := 'adjustment',
      p_unit_cost := v_item.unit_cost,
      p_reason := 'Conteo físico ' || v_count.count_number,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_applied := v_applied + 1;
    IF v_item.difference != 0 THEN
      v_discrepancies := v_discrepancies + 1;
      v_total_value := v_total_value + v_item.value_discrepancy;
    END IF;
  END LOOP;

  -- Marcar como aplicado
  UPDATE public.physical_counts
    SET status = 'applied',
        applied_at = NOW(),
        applied_by = v_caller_uid,
        total_discrepancies = v_discrepancies,
        total_value_discrepancy = v_total_value
    WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'count_id', p_count_id,
    'items_applied', v_applied,
    'discrepancies', v_discrepancies,
    'total_value_discrepancy', v_total_value
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- approve_transfer(p_transfer_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_rule RECORD;
  v_tenant_id UUID;
  v_has_approver_role BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;

  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
  END IF;

  IF NOT v_transfer.requires_approval THEN
    RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
  END IF;

  IF v_transfer.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_APPROVED';
  END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el caller tiene rol de aprobador
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = v_transfer.origin_store_id;

    SELECT * INTO v_rule FROM public.transfer_approval_rules
    WHERE is_active = true
      AND (
        (store_id = v_transfer.origin_store_id) OR
        (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
      )
      ORDER BY store_id NULLS LAST
      LIMIT 1;

    IF v_rule.id IS NOT NULL THEN
      v_has_approver_role := v_user_role = ANY(v_rule.approver_roles) OR v_user_role = 'admin';
      IF NOT v_has_approver_role THEN
        RAISE EXCEPTION 'ERR_NOT_APPROVER: tu rol (%) no está autorizado para aprobar (requerido: %)', v_user_role, v_rule.approver_roles;
      END IF;
    END IF;
  END IF;

  -- Marcar como aprobada
  UPDATE public.transfers
    SET approved_by = v_caller_uid,
        approved_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'approved_by', v_caller_uid,
    'approved_at', NOW()
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- auto_match_bank_items(p_statement_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_store_id uuid;
  v_item RECORD;
  v_matched_count integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  -- Get store_id from statement
  SELECT store_id INTO v_store_id FROM public.bank_statements WHERE id = p_statement_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STATEMENT_NOT_FOUND';
  END IF;

  IF NOT public.has_store_access_as(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Match items: for each unmatched bank_item, find a transaction with same amount (±1) and date (±3 days)
  FOR v_item IN
    SELECT id, amount, type, transaction_date
    FROM public.bank_statement_items
    WHERE bank_statement_id = p_statement_id AND is_matched = false
  LOOP
    IF v_item.type = 'credit' THEN
      -- Match with cash/transfer sales
      UPDATE public.bank_statement_items bsi
      SET matched_transaction_id = t.id, is_matched = true, is_reconciled = true
      FROM public.transactions t
      WHERE bsi.id = v_item.id
        AND t.store_id = v_store_id
        AND t.status = 'completed'
        AND ABS(t.total_amount - v_item.amount) < 1
        AND ABS(t.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transaction_id = t.id AND other.id != bsi.id
        );
    ELSE
      -- Match with receipts (purchases)
      UPDATE public.bank_statement_items bsi
      SET matched_transfer_id = r.id, is_matched = true, is_reconciled = true
      FROM public.receipts r
      WHERE bsi.id = v_item.id
        AND r.store_id = v_store_id
        AND r.status = 'active'
        AND ABS(r.total_cost - v_item.amount) < 1
        AND ABS(r.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transfer_id = r.id AND other.id != bsi.id
        );
    END IF;

    IF FOUND THEN
      v_matched_count := v_matched_count + 1;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
    END IF;
  END LOOP;

  -- Update statement status
  IF v_unmatched_count = 0 THEN
    UPDATE public.bank_statements SET status = 'reconciled', reconciled_by = v_uid, reconciled_at = now(), updated_at = now()
    WHERE id = p_statement_id;
  ELSE
    UPDATE public.bank_statements SET status = 'discrepancy', updated_at = now()
    WHERE id = p_statement_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'matched', v_matched_count,
    'unmatched', v_unmatched_count,
    'statement_status', CASE WHEN v_unmatched_count = 0 THEN 'reconciled' ELSE 'discrepancy' END
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
    v_total_revenue NUMERIC := 0;
    v_count INTEGER := 0;
    v_product_id UUID;
    v_qty NUMERIC;
    v_revenue NUMERIC;
    v_cumulative NUMERIC := 0;
    v_pct NUMERIC;
    v_class TEXT;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    DELETE FROM public.abc_classifications
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    -- Get total revenue
    SELECT COALESCE(SUM(ti.price_at_sale_cup * ti.quantity), 0) INTO v_total_revenue
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month;

    -- Loop through products sorted by revenue desc
    FOR v_product_id, v_qty, v_revenue IN
        SELECT ti.product_id, SUM(ti.quantity), SUM(ti.price_at_sale_cup * ti.quantity)
        FROM public.transaction_items ti
        JOIN public.transactions t ON t.id = ti.transaction_id
        WHERE t.store_id = p_store_id AND t.status = 'completed'
          AND EXTRACT(YEAR FROM t.created_at) = p_year
          AND EXTRACT(MONTH FROM t.created_at) = p_month
        GROUP BY ti.product_id
        ORDER BY SUM(ti.price_at_sale_cup * ti.quantity) DESC
    LOOP
        v_cumulative := v_cumulative + v_revenue;
        v_pct := CASE WHEN v_total_revenue > 0 THEN v_cumulative / v_total_revenue * 100 ELSE 0 END;
        v_class := CASE WHEN v_pct <= 80 THEN 'A' WHEN v_pct <= 95 THEN 'B' ELSE 'C' END;

        INSERT INTO public.abc_classifications (store_id, product_id, classification, period_year, period_month, total_quantity_sold, total_revenue, annual_consumption_value, cumulative_percentage, calculated_at)
        VALUES (p_store_id, v_product_id, v_class, p_year, p_month, v_qty, v_revenue, v_revenue, v_pct, now());
    END LOOP;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('status', 'success', 'products_classified', v_count, 'total_revenue', v_total_revenue);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- cancel_transfer(p_transfer_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_closing_id UUID; v_total_sales NUMERIC := 0; v_total_devolutions NUMERIC := 0;
    v_total_purchases NUMERIC := 0; v_total_commissions NUMERIC := 0;
    v_date_from TIMESTAMPTZ; v_date_to TIMESTAMPTZ;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_date_from := make_date(p_year, p_month, 1);
    v_date_to := make_date(p_year, p_month, 1) + INTERVAL '1 month';
    SELECT id INTO v_closing_id FROM public.fiscal_closings WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;
    IF v_closing_id IS NOT NULL THEN
        UPDATE public.fiscal_closings SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now()
        WHERE id = v_closing_id AND status = 'open';
        IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PERIOD_LOCKED'; END IF;
    ELSE
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales FROM public.transactions WHERE store_id = p_store_id AND status = 'completed' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_devolutions FROM public.devolutions WHERE store_id = p_store_id AND status = 'completed' AND processed_at >= v_date_from AND processed_at < v_date_to;
        SELECT COALESCE(SUM(total_cost), 0) INTO v_total_purchases FROM public.receipts WHERE store_id = p_store_id AND status = 'active' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(final_amount), 0) INTO v_total_commissions FROM public.commission_payments WHERE store_id = p_store_id AND status = 'paid' AND paid_at >= v_date_from AND paid_at < v_date_to;
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, total_sales, total_devolutions, total_purchases, total_commissions, total_cash_balance, closed_by, closed_at)
        VALUES (p_store_id, p_year, p_month, 'closed', v_total_sales, v_total_devolutions, v_total_purchases, v_total_commissions, v_total_sales - v_total_devolutions - v_total_commissions, v_uid, now())
        RETURNING id INTO v_closing_id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'closing_id', v_closing_id, 'total_sales', v_total_sales, 'total_devolutions', v_total_devolutions, 'total_purchases', v_total_purchases, 'total_commissions', v_total_commissions);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  INSERT INTO public.transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at,
    customer_name, customer_phone
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    p_payment_method::payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(),
    v_order.customer_name, v_order.customer_phone
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO public.transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- Marcar orden como closed y vincular transaction
  UPDATE public.production_orders
    SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id
    WHERE id = p_order_id;

  RETURN v_transaction_id;
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_quantity numeric;
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar movimiento original
  SELECT * INTO v_orig FROM public.stock_movements
  WHERE id = p_original_movement_id AND store_id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MOVEMENT_NOT_FOUND';
  END IF;

  -- Compensación: invertir el quantity_change
  v_new_quantity := -v_orig.quantity_change;

  -- Registrar movimiento compensatorio
  PERFORM public.register_stock_movement(
    p_product_id := v_orig.product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := v_new_quantity,
    p_movement_type := 'adjustment',
    p_unit_cost := v_orig.unit_cost,
    p_reason := 'COMPENSATION: ' || COALESCE(p_reason, 'inventory error'),
    p_operation_date := NOW(),
    p_skip_access_check := (v_caller_uid IS NULL)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'original_movement_id', p_original_movement_id,
    'compensation_quantity', v_new_quantity,
    'product_id', v_orig.product_id
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
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
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_devolution_id UUID; v_dev_number TEXT; v_item JSONB; v_total NUMERIC := 0;
    v_pid UUID; v_qty NUMERIC; v_price NUMERIC; v_item_total NUMERIC;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_dev_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::NUMERIC; v_price := (v_item->>'unit_price')::NUMERIC;
        v_total := v_total + (v_qty * v_price);
    END LOOP;
    INSERT INTO public.devolutions (store_id, original_transaction_id, devolution_number, reason, total_amount, currency, payment_method, status, customer_id, customer_name, notes, processed_by)
    VALUES (p_store_id, p_original_transaction_id, v_dev_number, p_reason, v_total, 'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes, v_uid)
    RETURNING id INTO v_devolution_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID; v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC; v_item_total := v_qty * v_price;
        INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
        VALUES (v_devolution_id, v_pid, v_qty, v_price, v_item_total, v_item->>'reason');
        UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_pid;
        INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
        SELECT p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_item_total, stock_current, cost_average, stock_current * cost_average, 'devolution', v_devolution_id, 'Devolucion ' || v_dev_number, v_uid
        FROM public.products WHERE id = v_pid;
    END LOOP;
    RETURN jsonb_build_object('status', 'success', 'devolution_id', v_devolution_id, 'devolution_number', v_dev_number, 'total', v_total);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count_id UUID;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  -- Autorización
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Crear cabecera
  INSERT INTO public.physical_counts (
    store_id, status, started_at, started_by, notes
  ) VALUES (
    p_store_id, 'in_progress', NOW(), v_caller_uid, p_notes
  ) RETURNING id INTO v_count_id;

  -- Cargar todos los productos activos de la tienda con su stock actual
  INSERT INTO public.physical_count_items (count_id, product_id, expected_quantity, unit_cost)
  SELECT
    v_count_id,
    p.id,
    COALESCE(p.stock_current, 0),
    COALESCE(p.cost_average, 0)
  FROM public.products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true;

  -- Actualizar total_items
  UPDATE public.physical_counts
    SET total_items = (SELECT COUNT(*) FROM physical_count_items WHERE count_id = v_count_id)
    WHERE id = v_count_id;

  RETURN v_count_id;
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_valid_until date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_quote_id UUID;
    v_quote_number TEXT;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_pid UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_pname TEXT;
    v_psku TEXT;
    v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    -- V2.10.2 FIX: v_uid no estaba declarado — usaba auth.uid() directamente
    IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    v_quote_number := 'COT-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                      LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');

    INSERT INTO public.quotations (
        store_id, quotation_number, customer_id, customer_name, customer_phone,
        status, total_amount, currency, discount_type, discount_value, notes, valid_until, created_by
    ) VALUES (
        p_store_id, v_quote_number, p_customer_id, p_customer_name, p_customer_phone,
        'draft', 0, 'CUP', p_discount_type, p_discount_value, p_notes, p_valid_until, v_caller_uid
    ) RETURNING id INTO v_quote_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;

        -- V2.10.2 FIX: filtrar por store_id para evitar BOLA
        SELECT name, sku INTO v_pname, v_psku
        FROM public.products
        WHERE id = v_pid AND store_id = p_store_id;

        INSERT INTO public.quotation_items (quotation_id, product_id, product_name, product_sku, quantity, unit_price, total, notes)
        VALUES (v_quote_id, v_pid, COALESCE(v_pname, v_item->>'product_name'), v_psku, v_qty, v_price, v_qty * v_price, v_item->>'notes');

        v_total := v_total + (v_qty * v_price);
    END LOOP;

    -- Aplicar descuento
    IF p_discount_type = 'percentage' AND p_discount_value > 0 THEN
        v_total := v_total - (v_total * p_discount_value / 100);
    ELSIF p_discount_type = 'fixed' AND p_discount_value > 0 THEN
        v_total := v_total - p_discount_value;
    END IF;

    UPDATE public.quotations SET total_amount = v_total WHERE id = v_quote_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'quotation_id', v_quote_id,
        'quotation_number', v_quote_number,
        'total_amount', v_total
    );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_idempotency_key text DEFAULT NULL::text, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_zelle_amount numeric DEFAULT 0, p_warehouse_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_cost numeric;
  v_stock numeric; v_existing uuid;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_rows_affected integer;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  -- Autorización con bypass service_role
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insertar transacción
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed',
    p_payment_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff
  );

  -- Insertar items + descontar stock via register_stock_movement (C1 FIX)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price_at_sale')::numeric;
    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, 0);

    -- C1 FIX: usar register_stock_movement que actualiza products.stock_current
    -- + inventory.quantity + stock_movements + kardex todo atomico
    PERFORM public.register_stock_movement(
      p_product_id := v_pid,
      p_store_id := p_store_id,
      p_user_id := v_uid,
      p_quantity := -v_qty,
      p_movement_type := 'sale',
      p_unit_cost := v_cost,
      p_reason := 'Venta POS',
      p_sale_id := v_tx_id,
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );

    INSERT INTO public.transaction_items (transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_tx_id, v_pid, NULL, v_qty, v_price, v_cost, v_eff);
  END LOOP;

  -- H1 FIX: escribir audit_log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object('total_amount', p_total_amount, 'payment_method', p_payment_method,
      'currency', p_sale_currency, 'exchange_rate', p_sale_exchange_rate,
      'item_count', jsonb_array_length(p_items)));

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
    v_item RECORD;
    v_server_unit_cost NUMERIC;
    v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
    v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
    v_product_exists BOOLEAN;
BEGIN
    -- V2.5 H1a: autorización BOLA
    IF v_caller_uid IS NOT NULL THEN
      IF NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
      END IF;
      IF NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
      END IF;
    END IF;

    PERFORM public.validate_transfer_operation_date(p_operation_date, p_origin_store_id, p_destination_store_id);

    -- V2.10.3: validar que TODOS los productos existan en el store de origen
    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        SELECT EXISTS(
          SELECT 1 FROM public.products WHERE id = v_item.product_id AND store_id = p_origin_store_id
        ) INTO v_product_exists;
        IF NOT v_product_exists THEN
          RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: producto % no existe en store origen', v_item.product_id;
        END IF;
    END LOOP;

    INSERT INTO public.transfers (
      id, origin_store_id, destination_store_id, created_by, notes, tenant_id, created_at,
      requires_approval
    )
    VALUES (
      v_transfer_id, p_origin_store_id, p_destination_store_id,
      v_caller_uid,
      p_notes,
      (SELECT tenant_id FROM public.stores WHERE id = p_origin_store_id),
      v_effective_date,
      public.transfer_requires_approval(p_origin_store_id, p_destination_store_id, p_items)
    );

    FOR v_item IN
      SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tasa_cambio NUMERIC
      )
    LOOP
        SELECT cost_average INTO v_server_unit_cost
        FROM public.products
        WHERE id = v_item.product_id AND store_id = p_origin_store_id;
        IF v_server_unit_cost IS NULL THEN
          v_server_unit_cost := 0;
        END IF;

        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost, created_at)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_server_unit_cost, v_effective_date);
    END LOOP;
    RETURN v_transfer_id;
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_item RECORD;
  v_diff NUMERIC;
  v_new_stock NUMERIC;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  -- 1. Cargar ajuste original
  SELECT * INTO v_orig FROM public.inventory_adjustments WHERE id = p_original_id;
  IF v_orig IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;

  -- 2. Autorización (si v_uid es NULL → service_role bypass)
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_orig.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Crear nuevo ajuste (mismo reason, notes indicando duplicación)
  INSERT INTO public.inventory_adjustments (store_id, created_by, status, reason, notes)
  VALUES (
    v_orig.store_id,
    v_uid,
    'confirmed',
    v_orig.reason,
    COALESCE('Duplicada de ' || LEFT(p_original_id::text, 8) || ' — ' || COALESCE(v_orig.notes, ''), '')
  )
  RETURNING id INTO v_new_id;

  -- 4. Copiar items + aplicar stock atómicamente
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_original_id
  LOOP
    v_diff := v_item.counted_quantity - v_item.expected_quantity;

    -- Insert item (difference es GENERATED, no se especifica)
    INSERT INTO public.inventory_adjustment_items
      (adjustment_id, product_id, expected_quantity, counted_quantity)
    VALUES (v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity);

    -- Actualizar stock ATÓMICAMENTE (UPDATE stock_current = stock_current + diff)
    -- Esto evita race conditions: la DB garantiza serialización del UPDATE
    UPDATE public.products
      SET stock_current = stock_current + v_diff,
          updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_orig.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Kardex entry
    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value,
      reference_type, reference_id, reference_description, created_by
    )
    SELECT
      v_orig.store_id, v_item.product_id, 'adjustment', ABS(v_diff),
      COALESCE(p.cost_average, 0), ABS(v_diff) * COALESCE(p.cost_average, 0),
      COALESCE(v_new_stock, 0), COALESCE(p.cost_average, 0),
      COALESCE(v_new_stock, 0) * COALESCE(p.cost_average, 0),
      'adjustment', v_new_id,
      'Ajuste duplicado de ' || LEFT(p_original_id::text, 8), v_uid
    FROM public.products p
    WHERE p.id = v_item.product_id AND p.store_id = v_orig.store_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', v_new_id,
    'adjustment_number', LEFT(v_new_id::text, 8),
    'items_duplicated', v_count
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- get_reorder_suggestions(p_store_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'product_name', p.name, 'sku', p.sku,
      'current_stock', p.stock_current,
      'suggested_quantity', CASE
        WHEN abc.classification = 'A' THEN GREATEST(50, 100 - p.stock_current)
        WHEN abc.classification = 'B' THEN GREATEST(20, 50 - p.stock_current)
        ELSE GREATEST(10, 20 - p.stock_current)
      END,
      'abc_class', COALESCE(abc.classification, 'C'),
      'priority', CASE
        WHEN COALESCE(abc.classification, 'C') = 'A' AND p.stock_current <= 5 THEN 'critical'
        WHEN COALESCE(abc.classification, 'C') = 'A' THEN 'high'
        WHEN COALESCE(abc.classification, 'C') = 'B' AND p.stock_current <= 0 THEN 'high'
        WHEN p.stock_current <= 0 THEN 'medium'
        ELSE 'low'
      END
    )), '[]'::jsonb)
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT classification FROM public.abc_classifications
      WHERE store_id = p.store_id AND product_id = p.id
        AND period_year = EXTRACT(YEAR FROM now())::int
        AND period_month = EXTRACT(MONTH FROM now())::int
      LIMIT 1
    ) abc ON true
    WHERE p.store_id = p_store_id AND p.is_active = true
      AND p.stock_current <= CASE
        WHEN abc.classification = 'A' THEN 10
        WHEN abc.classification = 'B' THEN 5
        ELSE 0
      END
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
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
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  -- V2.5 H2a: autorización por TIENDA
  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  -- V2.5.5: usar products.stock_current (inventory.quantity tiene trigger inmutable)
  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);

  IF p_quantity_delta < 0 THEN
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
  ELSE
    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
    v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;
  END IF;

  -- V2.5.5: UPDATE en products (no en inventory que tiene trigger)
  UPDATE public.products
    SET stock_current = v_nuevo_stock,
        cost_average = CASE WHEN p_quantity_delta > 0 THEN v_nuevo_costo_unitario ELSE cost_average END,
        updated_at = v_effective_date
    WHERE id = p_product_id AND store_id = p_store_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date,
    p_skip_access_check := (v_caller_uid IS NULL)  -- V2.5.5: bypass si service_role
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock, 'new_cost_average', v_costo_promedio_actual);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric DEFAULT 0, p_warehouse_id uuid DEFAULT NULL::uuid, p_lot_number text DEFAULT NULL::text, p_expiration_date date DEFAULT NULL::date, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Recepción a almacén'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_lot_id uuid;
  v_wh_id uuid;
  v_has_wh boolean := false;
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.warehouses WHERE store_id = p_store_id AND is_active = true) INTO v_has_wh;
  IF p_warehouse_id IS NOT NULL THEN v_wh_id := p_warehouse_id;
  ELSIF v_has_wh THEN
    SELECT id INTO v_wh_id FROM public.warehouses WHERE store_id = p_store_id AND is_active = true AND is_default = true LIMIT 1;
    IF v_wh_id IS NULL THEN SELECT id INTO v_wh_id FROM public.warehouses WHERE store_id = p_store_id AND is_active = true LIMIT 1; END IF;
  END IF;
  UPDATE public.products SET stock_current = stock_current + p_quantity, cost_average = CASE WHEN stock_current + p_quantity = 0 THEN 0 ELSE ((stock_current * cost_average) + (p_quantity * p_unit_cost)) / (stock_current + p_quantity) END, updated_at = now() WHERE id = p_product_id AND store_id = p_store_id;
  IF v_wh_id IS NOT NULL THEN
    INSERT INTO public.warehouse_stock (store_id, warehouse_id, product_id, quantity, updated_at) VALUES (p_store_id, v_wh_id, p_product_id, p_quantity, now()) ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = warehouse_stock.quantity + p_quantity, updated_at = now();
  END IF;
  IF p_lot_number IS NOT NULL THEN
    INSERT INTO public.product_lots (store_id, product_id, lot_number, expiration_date, quantity_received, quantity_remaining, unit_cost, status, created_by) VALUES (p_store_id, p_product_id, p_lot_number, p_expiration_date, p_quantity, p_quantity, p_unit_cost, 'active', v_uid) RETURNING id INTO v_lot_id;
  END IF;
  -- FIX: use 'purchase' (valid enum value) instead of 'reception'
  INSERT INTO public.stock_movements (store_id, product_id, movement_type, quantity_change, unit_cost, reference_doc, created_by) VALUES (p_store_id, p_product_id, 'purchase', p_quantity, p_unit_cost, p_reason, v_uid);
  RETURN jsonb_build_object('status', 'success', 'product_id', p_product_id, 'quantity_added', p_quantity, 'warehouse_id', v_wh_id, 'lot_id', v_lot_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id INTO v_store_id FROM public.physical_counts WHERE id = p_count_id;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;

  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.physical_count_items
    SET counted_quantity = p_counted_quantity,
        counted_at = NOW(),
        notes = COALESCE(p_notes, notes)
    WHERE count_id = p_count_id AND product_id = p_product_id;

  RETURN jsonb_build_object('status', 'success', 'count_id', p_count_id, 'product_id', p_product_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING';
  END IF;

  IF v_caller_uid IS NOT NULL AND NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.transfers
    SET status = 'CANCELADA',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'new_status', 'CANCELADA'
  );
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- FIX V2.3.2: usar 'difference' (columna real) en vez de 'quantity_change'
  FOR v_item IN
    SELECT product_id, difference FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Invertir el ajuste: si sumó X, ahora resta X (y viceversa)
    UPDATE public.products
      SET stock_current = stock_current - v_item.difference, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_adj.store_id, v_item.product_id, 'adjustment', ABS(v_item.difference), 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_adjustment_id, 'Reversión de ajuste', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'adjustment_id', p_adjustment_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_dev.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_devolution_id, 'Reversión de devolución', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_order.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED: use reverse solo en órdenes avanzadas'; END IF;
  IF v_order.status IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: no se puede revertir una orden sin avance (use void)';
  END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, actual_qty, variant_id
    FROM public.production_order_items
    WHERE order_id = p_order_id AND actual_qty > 0
  LOOP
    UPDATE public.products
      SET stock_current = stock_current + v_item.actual_qty, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_order.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_order.store_id, v_item.product_id, 'devolution_in', v_item.actual_qty, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_order_id, 'Reversión de orden: insumo devuelto', v_uid
    FROM public.products p WHERE p.id = v_item.product_id AND p.store_id = v_order.store_id;

    v_count := v_count + 1;
  END LOOP;

  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0
     AND v_order.status IN ('completed', 'closed') THEN

    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_order.output_quantity), updated_at = now()
      WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_order.store_id, v_order.output_product_id, 'out', v_order.output_quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_order_id, 'Reversión de orden: output retirado', v_uid
    FROM public.products p WHERE p.id = v_order.output_product_id AND p.store_id = v_order.store_id;

    v_count := v_count + 1;
  END IF;

  UPDATE public.production_orders
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_order_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'order_id', p_order_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_receipt.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_receipt.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_receipt_id, 'Reversión de recepción', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.receipts
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_receipt_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'receipt_id', p_receipt_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN RAISE EXCEPTION 'ERR_NOT_CONFIRMED: Solo se pueden revertir transferencias confirmadas'; END IF;
  IF v_uid IS NOT NULL AND NOT public.has_store_access_as(v_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    UPDATE public.products SET stock_current = stock_current + v_item.quantity, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_transfer.origin_store_id;
    UPDATE public.products SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_transfer.destination_store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_transfer.origin_store_id, v_item.product_id, 'transfer_in', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_transfer_id, 'Reversión de transferencia', v_uid
    FROM public.products p WHERE p.id = v_item.product_id AND p.store_id = v_transfer.origin_store_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.transfers
    SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid DEFAULT NULL::uuid, p_store_id uuid DEFAULT NULL::uuid, p_threshold_amount numeric DEFAULT NULL::numeric, p_threshold_quantity numeric DEFAULT NULL::numeric, p_approver_roles text[] DEFAULT ARRAY['admin'::text, 'encargado'::text], p_is_active boolean DEFAULT true, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule_id UUID;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
BEGIN
  -- V2.10: autorización — admin global o service_role (bypass)
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    IF v_user_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo admin puede configurar reglas de aprobación';
    END IF;
  END IF;

  -- Upsert
  INSERT INTO public.transfer_approval_rules (
    tenant_id, store_id, threshold_amount, threshold_quantity,
    approver_roles, is_active, created_by
  ) VALUES (
    p_tenant_id, p_store_id, p_threshold_amount, p_threshold_quantity,
    p_approver_roles, p_is_active, v_caller_uid
  )
  ON CONFLICT (tenant_id, store_id) DO UPDATE SET
    threshold_amount = EXCLUDED.threshold_amount,
    threshold_quantity = EXCLUDED.threshold_quantity,
    approver_roles = EXCLUDED.approver_roles,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING id INTO v_rule_id;

  RETURN v_rule_id;
END;
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
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
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
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
$function$
;
-- ────────────────────────────────────────────────────────────────────────
-- void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tx RECORD; v_item RECORD;
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore integer;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NOT NULL THEN
    SELECT store_id INTO v_tx.store_id FROM public.transactions WHERE id = p_transaction_id;
    IF v_tx.store_id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
    IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;

  UPDATE public.transactions SET status = 'voided', cancelled_at = v_eff, void_reason = p_reason WHERE id = p_transaction_id;

  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units_to_restore := v_item.quantity * v_conversion_factor;

    -- H2 FIX: usar register_stock_movement para restaurar stock atomically
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_void',
      p_reason := p_reason,
      p_sale_id := p_transaction_id,
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );
  END LOOP;

  -- H2 FIX: escribir audit_log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'voided_at', v_eff));

  RETURN jsonb_build_object('status', 'ok', 'transaction_id', p_transaction_id);
END;
$function$
;

NOTIFY pgrst, 'reload schema';

COMMIT;
