-- =====================================================================
-- GENERATED FILE — DO NOT EDIT BY HAND
-- Generator : scripts/export-contract-surface.cjs
-- Captured  : 2026-10-26T16:03:06.313Z
-- Project   : wthkddeleylijmonclxg
-- Functions : 153 (SECURITY DEFINER write functions, public schema)
-- Source    : same census query as scripts/security-contract-test.cjs (LIVE)
-- =====================================================================
-- scripts/security-contract-test-static.cjs (CI, no secrets) replays this
-- snapshot as Layer A of the security contract. Re-run the generator to
-- re-certify after authorized production changes.
-- =====================================================================
-- @contract-function name=adjust_sale_payment args="p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_items_price_adjustments jsonb, p_discount_type text, p_discount_value numeric, p_reason text" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_cash_amount numeric DEFAULT NULL::numeric, p_transfer_amount numeric DEFAULT NULL::numeric, p_zelle_amount numeric DEFAULT NULL::numeric, p_sale_currency text DEFAULT NULL::text, p_sale_exchange_rate numeric DEFAULT NULL::numeric, p_items_price_adjustments jsonb DEFAULT NULL::jsonb, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_old_data JSONB;
  v_new_data JSONB;
  v_old_items JSONB;
  v_new_items JSONB;
  v_items_changed BOOLEAN := FALSE;
  v_payment_changed BOOLEAN := FALSE;
  v_new_subtotal NUMERIC := 0;
  v_new_total NUMERIC := 0;
  v_price_adj JSONB;
  v_adj_product_id UUID;
  v_adj_price NUMERIC;
  v_adj_price_cup NUMERIC;
  v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- V2.12.9 anti-spoofing
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar transacción
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  -- Verificar acceso a la store
  IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- No permitir ajustar ventas ya anuladas o reversadas
  IF v_tx.status IN ('voided', 'reversed', 'cancelled') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
  END IF;

  -- Snapshot BEFORE (transacción + items)
  SELECT jsonb_build_object(
    'total_amount', v_tx.total_amount,
    'subtotal', v_tx.subtotal,
    'payment_method', v_tx.payment_method,
    'cash_amount', v_tx.cash_amount,
    'transfer_amount', v_tx.transfer_amount,
    'zelle_amount', v_tx.zelle_amount,
    'sale_currency', v_tx.sale_currency,
    'sale_exchange_rate', v_tx.sale_exchange_rate,
    'discount_type', v_tx.discount_type,
    'discount_value', v_tx.discount_value
  ) INTO v_old_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_old_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_old_data := v_old_data || jsonb_build_object('items', v_old_items);

  -- 1. Ajustar payment_method si se proporciona
  -- AUDITORÍA 2026-10-21 (trampa de nulidad): transactions.payment_method es
  -- NULLABLE. `p <> v_tx.payment_method::text` con v_tx NULL ⇒ NULL ⇒ el IF
  -- NO se ejecuta ⇒ v_payment_changed=false ⇒ el bloque UPDATE (paso 5) se
  -- OMITE COMPLETO ⇒ el ajuste solicitado se descarta en silencio con audit
  -- «success» y changes=[]. IS DISTINCT FROM detecta NULL⇄valor como cambio
  -- real; para operandos no nulos es idéntico a <> (tabla de verdad empírica).
  IF p_payment_method IS NOT NULL AND p_payment_method IS DISTINCT FROM v_tx.payment_method::text THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'payment_method');
  END IF;

  -- 2. Ajustar montos de pago
  IF p_cash_amount IS NOT NULL AND p_cash_amount <> COALESCE(v_tx.cash_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'cash_amount');
  END IF;
  IF p_transfer_amount IS NOT NULL AND p_transfer_amount <> COALESCE(v_tx.transfer_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'transfer_amount');
  END IF;
  IF p_zelle_amount IS NOT NULL AND p_zelle_amount <> COALESCE(v_tx.zelle_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'zelle_amount');
  END IF;
  IF p_sale_currency IS NOT NULL AND p_sale_currency <> v_tx.sale_currency THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_currency');
  END IF;
  IF p_sale_exchange_rate IS NOT NULL AND p_sale_exchange_rate <> v_tx.sale_exchange_rate THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_exchange_rate');
  END IF;
  IF p_discount_type IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_type');
  END IF;
  IF p_discount_value IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_value');
  END IF;

  -- 3. Ajustar precios de items (price_at_sale)
  IF p_items_price_adjustments IS NOT NULL THEN
    FOR v_price_adj IN SELECT * FROM jsonb_array_elements(p_items_price_adjustments)
    LOOP
      v_adj_product_id := (v_price_adj->>'product_id')::UUID;
      v_adj_price := (v_price_adj->>'price_at_sale')::NUMERIC;

      -- Validar: NO permitir cambiar quantity o cost_at_sale
      IF (v_price_adj ? 'quantity') OR (v_price_adj ? 'cost_at_sale') THEN
        RAISE EXCEPTION 'ERR_IMMUTABLE_FIELD: quantity y cost_at_sale no son ajustables (NIC 2)';
      END IF;

      -- Cargar item actual para validar que existe y obtener currency
      SELECT * INTO v_item FROM public.transaction_items
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: product_id=% no está en la transacción', v_adj_product_id;
      END IF;

      IF v_adj_price < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale no puede ser negativo';
      END IF;

      -- Recalcular price_at_sale_cup basado en sale_currency/exchange_rate
      v_adj_price_cup := CASE
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = v_item.price_currency THEN v_adj_price
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'CUP' AND v_item.price_currency = 'USD' THEN v_adj_price * COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'USD' AND v_item.price_currency = 'CUP' THEN v_adj_price / COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        ELSE v_adj_price
      END;

      UPDATE public.transaction_items
        SET price_at_sale = v_adj_price,
            price_at_sale_cup = v_adj_price_cup
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id;

      v_items_changed := TRUE;
      v_changes := array_append(v_changes, 'item_price:' || v_adj_product_id);
    END LOOP;
  END IF;

  -- 4. Recalcular subtotal y total_amount desde items (si se ajustaron precios)
  IF v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    SELECT COALESCE(SUM(price_at_sale_cup * quantity), 0) INTO v_new_subtotal
      FROM public.transaction_items WHERE transaction_id = p_transaction_id;

    -- Aplicar descuento
    DECLARE
      v_disc_type TEXT := COALESCE(p_discount_type, v_tx.discount_type::text, 'fixed');
      v_disc_val NUMERIC := COALESCE(p_discount_value, v_tx.discount_value, 0);
    BEGIN
      IF v_disc_type = 'percentage' THEN
        v_new_total := v_new_subtotal * (1 - (v_disc_val / 100.0));
      ELSE
        v_new_total := v_new_subtotal - v_disc_val;
      END IF;
      v_new_total := GREATEST(v_new_total, 0);
    END;
  ELSE
    v_new_subtotal := v_tx.subtotal;
    v_new_total := v_tx.total_amount;
  END IF;

  -- 5. Aplicar cambios de payment (si hay)
  IF v_payment_changed OR v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    UPDATE public.transactions
      SET
        payment_method = COALESCE(p_payment_method::public.payment_method_enum, payment_method),
        cash_amount = COALESCE(p_cash_amount, cash_amount),
        transfer_amount = COALESCE(p_transfer_amount, transfer_amount),
        zelle_amount = COALESCE(p_zelle_amount, zelle_amount),
        sale_currency = COALESCE(p_sale_currency, sale_currency),
        sale_exchange_rate = COALESCE(p_sale_exchange_rate, sale_exchange_rate),
        discount_type = COALESCE(p_discount_type::public.discount_type_enum, discount_type),
        discount_value = COALESCE(p_discount_value, discount_value),
        subtotal = v_new_subtotal,
        total_amount = v_new_total,
        updated_at = NOW()
      WHERE id = p_transaction_id;
  END IF;

  -- 6. Snapshot AFTER
  SELECT jsonb_build_object(
    'total_amount', v_new_total,
    'subtotal', v_new_subtotal,
    'payment_method', COALESCE(p_payment_method, v_tx.payment_method::text),
    'cash_amount', COALESCE(p_cash_amount, v_tx.cash_amount),
    'transfer_amount', COALESCE(p_transfer_amount, v_tx.transfer_amount),
    'zelle_amount', COALESCE(p_zelle_amount, v_tx.zelle_amount),
    'sale_currency', COALESCE(p_sale_currency, v_tx.sale_currency),
    'sale_exchange_rate', COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate),
    'discount_type', COALESCE(p_discount_type, v_tx.discount_type::text),
    'discount_value', COALESCE(p_discount_value, v_tx.discount_value)
  ) INTO v_new_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_new_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_new_data := v_new_data || jsonb_build_object('items', v_new_items);

  -- 7. Audit log (V2.12.17 — trazabilidad NIIF 15 + IAS 8)
  INSERT INTO public.audit_logs (
    action, table_name, record_id, store_id, user_id,
    old_data, new_data, metadata
  )
  VALUES (
    CASE WHEN v_items_changed THEN 'SALE_PRICE_ADJUST' ELSE 'SALE_PAYMENT_ADJUST' END,
    'transactions',
    p_transaction_id,
    v_tx.store_id,
    v_caller_uid,
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'changes', to_jsonb(v_changes),
      'reason', p_reason,
      'items_changed', v_items_changed,
      'payment_changed', v_payment_changed,
      'adjustment_timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'old_total', v_tx.total_amount,
    'new_total', v_new_total,
    'changes', to_jsonb(v_changes),
    'audit_logged', TRUE
  );
END;
$function$


-- @contract-function name=adjust_total_amount args="p_transaction_id uuid, p_new_total numeric, p_reason text" owner=costpro_transaction_adjuster proacl={costpro_transaction_adjuster=X/costpro_transaction_adjuster,authenticated=X/costpro_transaction_adjuster}
CREATE OR REPLACE FUNCTION public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid; v_old_total numeric; v_store_id uuid; v_paid_total numeric; v_lock_key bigint;
BEGIN
  v_actor := public.app_actor_uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013'; END IF;
  IF p_new_total IS NULL OR p_new_total < 0 THEN RAISE EXCEPTION 'ERR_INVALID_TOTAL' USING ERRCODE = 'PT012'; END IF;
  v_lock_key := hashtextextended(p_transaction_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  SELECT total_amount, store_id INTO v_old_total, v_store_id FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016'; END IF;
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total FROM public.payment_transactions WHERE transaction_id = p_transaction_id;
  IF v_paid_total > p_new_total + 0.01 THEN RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS' USING ERRCODE = 'PT002'; END IF;
  IF v_old_total = p_new_total THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP', 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
    RETURN true;
  END IF;
  UPDATE public.transactions SET total_amount = p_new_total WHERE id = p_transaction_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason, 'paid_total_at_time', v_paid_total, 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
  RETURN true;
END;
$function$


-- @contract-function name=apply_physical_count args="p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
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


-- @contract-function name=approve_transfer args="p_transfer_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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

  -- AUDITORÍA 2026-10-21 (trampa de nulidad): transfers.status es NULLABLE
  -- (information_schema viva). `NULL != 'PENDIENTE'` ⇒ NULL ⇒ guard saltado ⇒
  -- se aprobaba una transferencia de estado DESCONOCIDO. IS DISTINCT FROM
  -- trata NULL como «no es PENDIENTE» ⇒ fail-closed.
  IF v_transfer.status IS DISTINCT FROM 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
  END IF;

  -- AUDITORÍA 2026-10-21 (trampa de nulidad): transfers.requires_approval es
  -- NULLABLE. `NOT NULL` ⇒ NULL ⇒ guard saltado ⇒ se aprobaba una
  -- transferencia con requisito de aprobación DESCONOCIDO. COALESCE(...,false)
  -- es el patrón que YA usa confirm_transfer (v2.12.10, 20260727000007):
  -- NULL ⇒ sin requisito ⇒ NO se aprueba por esta vía (fail-closed) y la
  -- semántica queda alineada entre ambos RPC del flujo.
  IF NOT COALESCE(v_transfer.requires_approval, false) THEN
    RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
  END IF;

  IF v_transfer.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_APPROVED';
  END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
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


-- @contract-function name=assign_user_organization args="p_actor_id uuid, p_user_id uuid, p_tenant_id uuid, p_confirm_removals boolean" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.assign_user_organization(p_actor_id uuid, p_user_id uuid, p_tenant_id uuid, p_confirm_removals boolean DEFAULT false)
 RETURNS TABLE(applied boolean, requires_confirmation boolean, removed_memberships integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- CORRECCIÓN CP-ORG-001 (a): patrón anti-spoofing H-7 — un llamado
  -- authenticated usa SIEMPRE auth.uid() como actor (p_actor_id se ignora);
  -- solo service_role (la ruta API con clave de servicio) puede declarar
  -- p_actor_id (la sesión del usuario autenticado que la invoca).
  v_actor_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_actor_id, auth.uid()) ELSE auth.uid() END;
  v_actor_role public.user_role;
  v_actor_tenant uuid;
  v_user_tenant uuid;
  v_user_role public.user_role;
  v_target_active boolean;
  v_old_tenant uuid;
  v_removed int := 0;
BEGIN
  IF v_actor_uid IS NULL OR p_user_id IS NULL THEN
    RETURN QUERY SELECT false, false, 0, 'Parámetros incompletos'::text;
    RETURN;
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
    FROM public.profiles WHERE id = v_actor_uid;
  IF NOT FOUND OR v_actor_role NOT IN ('admin', 'superadmin') THEN
    RETURN QUERY SELECT false, false, 0, 'El actor no tiene permisos administrativos'::text;
    RETURN;
  END IF;

  SELECT role, tenant_id INTO v_user_role, v_user_tenant
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 0, 'Usuario destino no encontrado'::text;
    RETURN;
  END IF;

  IF v_user_role = 'superadmin' THEN
    RETURN QUERY SELECT false, false, 0, 'La cuenta SuperAdmin de plataforma no pertenece a una empresa'::text;
    RETURN;
  END IF;

  -- Admin ordinario: solo su propia empresa, y solo usuarios de su empresa.
  IF v_actor_role <> 'superadmin' THEN
    IF p_tenant_id IS DISTINCT FROM v_actor_tenant OR v_user_tenant IS DISTINCT FROM v_actor_tenant THEN
      RETURN QUERY SELECT false, false, 0, 'Un administrador solo puede gestionar su propia empresa'::text;
      RETURN;
    END IF;
  END IF;

  IF p_tenant_id IS NOT NULL THEN
    SELECT is_active INTO v_target_active FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, false, 0, 'La organización no existe'::text;
      RETURN;
    END IF;
    IF NOT v_target_active THEN
      RETURN QUERY SELECT false, false, 0, 'La organización está inactiva'::text;
      RETURN;
    END IF;
  END IF;

  v_old_tenant := v_user_tenant;

  -- Membresías que quedarían de otra empresa (tiendas con tenant distinto
  -- del destino). Tiendas sin tenant (legacy) no se consideran ajenas.
  SELECT count(*) INTO v_removed
    FROM public.user_store_memberships m
    JOIN public.stores s ON s.id = m.store_id
   WHERE m.user_id = p_user_id
     AND m.status = 'active'
     AND s.tenant_id IS NOT NULL
     AND s.tenant_id IS DISTINCT FROM p_tenant_id;

  IF v_removed > 0 AND NOT p_confirm_removals THEN
    RETURN QUERY SELECT false, true, v_removed,
      'La reasignación retirará membresías de tiendas de otra empresa; confirma para aplicar'::text;
    RETURN;
  END IF;

  -- Aplicación atómica: retirar memberships ajenos + mover empresa +
  -- limpiar tienda activa/store_id si quedaron apuntando afuera.
  IF v_removed > 0 THEN
    DELETE FROM public.user_store_memberships m
     USING public.stores s
     WHERE m.store_id = s.id
       AND m.user_id = p_user_id
       AND m.status = 'active'
       AND s.tenant_id IS NOT NULL
       AND s.tenant_id IS DISTINCT FROM p_tenant_id;
  END IF;

  -- CORRECCIÓN CP-ORG-001 (b): tenant_id se aplica SIEMPRE (el cambio de
  -- empresa nunca se omite). active_store_id solo se limpia cuando apunta a
  -- una tienda AJENA al destino (con tenant asignado distinto); si pertenece
  -- al destino o es legacy sin tenant, se conserva (coherente con el
  -- criterio de las membresías que se retiran arriba).
  UPDATE public.profiles
     SET tenant_id = p_tenant_id,
         active_store_id = CASE
           WHEN active_store_id IS NULL THEN NULL
           WHEN EXISTS (
             SELECT 1 FROM public.stores s2
             WHERE s2.id = profiles.active_store_id
               AND s2.tenant_id IS NOT NULL
               AND s2.tenant_id IS DISTINCT FROM p_tenant_id
           ) THEN NULL
           ELSE active_store_id
         END,
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO public.user_audit_log (
    performed_by, target_user_id, action, old_values, new_values, metadata
  ) VALUES (
    v_actor_uid,
    p_user_id,
    'assign_organization',
    jsonb_build_object('tenant_id', v_old_tenant),
    jsonb_build_object('tenant_id', p_tenant_id),
    jsonb_build_object('removed_memberships', v_removed, 'actor_role', v_actor_role)
  );

  RETURN QUERY SELECT true, false, v_removed, NULL::text;
END;
$function$


-- @contract-function name=audit_backup_restore_protected_change args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_backup_restore_protected_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo auditar si cambió el flag
  IF OLD.backup_restore_protected IS DISTINCT FROM NEW.backup_restore_protected THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, metadata)
    VALUES (
      'backup_restore_protected_changed',
      'stores',
      NEW.id,
      NEW.id,
      jsonb_build_object(
        'old_value', OLD.backup_restore_protected,
        'new_value', NEW.backup_restore_protected,
        'changed_by', COALESCE(auth.uid(), NULL),
        'changed_at', NOW()
      )
    );
  END IF;
  RETURN NEW;
END;
$function$


-- @contract-function name=audit_cash_closures_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_cash_closures_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ DECLARE v_action text; v_record_id uuid; v_store_id uuid; v_user_id uuid; BEGIN v_user_id := auth.uid(); IF TG_OP = 'INSERT' THEN v_action := 'CASH_CLOSURE_CREATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'UPDATE' THEN v_action := 'CASH_CLOSURE_UPDATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'DELETE' THEN v_action := 'CASH_CLOSURE_DELETED'; v_record_id := OLD.id; v_store_id := OLD.store_id; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'cerrado' AND OLD.status = 'pendiente' THEN RETURN NEW; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'pendiente' AND OLD.status = 'cerrado' THEN RETURN NEW; END IF; INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata) VALUES (v_action, 'cash_closures', v_record_id, v_store_id, v_user_id, jsonb_build_object('tg_op', TG_OP, 'old_status', CASE WHEN TG_OP != 'INSERT' THEN OLD.status ELSE NULL END, 'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END)); RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END; $function$


-- @contract-function name=audit_commission_payments_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_commission_payments_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'COMMISSION_PAYMENT_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip si el cambio viene del trigger de flag (ya tiene su propio audit)
    IF NEW.status = 'flagged_for_review' AND OLD.status IN ('approved', 'paid') THEN
      RETURN NEW;
    END IF;
    v_action := 'COMMISSION_PAYMENT_UPDATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'COMMISSION_PAYMENT_DELETED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'commission_payments',
    CASE WHEN TG_OP != 'DELETE' THEN NEW.id ELSE OLD.id END,
    CASE WHEN TG_OP != 'DELETE' THEN NEW.store_id ELSE OLD.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'worker_id', CASE WHEN TG_OP != 'DELETE' THEN NEW.worker_id ELSE OLD.worker_id END,
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END,
      'amount', CASE WHEN TG_OP != 'DELETE' THEN NEW.final_amount ELSE OLD.final_amount END
    ));

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$


-- @contract-function name=audit_fiscal_closings_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_fiscal_closings_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'FISCAL_CLOSING_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'FISCAL_CLOSING_UPDATED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'fiscal_closings',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.store_id ELSE NEW.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'year', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_year ELSE NULL END,
      'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_month ELSE NULL END,
      'status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
    ));

  RETURN NEW;
END;
$function$


-- @contract-function name=audit_payment_transactions_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_payment_transactions_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'SUPPLIER_PAYMENT_REGISTERED' ELSE 'PAYMENT_TRANSACTION_UPDATED' END,
    'payment_transactions',
    NEW.id,
    NEW.store_id,
    NEW.paid_by,
    jsonb_build_object(
      'tg_op', TG_OP,
      'ref_type', NEW.ref_type,
      'ref_id', NEW.ref_id,
      'amount', NEW.amount,
      'amount_cup', NEW.amount_cup,
      'payment_method', NEW.payment_method,
      'currency', NEW.currency
    )
  );
  RETURN NEW;
END;
$function$


-- @contract-function name=audit_product_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_product_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    BEGIN
        INSERT INTO public.audit_logs (
            user_id, action, table_name, record_id, old_data, new_data, store_id
        )
        VALUES (
            auth.uid(),
            'UPDATE_PRODUCT',
            'products',
            NEW.id,
            jsonb_build_object(
                'name', OLD.name,
                'price', OLD.price,
                'cost_price', OLD.cost_price,
                'sku', OLD.sku,
                'price_currency', OLD.price_currency
            ),
            jsonb_build_object(
                'name', NEW.name,
                'price', NEW.price,
                'cost_price', NEW.cost_price,
                'sku', NEW.sku,
                'price_currency', NEW.price_currency
            ),
            NEW.store_id
        );
        RETURN NEW;
    END;
    $function$


-- @contract-function name=audit_profile_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Log creation
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_USER',
            'profiles',
            NEW.id,
            jsonb_build_object('full_name', NEW.full_name, 'role', NEW.role, 'email', NEW.email),
            NULL
        );
    -- Log deletion
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_USER',
            'profiles',
            OLD.id,
            jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role),
            NULL
        );
    -- Log updates
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Log active store change
        IF (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ACTIVE_STORE',
                'profiles',
                NEW.id,
                jsonb_build_object('active_store_id', OLD.active_store_id),
                jsonb_build_object('active_store_id', NEW.active_store_id),
                NEW.active_store_id
            );
        END IF;

        -- Log role change
        IF (OLD.role IS DISTINCT FROM NEW.role) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ROLE',
                'profiles',
                NEW.id,
                jsonb_build_object('role', OLD.role),
                jsonb_build_object('role', NEW.role),
                NEW.active_store_id
            );
        END IF;

        -- Log name change
        IF (OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_USER_NAME',
                'profiles',
                NEW.id,
                jsonb_build_object('full_name', OLD.full_name),
                jsonb_build_object('full_name', NEW.full_name),
                NEW.active_store_id
            );
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$


-- @contract-function name=audit_role_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.user_audit_log (performed_by, action, new_values)
        VALUES (auth.uid(), 'CREATE_ROLE', row_to_json(NEW)::jsonb);
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.user_audit_log (performed_by, action, old_values, new_values)
        VALUES (auth.uid(), 'UPDATE_ROLE_DEFINITION', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.user_audit_log (performed_by, action, old_values)
        VALUES (auth.uid(), 'DELETE_ROLE', row_to_json(OLD)::jsonb);
    END IF;
    RETURN NEW;
END;
$function$


-- @contract-function name=audit_store_access_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_store_access_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
        VALUES (
            auth.uid(), 
            'ASSIGN_STORE', 
            'user_store_access', 
            NEW.id, 
            jsonb_build_object('user_id', NEW.user_id, 'store_id', NEW.store_id)
        );
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
        VALUES (
            auth.uid(), 
            'REMOVE_STORE_ACCESS', 
            'user_store_access', 
            OLD.id, 
            jsonb_build_object('user_id', OLD.user_id, 'store_id', OLD.store_id)
        );
    END IF;
    RETURN NULL;
END;
$function$


-- @contract-function name=audit_store_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.audit_store_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_STORE',
            'stores',
            NEW.id,
            jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active),
            NEW.id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only log if something important changed
        IF (OLD.name IS DISTINCT FROM NEW.name OR OLD.address IS DISTINCT FROM NEW.address OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_STORE_CONFIG',
                'stores',
                NEW.id,
                jsonb_build_object('name', OLD.name, 'address', OLD.address, 'is_active', OLD.is_active),
                jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active),
                NEW.id
            );
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_STORE',
            'stores',
            OLD.id,
            jsonb_build_object('name', OLD.name, 'address', OLD.address),
            OLD.id
        );
    END IF;
    
    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$


-- @contract-function name=auto_kardex_on_stock_movement args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_store_id UUID; v_movement_type TEXT; v_qty NUMERIC; v_unit_cost NUMERIC;
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  v_movement_type := CASE
    WHEN NEW.movement_type IN ('sale', 'void', 'sale_void', 'issue_slip_out') THEN 'out'
    WHEN NEW.movement_type IN ('purchase', 'initial') THEN 'in'
    WHEN NEW.movement_type = 'adjustment' THEN 'adjustment'
    WHEN NEW.movement_type = 'return' THEN 'devolution_in'
    WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
    WHEN NEW.movement_type IN ('transfer', 'transfer_out') THEN 'transfer_out'
    WHEN NEW.movement_type IN ('production_in', 'production_out') THEN 'adjustment'
    WHEN NEW.movement_type = 'purchase_reverse' THEN 'purchase_reverse'
    WHEN NEW.movement_type = 'sale_reverse' THEN 'sale_reverse'
    WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'
    WHEN NEW.movement_type = 'devolution_reverse' THEN 'devolution_out'
    WHEN NEW.movement_type = 'issue_slip_reverse' THEN 'in'
    ELSE 'adjustment'
  END;
  v_qty := ABS(NEW.quantity_change);
  v_unit_cost := COALESCE(NEW.unit_cost, 0);
  INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
  SELECT v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
    p.stock_current, p.cost_average, p.stock_current * p.cost_average,
    'stock_movement', NEW.id, COALESCE(NEW.reference_doc, NEW.movement_type::text), NEW.created_by
  FROM public.products p WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$function$


-- @contract-function name=auto_match_bank_items args="p_statement_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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


-- @contract-function name=bulk_assign_memberships args="p_user_id uuid, p_assignments jsonb, p_actor_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assignment jsonb;
  v_affected int := 0;
  v_failed int := 0;
  v_store_id uuid;
  v_role public.user_role;
  v_status text;
  v_actor uuid;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  -- Actor: patrón create_sale_v2 (20261004130000 §3.1). Bajo service_role el
  -- actor llega EXPLÍCITO por parámetro (la ruta lo deriva de la sesión
  -- verificada); bajo JWT de usuario manda auth.uid() y el parámetro se ignora
  -- (anti-spoofing, doctrina 20260820000001).
  v_actor := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_actor_id, auth.uid())
    ELSE auth.uid()
  END;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- El objetivo de la asignación debe existir (fail-closed, antes del bucle).
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    BEGIN
      v_store_id := (v_assignment->>'store_id')::uuid;
      v_role := (v_assignment->>'role')::public.user_role;
      v_status := COALESCE(v_assignment->>'status', 'active');

      -- Autorización del ACTOR sobre la tienda objetivo (no del rol JWT):
      -- has_store_role_as = bypass admin/superadmin global + membership activa
      -- con rol de gestión en la tienda (20260807000002).
      IF NOT public.has_store_role_as(v_actor, v_store_id, ARRAY['admin', 'manager']::text[]) THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
      VALUES (p_user_id, v_store_id, v_role, v_status)
      ON CONFLICT (user_id, store_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now();

      v_changes := v_changes || jsonb_build_object(jsonb_build_object(
        'store_id', v_store_id,
        'role', v_role::text,
        'status', v_status
      ));

      v_affected := v_affected + 1;
    EXCEPTION
      WHEN foreign_key_violation THEN
        v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Audit log atómico (solo si hubo cambios). performed_by = actor real.
  IF v_affected > 0 THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
    VALUES (
      v_actor, p_user_id, 'MEMBERSHIPS_BULK_ASSIGNED',
      jsonb_build_object('assignments', v_changes),
      jsonb_build_object('affected', v_affected, 'failed', v_failed)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected', v_affected,
    'failed', v_failed,
    'user_id', p_user_id
  );
END;
$function$


-- @contract-function name=bulk_soft_delete_stores args="p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text, p_reason text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_validation JSONB;
  v_blockers JSONB;
  v_errors JSONB[] := '{}'::jsonb[];
  v_processed INTEGER := 0;
  v_token_valid BOOLEAN;
  v_has_protected BOOLEAN;
  v_override_valid BOOLEAN;
  v_confirmation_record RECORD;
  v_override_record RECORD;
  v_caller_role TEXT;
BEGIN
  -- ============================================================
  -- AUTH CHECK: Solo admin puede ejecutar esta función
  -- ============================================================
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar bulk_soft_delete_stores';
    END IF;
  END IF;
  -- Si auth.uid() IS NULL, es service_role — permitir

  -- ============================================================
  -- 1. VALIDATE confirmation_token
  -- ============================================================
  SELECT * INTO v_confirmation_record
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND action = 'delete'
    AND expires_at > NOW()
    AND consumed_at IS NULL
    AND is_override = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_CONFIRMATION_TOKEN';
  END IF;

  IF v_confirmation_record.store_ids != p_store_ids THEN
    RAISE EXCEPTION 'ERR_STORE_IDS_MISMATCH';
  END IF;

  -- ============================================================
  -- 2. VALIDATE tiendas protegidas requieren override_token
  -- ============================================================
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  IF v_has_protected THEN
    IF p_override_token IS NULL THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_REQUIRED';
    END IF;

    SELECT * INTO v_override_record
    FROM public.bulk_confirmation_tokens
    WHERE token = p_override_token
      AND is_override = true
      AND override_for = p_confirmation_token
      AND expires_at > NOW()
      AND consumed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_INVALID_OVERRIDE_TOKEN';
    END IF;

    IF v_override_record.store_ids != v_confirmation_record.store_ids THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_STORE_IDS_MISMATCH';
    END IF;

    IF v_override_record.created_by = v_confirmation_record.created_by THEN
      RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE';
    END IF;

    UPDATE public.bulk_confirmation_tokens SET consumed_at = NOW()
    WHERE token = p_override_token;
  END IF;

  UPDATE public.bulk_confirmation_tokens SET consumed_at = NOW()
  WHERE token = p_confirmation_token;

  -- ============================================================
  -- 3. VALIDATE todas las tiendas
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id = v_store_id AND is_active = true) THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id, 'reason', 'STORE_NOT_FOUND_OR_INACTIVE'
      ));
      CONTINUE;
    END IF;

    SELECT public.validate_store_can_be_modified(v_store_id, 'soft_delete') INTO v_validation;
    v_blockers := v_validation->'blockers';

    IF v_validation->>'can_modify' != 'true' THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id, 'reason', 'HAS_BLOCKING_DEPENDENCIES', 'blockers', v_blockers
      ));
    END IF;
  END LOOP;

  IF array_length(v_errors, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'FAILED', 'processed', 0,
      'total_requested', array_length(p_store_ids, 1),
      'errors', to_jsonb(v_errors), 'reason', p_reason
    );
  END IF;

  -- ============================================================
  -- 4. EXECUTE
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    PERFORM public.soft_delete_store(v_store_id, p_deleted_by);
    v_processed := v_processed + 1;
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_store_deleted', 'stores', NULL,
    jsonb_build_object(
      'store_ids', p_store_ids, 'deleted_by', p_deleted_by,
      'reason', p_reason, 'processed', v_processed,
      'had_protected_stores', v_has_protected,
      'override_used', p_override_token IS NOT NULL, 'deleted_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'COMPLETED', 'processed', v_processed,
    'total_requested', array_length(p_store_ids, 1),
    'errors', '[]'::jsonb, 'reason', p_reason
  );
END;
$function$


-- @contract-function name=bulk_update_products args="_products jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.bulk_update_products(_products jsonb)
 RETURNS TABLE(updated_count integer, inserted_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    DECLARE
        v_inserted_count int;
        v_updated_count int;
        v_row jsonb;
        v_sku text;
        v_store_id uuid;
        v_price numeric;
        v_cost numeric;
        v_currency text;
        v_name text;
        v_image_url text;
        v_category text;
        v_unit text;
        v_xmax text;
    BEGIN
        v_inserted_count := 0;
        v_updated_count := 0;

        FOR v_row IN SELECT * FROM jsonb_array_elements(_products)
        LOOP
            v_sku := v_row->>'sku';
            v_store_id := (v_row->>'store_id')::uuid;
            v_name := v_row->>'name';
            v_price := COALESCE((v_row->>'price')::numeric, 0);
            v_cost := COALESCE((v_row->>'cost_price')::numeric, 0);
            v_currency := COALESCE(UPPER(v_row->>'price_currency'), 'CUP');
            v_image_url := v_row->>'image_url';
            v_category := v_row->>'category';
            v_unit := v_row->>'unit_of_measure';

            IF v_sku IS NULL OR v_store_id IS NULL THEN
                CONTINUE;
            END IF;

            IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
                RETURN QUERY SELECT 0, 0, 'Moneda inválida: ' || v_currency || ' SKU ' || v_sku;
                RETURN;
            END IF;

            IF v_currency = 'CUP' AND v_price > 0 AND v_cost > 0 AND v_price < v_cost THEN
                RETURN QUERY SELECT 0, 0, 'Precio CUP menor que costo SKU ' || v_sku;
                RETURN;
            END IF;

            BEGIN
                WITH upserted AS (
                    INSERT INTO products (
                        store_id, sku, name, cost_price, price, price_currency,
                        image_url, category, unit_of_measure, updated_at
                    ) VALUES (
                        v_store_id, v_sku, v_name, v_cost, v_price, v_currency,
                        v_image_url, v_category, v_unit, NOW()
                    )
                    ON CONFLICT (sku, store_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        price = EXCLUDED.price,
                        cost_price = EXCLUDED.cost_price,
                        price_currency = EXCLUDED.price_currency,
                        image_url = EXCLUDED.image_url,
                        category = EXCLUDED.category,
                        unit_of_measure = EXCLUDED.unit_of_measure,
                        updated_at = NOW()
                    RETURNING xmax::text AS xmax_text
                )
                SELECT xmax_text FROM upserted INTO v_xmax;

                IF v_xmax IS NOT NULL AND v_xmax::int > 0 THEN
                    v_updated_count := v_updated_count + 1;
                ELSE
                    v_inserted_count := v_inserted_count + 1;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN QUERY SELECT 0, 0, 'Error SKU ' || v_sku || ': ' || SQLERRM;
                RETURN;
            END;
        END LOOP;

        RETURN QUERY SELECT v_updated_count, v_inserted_count, NULL::text;
    END;
    $function$


-- @contract-function name=calculate_abc args="p_store_id uuid, p_year integer, p_month integer, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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


-- @contract-function name=cancel_reception args="p_reception_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.cancel_reception(p_reception_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_item RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;

    FOR v_item IN SELECT product_id, quantity, unit_cost FROM public.receipt_items WHERE receipt_id = p_reception_id
    LOOP
        SELECT stock_current INTO v_current_stock
        FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        v_new_stock := COALESCE(v_current_stock,0) - v_item.quantity;

        IF v_new_stock > 0 THEN
            -- DF-01: inversa exacta del blend de la entrada (q<0) vía escritor único.
            -- Antes: base cost_price (defecto) + espejo cp. Compat: stock 0 → WAC último conocido.
            PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_cancel',
                         -v_item.quantity, v_item.unit_cost,
                         jsonb_build_object('rpc','cancel_reception','receipt_id',p_reception_id));
        END IF;

        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_store_id,
            p_user_id := v_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'adjustment',
            p_reason := 'Cancelación de recepción: ' || p_reception_id::TEXT,
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost
        );
    END LOOP;

    UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
END $function$


-- @contract-function name=cancel_transfer args="p_transfer_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
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


-- @contract-function name=cancel_transfer args="p_transfer_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.cancel_transfer(p_transfer_id uuid, p_reason text DEFAULT 'Cancelada'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Actualizar estado
  UPDATE public.transfers
    SET status = 'CANCELADA', notes = COALESCE(notes, '') || ' [CANCELADA: ' || p_reason || ']'
    WHERE id = p_transfer_id;

  -- Liberar reservas ACTIVE
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = NOW()
    WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id AND status = 'ACTIVE';

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_cancelled', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'reservations_released',
      (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'RELEASED')));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$


-- @contract-function name=check_idempotency args="p_key text, p_operation text, p_record_id uuid, p_param_hash text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_existing_result jsonb;
  v_existing_hash text;
  v_inserted_id uuid;
BEGIN
  IF p_key IS NULL THEN RETURN NULL; END IF;

  INSERT INTO idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
  VALUES (p_key, p_operation, p_record_id, p_param_hash, jsonb_build_object('status', 'pending'))
  ON CONFLICT (idempotency_key, operation) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT result, param_hash INTO v_existing_result, v_existing_hash
  FROM idempotency_registry
  WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;

  IF v_existing_hash != p_param_hash THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
  END IF;

  IF v_existing_result->>'status' = 'pending' THEN
    PERFORM pg_sleep(0.1);
    SELECT result INTO v_existing_result
    FROM idempotency_registry
    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    IF v_existing_result->>'status' = 'pending' THEN
      PERFORM pg_sleep(0.2);
      SELECT result INTO v_existing_result
      FROM idempotency_registry
      WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    END IF;
  END IF;

  RETURN v_existing_result;
END;
$function$


-- @contract-function name=cleanup_expired_idempotency_keys args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    DELETE FROM public.idempotency_keys
    WHERE expires_at < now();
END;
$function$


-- @contract-function name=cleanup_old_aggregates args="p_days integer" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.cleanup_old_aggregates(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.usage_aggregates WHERE bucket_start < now() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$


-- @contract-function name=close_cash_shift args="p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_declared_cash_usd numeric, p_notes text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_declared_cash_usd numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_voucher_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_voucher_recoveries numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
  v_window_usd_net numeric := 0;
  v_system_cash_usd numeric := 0;
  v_difference_usd numeric := 0;
BEGIN
  -- 1. SELECT FOR UPDATE + validar status
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'pendiente' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status;
  END IF;

  -- 2. Auth (actor-explícito, sin cambios respecto a v2.18.2)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 2b. REVISIÓN FINAL v2.24.1: gate de rol de autoridad — el CIERRE es
  --     operación sensible y la UI ya lo restringe a admin/manager/encargado
  --     (CashClosureView). El servidor lo replica fail-closed (antes un clerk
  --     podía cerrar vía POST directo: has_store_access_as acepta cualquier
  --     membresía activa).
  IF NOT public.has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_CLOSURE_ROLE: el cierre de turno requiere rol admin, manager o encargado';
  END IF;

  -- 3. Advisory lock por store
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- 4. Fórmula v2.23.0 — Efectivo esperado =
  --      Fondo inicial + Entradas de efectivo − Salidas de efectivo
  --        − Reembolsos en efectivo de devoluciones
  --    Entradas: ventas cobradas en efectivo (parte cash de ventas mixtas
  --      incluida) + anticipos de órdenes de producción/trabajo en efectivo
  --      + ingresos de caja documentados (fondo de cambio y otros).
  --    Salidas: pagos a proveedores en efectivo (recepciones + servicios
  --      recibidos) + comisiones pagadas en efectivo + egresos de caja
  --      documentados (devolución del fondo y otros).
  --    Reembolsos (MISIÓN DE SEGUIMIENTO 2026-10-21, P1): el dinero devuelto
  --      AL CLIENTE en EFECTIVO por una devolución comercial sale físicamente
  --      del cajón (payment_transactions ref_type='devolution',
  --      direction='refund', payment_method='cash'). Reembolsos por
  --      transferencia/zelle NO tocan el efectivo — desde v2.23.0 (decisión
  --      del propietario 2026-10-21, base NETA) restan en el LADO VOUCHERS
  --      del arqueo (voucher_refunds): el dinero salió por ese medio y la
  --      conciliación contra el estado externo es movimiento neto. El crédito
  --      de tienda no genera fila. Ventana por payment_date efectiva — un
  --      refund de un turno cerrado queda congelado en ese cierre (historia
  --      intacta).
  --    NO son efectivo: transferencias y zelle (van a su propio lado del
  --      arqueo); pagos pendientes de documentos (no hay salida de dinero);
  --      cobros de ventas (ref_type='sale') — ya están contados como ventas.
  --    La anulación de un documento inserta fila contraria: el efecto neto
  --      de un documento anulado es CERO en esta fórmula (in + out mismo
  --      importe), sin excluir filas por estado — el ledger siempre manda.

  -- Ventas por canal (columnas de desglose: soportan pago 'mixed')
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= 'infinity'::timestamptz;

  -- Egresos reales de caja — pagos a proveedores en efectivo (recepciones y
  -- servicios recibidos). Excluye ref_type='sale' (cobros de ventas — doble
  -- conteo), 'production_order'/'work' (anticipos = ingresos) y 'commission'.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Anticipos de producción/trabajo EN EFECTIVO son ENTRADAS de caja.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Comisiones SOLO en efectivo.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_closure.created_at
      AND paid_at <= 'infinity'::timestamptz;

  -- Documentos Ingresos/Egresos de caja (fondo de cambio y otros
  -- autorizados). direction in = entrada de efectivo, out = salida.
  -- Los anulados aportan fila original + fila contra ⇒ neto cero.
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos EN EFECTIVO de devoluciones comerciales (P1, 2026-10-21):
  -- el dinero salió del cajón — el esperado baja por el medio real de pago.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos por VOUCHERS de devoluciones (v2.23.0 — decisión del
  -- propietario 2026-10-21, base NETA): el dinero salió por transferencia/
  -- zelle ⇒ el lado vouchers del arqueo baja por el medio real de pago.
  -- Simétrico al término cash_refunds (regla P1); neto cero con los datos
  -- vivos actuales (censo: 0 refunds de vouchers).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_refunds
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'refund'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  -- Calcular totales
  -- RECUPERACIONES de reembolsos revertidos (MISIÓN DE CIERRE 2026-10-24 §4):
  -- simétrico a los refunds — el dinero que VOLVIÓ por el medio real de cobro.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_voucher_recoveries
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method IN ('transfer', 'zelle')
      AND ref_type = 'devolution'
      AND direction = 'recovery'
      AND payment_date > v_closure.created_at
      AND payment_date <= 'infinity'::timestamptz;
  v_system_cash := COALESCE(v_closure.opening_balance, 0)
                 + v_cash_sales + v_cash_production + v_cash_flow_in
                 - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                 - v_cash_refunds + v_cash_recoveries;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales
                             - v_voucher_refunds + v_voucher_recoveries;
  v_difference := (COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0)) - v_system_expected_total;

  -- MISIÓN CAJA 2026-10-23 (D8): lado USD FÍSICO del turno. Esperado USD =
  -- apertura USD + términos USD de la MISMA ventana (clasificación por moneda
  -- del ledger — única fuente: get_cash_currency_summary). El arqueo canónico
  -- CUP de arriba NO se toca. La diferencia USD se REGISTRA tal cual:
  -- jamás se autoajusta el saldo para cuadrar.
  SELECT COALESCE((public.get_cash_currency_summary(
             v_closure.store_id, v_closure.created_at, 'infinity'::timestamptz)->'net'->>'USD')::numeric, 0)
    INTO v_window_usd_net;
  v_system_cash_usd := COALESCE(v_closure.opening_balance_usd, 0) + v_window_usd_net;
  v_difference_usd := round(COALESCE(p_declared_cash_usd, 0) - v_system_cash_usd, 2);

  -- 5. UPDATE closure con valores recalculados
  UPDATE public.cash_closures SET
    status = 'cerrado',
    closed_at = NOW(),
    declared_cash = p_declared_cash,
    declared_vouchers = p_declared_vouchers,
    declared_cash_usd = COALESCE(p_declared_cash_usd, 0),
    declared_total = COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0),
    system_expected_total = v_system_expected_total,
    system_expected_cash_usd = v_system_cash_usd,
    difference = v_difference,
    difference_usd = v_difference_usd,
    notes = p_notes
  WHERE id = p_closure_id;

  -- 6. Audit log atómico
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_closure.store_id, 'CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id,
    jsonb_build_object(
      'system_cash', v_system_cash,
      'expected_total', v_system_expected_total,
      'difference', v_difference,
      'system_cash_usd', v_system_cash_usd,
      'difference_usd', v_difference_usd,
      'formula', 'v2.24.0',
      'cash_sales', v_cash_sales,
      'cash_production_income', v_cash_production,
      'cash_outflows_suppliers', v_cash_outflows,
      'cash_commissions', v_cash_commissions,
      'cash_flow_in', v_cash_flow_in,
      'cash_flow_out', v_cash_flow_out,
      'cash_refunds_devolution', v_cash_refunds,
      'voucher_refunds_devolution', v_voucher_refunds,
      'cash_recoveries_devolution', v_cash_recoveries,
      'voucher_recoveries_devolution', v_voucher_recoveries,
      'transfer_sales', v_transfer_sales,
      'zelle_sales', v_zelle_sales
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'system_cash', v_system_cash,
    'system_expected_total', v_system_expected_total,
    'difference', v_difference,
    'system_cash_usd', v_system_cash_usd,
    'difference_usd', v_difference_usd,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'cash_flow_in', v_cash_flow_in,
    'cash_flow_out', v_cash_flow_out,
    'cash_refunds', v_cash_refunds,
    'voucher_refunds', v_voucher_refunds,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales
  );
END;
$function$


-- @contract-function name=close_fiscal_period args="p_store_id uuid, p_year integer, p_month integer, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_closing_id UUID; v_total_sales NUMERIC := 0; v_total_devolutions NUMERIC := 0;
    v_total_purchases NUMERIC := 0; v_total_commissions NUMERIC := 0;
    v_date_from TIMESTAMPTZ; v_date_to TIMESTAMPTZ;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional (actor real en auditoría
    -- por trigger en la vía HTTP service_role). Aditivo; no altera lógica de negocio.
    IF v_uid IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    END IF;
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


-- @contract-function name=close_physical_inventory args="p_pi_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.close_physical_inventory(p_pi_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending_adj INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'conciliated' THEN
    RAISE EXCEPTION 'ERR_NOT_CONCILIATED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_CLOSE';
  END IF;

  SELECT COUNT(*) INTO v_pending_adj
  FROM public.physical_inventory_adjustments l
  JOIN public.inventory_adjustments a ON a.id = l.adjustment_id
  WHERE l.pi_id = p_pi_id AND a.status = 'pending';

  IF v_pending_adj > 0 THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_PENDING: hay % ajuste(s) pendiente(s) de confirmar; el inventario no puede cerrarse', v_pending_adj;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'closed', closed_at = NOW(), closed_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_CLOSED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'closed');
END;
$function$


-- @contract-function name=close_production_order_v2 args="p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric, p_final_method text, p_final_currency text, p_exchange_rate numeric, p_output_product_id uuid, p_output_quantity numeric, p_user_id uuid, p_idempotency_key text" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL::text, p_final_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_output_product_id uuid DEFAULT NULL::uuid, p_output_quantity numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_transaction_id uuid;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_recv_result jsonb;
  v_existing_result jsonb;
  v_param_hash text;
  v_sum_payments numeric;
BEGIN
  -- ─── 0. Idempotencia — DF-08 FIX: record_id = p_order_id (uuid=uuid, sin ::text) ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      -- AUDITORÍA 2026-10-21 (trampa de nulidad): `!=` contra un hash ausente
      -- (filas legadas de v2.26-g8/hotfix1 — 3/5 reales) evalúa NULL y el IF
      -- NO se ejecuta: se devolvía el resultado original sin verificar que los
      -- parámetros coinciden. IS DISTINCT FROM es fail-closed: hash ausente ⇒
      -- no se puede probar la igualdad ⇒ ERR_IDEMPOTENCY_KEY_REUSE (misma
      -- doctrina que create_cash_flow_document). Para operandos no nulos,
      -- IS DISTINCT FROM ≡ != (tabla de verdad empírica en el informe).
      IF v_existing_result->>'param_hash' IS DISTINCT FROM v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia de estado ───
  IF v_order.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'order_id', p_order_id, 'transaction_id', v_order.transaction_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar que la orden está en progreso ───
  IF v_order.status NOT IN ('in_progress', 'approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSABLE: status %', v_order.status;
  END IF;

  -- ─── 5. Transición a in_progress (si no lo está) ───
  IF v_order.status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_order.status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  -- ─── 6. Pago final (atómico) ───
  IF p_final_amount > 0 AND p_final_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id,
      p_amount := p_final_amount,
      p_payment_method := p_final_method,
      p_paid_by := v_caller_uid,
      p_currency := p_final_currency,
      p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text
    );
  END IF;

  -- PATH A: PRODUCCIÓN → receive consolidado (paquetes 01/03: server-side)
  IF v_order.order_type = 'production' THEN
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT: product_id y quantity > 0 son obligatorios';
    END IF;

    PERFORM public.receive_production_output(
      p_order_id := p_order_id,
      p_product_id := p_output_product_id,
      p_quantity := p_output_quantity,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_idempotency_key := 'recv-' || p_order_id::text
    );

  -- PATH B: SERVICIO
  ELSIF v_order.order_type = 'service' THEN
    SELECT
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_amount, v_transfer_amount, v_zelle_amount
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

    v_effective_method := COALESCE(p_final_method, 'cash');
    IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
      v_effective_method := 'mixed';
    ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
      v_effective_method := 'mixed';
    ELSIF v_cash_amount > 0 THEN
      v_effective_method := 'cash';
    ELSIF v_transfer_amount > 0 THEN
      v_effective_method := 'transfer';
    ELSIF v_zelle_amount > 0 THEN
      v_effective_method := 'zelle';
    END IF;

    INSERT INTO transactions (
      store_id, seller_id, total_amount, payment_method,
      sale_currency, sale_exchange_rate, status, created_at, completed_at,
      customer_name, customer_phone, customer_ci, customer_address,
      subtotal, cash_amount, transfer_amount, zelle_amount
    ) VALUES (
      v_order.store_id, p_seller_id, v_order.budget_total,
      v_effective_method::public.payment_method_enum,
      p_final_currency, p_exchange_rate, 'completed', now(), now(),
      v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
      v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
    ) RETURNING id INTO v_transaction_id;

    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
    );

    UPDATE public.payment_transactions
      SET transaction_id = v_transaction_id
      WHERE ref_type IN ('production_order', 'work')
        AND ref_id = p_order_id
        AND transaction_id IS NULL;

    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_transaction_id;

    IF v_sum_payments > v_order.budget_total + 0.01 THEN
      RAISE EXCEPTION 'ERR_OT_OVERPAID: payments=% > budget_total=%', v_sum_payments, v_order.budget_total;
    END IF;

    IF ABS(v_sum_payments - v_order.budget_total) > 0.01 THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'OT_SALDO_PENDING', 'transactions', v_transaction_id, v_order.store_id, v_caller_uid,
        jsonb_build_object('order_id', p_order_id, 'budget_total', v_order.budget_total,
          'sum_payments_cup', v_sum_payments, 'saldo', v_order.budget_total - v_sum_payments)
      );
    END IF;
  END IF;

  -- ─── 7. Transición a completed → closed ───
  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET
    status = 'closed',
    closed_at = now(),
    transaction_id = COALESCE(v_transaction_id, v_order.transaction_id),
    payment_status = 'paid'
  WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_CLOSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'transaction_id', v_transaction_id,
      'final_amount', p_final_amount,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'payment_transactions_associated', true,
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id),
      'df08_uuid_fix', true
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'transaction_id', v_transaction_id
  );
END $function$


-- @contract-function name=close_service_order_as_sale args="p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_current_status text;
BEGIN
  -- ─── 1. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 3. Idempotencia: si ya está closed con transaction, retornar ───
  IF v_order.status = 'closed' AND v_order.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_closed', 'transaction_id', v_order.transaction_id);
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- ─── 4. Calcular desglose de pagos ───
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  v_effective_method := p_payment_method;
  IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
    v_effective_method := 'mixed';
  ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
    v_effective_method := 'mixed';
  ELSIF v_cash_amount > 0 THEN
    v_effective_method := 'cash';
  ELSIF v_transfer_amount > 0 THEN
    v_effective_method := 'transfer';
  ELSIF v_zelle_amount > 0 THEN
    v_effective_method := 'zelle';
  END IF;

  -- ─── 5. Crear venta ───
  INSERT INTO transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at, completed_at,
    customer_name, customer_phone, customer_ci, customer_address,
    subtotal, cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    v_effective_method::public.payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(), now(),
    v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
    v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
  ) RETURNING id INTO v_transaction_id;

  -- ─── 6. Crear item de venta — cost_at_sale = 0 (regla congelada: servicios no tienen WAC) ───
  INSERT INTO transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- ─── 7. Transición de estados (inline, no sub-LLamada) ───
  SELECT status INTO v_current_status FROM production_orders WHERE id = p_order_id;

  IF v_current_status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_current_status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'PRODUCTION_CLOSED_AS_SALE', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'transaction_id', v_transaction_id,
      'budget_total', v_order.budget_total,
      'cost_at_sale', 0,
      'effective_method', v_effective_method
    )
  );

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id);
END;
$function$


-- @contract-function name=complete_physical_inventory_count args="p_pi_id uuid, p_accept_pending boolean, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.complete_physical_inventory_count(p_pi_id uuid, p_accept_pending boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_progress' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTING (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;

  SELECT COUNT(*) INTO v_pending FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND counted_qty IS NULL;

  IF v_pending > 0 AND NOT p_accept_pending THEN
    RAISE EXCEPTION 'ERR_PENDING_LINES: quedan % línea(s) sin contar; registre su cantidad física (incluido cero) o confirme la aceptación explícita', v_pending;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'counted', count_completed_at = NOW(), count_completed_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_COUNT_COMPLETED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pending_lines', v_pending, 'accepted_pending', p_accept_pending), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'pending_lines', v_pending);
END;
$function$


-- @contract-function name=confirm_inventory_adjustment args="p_adjustment_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_stock NUMERIC;
  v_count INTEGER := 0;
  v_pi_number TEXT;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda (fail-closed: sin usuario autenticado no se confirma)
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_access_as(v_caller_uid, v_adj.store_id)) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Trazabilidad: si el ajuste proviene de un inventario físico, el kardex
  -- lo referencia explícitamente (campo persistido, no texto manual).
  SELECT pi.pi_number INTO v_pi_number
  FROM public.physical_inventories pi
  WHERE pi.id = v_adj.source_physical_inventory_id;
  v_reason := CASE WHEN v_pi_number IS NOT NULL
                   THEN 'Ajuste por inventario físico ' || v_pi_number
                   ELSE 'Ajuste documental confirmado' END;

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
      p_reason := v_reason,
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


-- @contract-function name=confirm_pending_reception args="p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_store_id uuid;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_unit_cost_cup numeric;
  v_units_to_add numeric;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'pending' THEN RAISE EXCEPTION 'ERR_RECEIPT_ALREADY_CONFIRMED: status=%', v_receipt.status; END IF;

  v_store_id := v_receipt.store_id;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
    v_units_to_add := v_item.quantity;

    -- Orden doctrina W62-01 §6: WAC primero → movimiento después (kardex ve ca_new)
    PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_in',
                    v_units_to_add, v_unit_cost_cup,
                    jsonb_build_object('rpc','confirm_pending_reception','receipt_id',p_receipt_id));

    UPDATE products SET updated_at = v_effective_date WHERE id = v_item.product_id AND store_id = v_store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'active', reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id), updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END $function$


-- @contract-function name=confirm_transfer args="p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_mov JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_stock_info JSONB;
  v_available NUMERIC;
  v_rows_affected INTEGER;
  v_ref_doc TEXT;
  v_new_wac NUMERIC;
  v_dest_before NUMERIC;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico — la fecha de
  -- recepción (p_operation_date) se valida ANTES de mover stock/Kardex.
  -- Antes la ruta /api/transfers/[id]/confirm la propagaba sin validación.
  PERFORM public.validate_operation_date(COALESCE(p_operation_date, NOW()), v_transfer.origin_store_id);

  IF COALESCE(v_transfer.requires_approval, false) = true AND v_transfer.approved_at IS NULL THEN
    RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
  END IF;

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    SELECT * INTO v_stock_info FROM public.get_available_stock(v_transfer.origin_store_id, v_item.product_id);
    IF NOT (v_stock_info->>'found')::boolean THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_AT_CONFIRM: %', v_item.product_id;
    END IF;
    v_available := (v_stock_info->>'stock_available')::numeric;
    IF v_available < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, disponible=%, solicitado=%',
        v_item.product_id, v_available, v_item.quantity;
    END IF;
  END LOOP;

  -- DF-06: lock determinista de filas de producto (origen y destino) antes de mover valor
  FOR v_item IN
    SELECT product_id AS pid, origin_store_id AS sid FROM public.transfer_items ti
      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
    UNION
    SELECT destination_product_id AS pid, destination_store_id AS sid FROM public.transfer_items ti
      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
    ORDER BY sid, pid
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_item.pid AND store_id = v_item.sid FOR UPDATE;
  END LOOP;

  UPDATE public.transfers
    SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = v_caller_uid
    WHERE id = p_transfer_id;

  v_ref_doc := 'TRANSFERENCIA ' || UPPER(left(v_transfer.id::text, 8));

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    UPDATE public.inventory_reservations
      SET status = 'CONSUMED', consumed_at = NOW()
      WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id
        AND product_id = v_item.product_id AND status = 'ACTIVE';
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE EXCEPTION 'ERR_RESERVATION_NOT_FOUND: transferencia % producto %', p_transfer_id, v_item.product_id;
    END IF;

    -- DF-06: blend D-01 en destino con uc_transfer congelado, ANTES del dest-in
    -- (kardex del destino lee ca_new). Semilla de destino nuevo = blend con S=0.
    SELECT stock_current INTO v_dest_before FROM public.products
      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id;
    v_new_wac := public.fn_recalc_wac(
      v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_in',
      v_item.quantity, v_item.unit_cost,
      jsonb_build_object('rpc','confirm_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));

    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id,
      'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED'),
      'reference_doc', v_ref_doc,
      'dest_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END $function$


-- @contract-function name=create_cash_flow_document args="p_store_id uuid, p_doc_type text, p_concept text, p_amount numeric, p_currency text, p_exchange_rate numeric, p_operation_date timestamp with time zone, p_counterparty text, p_justification text, p_notes text, p_related_document_id uuid, p_idempotency_key text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_cash_flow_document(p_store_id uuid, p_doc_type text, p_concept text, p_amount numeric, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_counterparty text DEFAULT NULL::text, p_justification text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_related_document_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc_type text := lower(btrim(p_doc_type));
  v_concept text := lower(btrim(COALESCE(p_concept, '')));
  v_amount numeric;
  v_currency text := upper(btrim(COALESCE(p_currency, 'CUP')));
  v_rate numeric;
  v_rate_effective timestamptz;
  v_amount_cup numeric;
  v_op_date timestamptz := COALESCE(p_operation_date, now());
  v_justification text;
  v_shift RECORD;
  v_number text;
  v_doc_id uuid;
  v_payment_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_expected_cash numeric := 0;
  v_fondo numeric := 0;
  v_param_hash text;
  v_idem jsonb;
  v_idem_hash text;
  v_result jsonb;
  v_related public.cash_flow_documents%ROWTYPE;
  v_has_shift boolean := false;
  v_balance_currency numeric := 0;
BEGIN
  -- 1. AUTH actor-explícito (fail-closed) + rol con autoridad para registrar
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado', 'clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda';
  END IF;

  -- 1b. MISIÓN CAJA 2026-10-23 (D4): la ENTREGA de efectivo acumulado exige rol
  --     de autoridad (admin/manager/encargado — clerk NO entrega efectivo) y
  --     contraparte OBLIGATORIA (la persona que recibe el dinero).
  IF v_concept = 'entrega_efectivo' THEN
    IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
      RAISE EXCEPTION 'ERR_DELIVERY_ROLE: la entrega de efectivo requiere rol admin, manager o encargado';
    END IF;
    IF NULLIF(btrim(COALESCE(p_counterparty, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ERR_COUNTERPARTY_REQUIRED: identifique a la persona que recibe el efectivo (contraparte)';
    END IF;
  END IF;

  -- 2. Validación del documento
  IF v_doc_type NOT IN ('ingreso', 'egreso') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOC_TYPE: %', p_doc_type;
  END IF;
  IF v_concept = '' THEN
    RAISE EXCEPTION 'ERR_CONCEPT_REQUIRED';
  END IF;
  IF NOT (
       (v_doc_type = 'ingreso' AND v_concept IN ('constitucion_fondo', 'reposicion_fondo', 'otro_ingreso'))
    OR (v_doc_type = 'egreso'  AND v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo', 'otro_egreso', 'entrega_efectivo'))
  ) THEN
    RAISE EXCEPTION 'ERR_CONCEPT_TYPE_MISMATCH: concepto % no válido para tipo %', v_concept, v_doc_type;
  END IF;
  v_justification := btrim(COALESCE(p_justification, ''));
  IF v_justification = '' THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_REQUIRED';
  END IF;
  IF length(v_justification) > 500 THEN
    RAISE EXCEPTION 'ERR_JUSTIFICATION_TOO_LONG';
  END IF;

  v_amount := COALESCE(p_amount, 0);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: %', p_amount;
  END IF;
  IF v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;
  IF v_currency NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', v_currency;
  END IF;

  -- 3. Tasa de cambio (D8): resolución SERVER-SIDE exclusiva. La tasa del
  --    cliente NO tiene autoridad financiera (se ignora, como en ventas).
  IF v_currency = 'CUP' THEN
    v_rate := 1;
  ELSE
    v_rate := NULL;
    v_rate_effective := NULL;
    SELECT ser.rate, ser.updated_at INTO v_rate, v_rate_effective
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL THEN
      SELECT er.rate, er.rate_date::timestamptz INTO v_rate, v_rate_effective
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'Diviza'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_rate IS NULL OR v_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda antes de operar en esa moneda';
    END IF;
    IF v_rate_effective < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: effective=%', v_rate_effective;
    END IF;
  END IF;

  v_amount_cup := CASE WHEN v_currency = 'CUP' THEN v_amount ELSE v_amount * v_rate END;

  -- 4. Advisory lock por tienda: serializa creaciones/anulaciones concurrentes
  --    sobre la misma caja (evita doble gasto y carreras sobre el fondo).
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 5. IDEMPOTENCIA (replay seguro ante reintentos de red)
  v_param_hash := md5(
    p_store_id::text || '|' || v_caller_uid::text || '|' || v_doc_type || '|' || v_concept || '|'
    || v_amount::text || '|' || v_currency || '|' || COALESCE(p_operation_date::text, '') || '|'
    || COALESCE(btrim(p_counterparty), '') || '|' || v_justification || '|'
    || COALESCE(btrim(p_notes), '') || '|' || COALESCE(p_related_document_id::text, '')
  );
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    -- REVISIÓN FINAL v2.24.1: comparar el hash del payload NUEVO contra el hash
    -- ALMACENADO. (Defecto corregido: la variable v_param_hash se sobrescribía
    -- con el hash almacenado y la comparación nunca ocurría — misma clave con
    -- payload distinto devolvía el documento original EN SILENCIO.) Paridad
    -- con create_sale_v2: conflicto SIN retorno silencioso.
    SELECT ir.result, ir.param_hash INTO v_idem, v_idem_hash
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'create_cash_flow_document'
      LIMIT 1;
    IF v_idem IS NOT NULL THEN
      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: la clave % ya está ligada a otra identidad de documento (payload/actor/tienda)', p_idempotency_key;
      END IF;
      -- hash idéntico ⇒ devolver el resultado original (reintento benigno)
      RETURN v_idem;
    END IF;
  END IF;

  -- 6. TURNO (D5 v2.23.0 + MISIÓN CAJA 2026-10-23): los conceptos ordinarios
  --    exigen turno ABIERTO. La ENTREGA DE EFECTIVO es la única operación
  --    autorizada FUERA de turno: queda identificada como outside_shift con
  --    closure_id NULL (no se fabrica un turno artificial — misión §6).
  SELECT * INTO v_shift FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  v_has_shift := FOUND;
  IF NOT v_has_shift AND v_concept <> 'entrega_efectivo' THEN
    RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: la caja no tiene un turno abierto — abra el turno en Caja antes de registrar ingresos o egresos';
  END IF;

  -- 7. FECHA OPERATIVA: política temporal global (piso 6 meses, no futuro,
  --    días hábiles Habana). Ventana del turno SOLO cuando hay turno.
  --    La entrega fuera de turno conserva su fecha operativa REAL (misión
  --    §5: la entrega del 22/10 se registra con fecha 22/10) y la fecha
  --    física de registro queda en created_at.
  PERFORM public.validate_operation_date(v_op_date, p_store_id);
  IF v_has_shift THEN
    IF v_op_date <= v_shift.created_at OR v_op_date > now() THEN
      RAISE EXCEPTION 'ERR_DATE_OUTSIDE_SHIFT: la fecha operativa debe caer dentro del turno abierto (apertura %)', v_shift.created_at;
    END IF;
  END IF;

  -- 8. SALDO Y FONDO VIGENTES — misma fórmula v2.23.0 que el cierre calculará
  --    (una sola fuente de verdad; se recalcula AHORA bajo advisory lock).
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND created_at > v_shift.created_at AND created_at <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id AND status = 'paid' AND payment_method = 'cash'
      AND paid_at > v_shift.created_at AND paid_at <= 'infinity'::timestamptz;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_flow_in, v_cash_flow_out
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'cash_flow'
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  -- Reembolsos EN EFECTIVO de devoluciones (P1, 2026-10-21): el disponible
  -- real del cajón ya los restó — la validación de egresos también. (Los
  -- refunds por transferencia/zelle NO entran aquí: no afectan el efectivo.)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
    FROM public.payment_transactions
    WHERE store_id = p_store_id AND payment_method = 'cash'
      AND ref_type = 'devolution' AND direction = 'refund'
      AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;

  v_opening := COALESCE(v_shift.opening_balance, 0);
  v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                     - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                     - v_cash_refunds;

  -- Fondo de cambio vigente (D2): apertura + constituciones/reposiciones −
  -- devoluciones (documentos CONFIRMADOS de fondo en la ventana del turno).
  SELECT COALESCE(SUM(
           CASE WHEN doc_type = 'ingreso' THEN amount_cup ELSE -amount_cup END
         ), 0)
    INTO v_fondo
    FROM public.cash_flow_documents
    WHERE store_id = p_store_id
      AND status = 'confirmado'
      AND concept IN ('constitucion_fondo', 'reposicion_fondo',
                      'devolucion_total_fondo', 'devolucion_parcial_fondo')
      AND operation_date > v_shift.created_at
      AND operation_date <= 'infinity'::timestamptz;
  v_fondo := v_opening + v_fondo;

  -- 9. REGLAS DE NEGOCIO por tipo
  IF v_doc_type = 'egreso' THEN
    IF v_concept = 'entrega_efectivo' THEN
      -- MISIÓN CAJA 2026-10-23 (D4): la entrega se valida contra el SALDO
      -- FÍSICO DEL LIBRO en la MONEDA del documento (acumulado desde los
      -- movimientos persistidos — misión §6: «validar que el importe no
      -- exceda el saldo disponible de la moneda correspondiente»). Con o
      -- sin turno, el cajón es el cajón: la validación NO depende de la
      -- ventana canónica del turno.
      SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                       -> 'net' ->> v_currency)::numeric, 0)
        INTO v_balance_currency;
      IF v_amount > v_balance_currency + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, entrega=%', v_currency, round(v_balance_currency, 2), round(v_amount, 2);
      END IF;
    ELSE
      -- MISIÓN POST-MERGE 2026-10-24 (riesgo contable cerrado): un egreso
      -- ordinario entrega BILLETES de la moneda del documento. La existencia
      -- de saldo económico equivalente en la OTRA moneda NO sustituye esos
      -- billetes: una conversión solo puede ocurrir mediante una operación
      -- de cambio explícita (este modelo nunca convierte implícitamente).
      -- Misma fuente autoritativa que entrega_efactivo: net por moneda del
      -- libro físico (get_cash_currency_summary — una sola fuente de verdad).
      SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                       -> 'net' ->> v_currency)::numeric, 0)
        INTO v_balance_currency;
      IF v_amount > v_balance_currency + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, egreso=%', v_currency, round(v_balance_currency, 2), round(v_amount, 2);
      END IF;
      -- Imposibilidad de egresar más efectivo del disponible (canonical CUP,
      -- ventana del turno — concepto ordinario: turno garantizado arriba).
      -- Se CONSERVA como disciplina contable del turno (v2.23.0): el egreso
      -- debe caber TAMBIÉN en el arqueo canónico de la ventana.
      IF v_amount_cup > v_expected_cash + 0.005 THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: disponible=%, egreso=%', round(v_expected_cash, 2), round(v_amount_cup, 2);
      END IF;
      -- Devolución de fondo: nunca más del fondo vigente (5.000 − 2.000 ⇒ quedan 3.000)
      IF v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
        IF v_amount_cup > v_fondo + 0.005 THEN
          RAISE EXCEPTION 'ERR_FUND_INSUFFICIENT: fondo vigente=%, devolución=%', round(v_fondo, 2), round(v_amount_cup, 2);
        END IF;
      END IF;
    END IF;
  END IF;

  -- 10. Vínculo opcional devolución → documento de fondo que la origina
  IF p_related_document_id IS NOT NULL THEN
    IF v_concept NOT IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_NOT_ALLOWED: solo las devoluciones de fondo pueden vincular un documento origen';
    END IF;
    SELECT * INTO v_related FROM public.cash_flow_documents
      WHERE id = p_related_document_id AND store_id = p_store_id
      FOR UPDATE;
    IF NOT FOUND
       OR v_related.status <> 'confirmado'
       OR v_related.doc_type <> 'ingreso'
       OR v_related.concept NOT IN ('constitucion_fondo', 'reposicion_fondo') THEN
      RAISE EXCEPTION 'ERR_RELATED_DOC_INVALID: el documento origen debe ser una constitución/reposición de fondo confirmada de la misma tienda';
    END IF;
  END IF;

  -- 11. NUMERACIÓN (atómica: FOR UPDATE dentro de esta misma transacción)
  v_number := public.next_document_number(p_store_id, 'cash_flow', v_caller_uid);

  -- 12. INSERT documento (confirmado — D4) + efecto financiero UNA vez (D1)
  INSERT INTO public.cash_flow_documents (
    store_id, document_number, doc_type, concept,
    amount, currency, exchange_rate, payment_method,
    operation_date, status, closure_id, responsible_user_id,
    counterparty, justification, notes, related_document_id,
    created_by, confirmed_by, idempotency_key
  ) VALUES (
    p_store_id, v_number, v_doc_type, v_concept,
    v_amount, v_currency, v_rate, 'cash',
    v_op_date, 'confirmado', CASE WHEN v_has_shift THEN v_shift.id ELSE NULL END, v_caller_uid,
    NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
    v_justification,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_related_document_id,
    v_caller_uid, v_caller_uid,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), '')
  )
  RETURNING id INTO v_doc_id;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    p_store_id, 'cash_flow', v_doc_id, v_amount, 'cash',
    v_currency, v_rate, v_op_date,
    v_number || ' · ' || v_concept || ': ' || v_justification,
    v_caller_uid,
    'cf-' || v_doc_id::text,
    CASE v_doc_type WHEN 'ingreso' THEN 'in' ELSE 'out' END
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.cash_flow_documents
    SET payment_transaction_id = v_payment_id
    WHERE id = v_doc_id;

  -- 13. AUDITORÍA atómica (misma transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'CASH_FLOW_CREATED', 'cash_flow_documents', v_doc_id,
    jsonb_build_object(
      'document_number', v_number,
      'doc_type', v_doc_type,
      'concept', v_concept,
      'amount', v_amount,
      'currency', v_currency,
      'exchange_rate', v_rate,
      'amount_cup', round(v_amount_cup, 2),
      'operation_date', v_op_date,
      'closure_id', CASE WHEN v_has_shift THEN v_shift.id ELSE NULL END,
      'outside_shift', (v_concept = 'entrega_efectivo' AND NOT v_has_shift),
      'counterparty', NULLIF(btrim(COALESCE(p_counterparty, '')), ''),
      'justification', v_justification,
      'related_document_id', p_related_document_id,
      'cash_before', round(v_expected_cash, 2),
      'fondo_before', round(v_fondo, 2),
      'payment_transaction_id', v_payment_id,
      'formula', 'v2.24.0'
    )
  );

  v_result := jsonb_build_object(
    'status', 'success',
    'document_id', v_doc_id,
    'document_number', v_number,
    'doc_type', v_doc_type,
    'concept', v_concept,
    'amount', v_amount,
    'currency', v_currency,
    'exchange_rate', v_rate,
    'amount_cup', round(v_amount_cup, 2),
    'operation_date', v_op_date,
    'status_doc', 'confirmado',
    'outside_shift', (v_concept = 'entrega_efectivo' AND NOT v_has_shift),
    'payment_transaction_id', v_payment_id,
    'cash_before', round(v_expected_cash, 2),
    'cash_after', round(v_expected_cash + CASE WHEN v_doc_type = 'ingreso' THEN v_amount_cup ELSE -v_amount_cup END, 2),
    'fondo_before', round(v_fondo, 2),
    'fondo_after', round(
      v_fondo + CASE
        WHEN v_concept IN ('constitucion_fondo', 'reposicion_fondo') THEN v_amount_cup
        WHEN v_concept IN ('devolucion_total_fondo', 'devolucion_parcial_fondo') THEN -v_amount_cup
        ELSE 0
      END, 2)
  );

  -- 14. Registro de idempotencia (después del éxito — patrón v2.26)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (btrim(p_idempotency_key), 'create_cash_flow_document', v_doc_id, v_param_hash, v_result)
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$


-- @contract-function name=create_devolution_v2 args="p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text, p_operation_date timestamp with time zone, p_refund_currency text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_refund_currency text DEFAULT 'CUP'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_sold_qty numeric;
  v_devolved_qty numeric;
  v_locked_sale uuid;
  v_session_id uuid;
  v_pt_id uuid;
  v_eff timestamptz;
  -- MISIÓN CAJA 2026-10-23: moneda real del reembolso
  v_refund_currency text := upper(btrim(COALESCE(NULLIF(p_refund_currency, ''), 'CUP')));
  v_refund_rate numeric := 1.0;
  v_refund_amount numeric := 0;
  -- REVISIÓN FINAL v2.24.1: identidad de idempotencia + precio anclado al servidor
  v_param_hash text;
  v_idem_hash text;
  v_sale_unit_cup numeric;
  -- MISIÓN POST-MERGE FINAL (2026-10-24): regla contable del reembolso —
  -- tope por moneda (neto pagado − ya reembolsado no convertido) y saldo
  -- físico por moneda (misma fuente autoritativa que el libro de caja).
  v_paid_rows integer := 0;
  v_row_cash_cup numeric := 0;
  v_row_cash_usd numeric := 0;
  v_row_bank_cup numeric := 0;
  v_row_bank_usd numeric := 0;
  v_settle_present boolean := false;
  v_carve_usd numeric := 0;
  v_carve_cup numeric := 0;
  v_paid_cup numeric := 0;
  v_paid_usd numeric := 0;
  v_refunded_cup numeric := 0;
  v_refunded_usd numeric := 0;
  v_refundable numeric := 0;
  v_balance_currency numeric := 0;
  -- MISIÓN DE CIERRE (2026-10-24): tasa histórica implícita + mixto + crédito
  v_rate_sale numeric := NULL;
  v_usd_rows_amt numeric := 0;
  v_usd_rows_cup numeric := 0;
  v_comp_cup numeric := 0;
  v_comp_usd numeric := 0;
  v_credit_refundable numeric := 0;
  v_refund_components jsonb := '[]'::jsonb;
BEGIN
  v_eff := COALESCE(p_operation_date, NOW());
  PERFORM public.validate_operation_date(v_eff, p_store_id);

  -- REVISIÓN FINAL v2.24.1: advisory lock por tienda (misma llave que
  -- create_cash_flow_document / close_cash_shift / create_sale_v2) — serializa
  -- devoluciones frente a entregas/cierres concurrentes sobre el cajón físico
  -- (cierra la ventana de carrera entrega-vs-reembolso detectada en revisión).
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- REVISIÓN FINAL v2.24.1: identidad de idempotencia con hash de payload
  -- (paridad create_sale_v2). Misma clave + payload distinto ⇒ conflicto
  -- explícito; jamás retorno silencioso de la devolución previa.
  v_param_hash := md5(
    p_store_id::text || '|' || COALESCE(v_caller_uid::text, '') || '|'
    || COALESCE(p_original_transaction_id::text, '') || '|' || COALESCE(p_reason, '') || '|'
    || COALESCE(p_payment_method, '') || '|' || v_refund_currency || '|'
    || COALESCE(p_customer_id::text, '') || '|'
    || (SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM jsonb_array_elements(p_items) x) || '|'
    || COALESCE(p_operation_date::text, '')
  );
  IF p_idempotency_key IS NOT NULL THEN
    SELECT ir.param_hash INTO v_idem_hash
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'create_devolution_v2'
      LIMIT 1;
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: la clave % ya está ligada a otra identidad de devolución (payload/actor/tienda)', p_idempotency_key;
      END IF;
      RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing);
    END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- DF-07: LOCK venta original PRIMERO
  IF p_original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original';
  END IF;
  SELECT id INTO v_locked_sale FROM public.transactions
    WHERE id = p_original_transaction_id AND store_id = p_store_id
    FOR UPDATE;
  IF v_locked_sale IS NULL THEN
    RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
  END IF;

  -- DF-07: tope por (venta, producto) DESPUÉS del lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: qty=%', v_qty;
    END IF;

    SELECT COALESCE(SUM(ti.quantity), 0) INTO v_sold_qty
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;

    SELECT COALESCE(SUM(di.quantity), 0) INTO v_devolved_qty
    FROM public.devolution_items di
    JOIN public.devolutions d ON d.id = di.devolution_id
    WHERE d.original_transaction_id = p_original_transaction_id
      AND di.product_id = v_pid
      AND d.status IN ('pending','completed');

    IF v_devolved_qty + v_qty > v_sold_qty THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CAP_EXCEEDED: producto % vendido=% devuelto=% solicitado=% (tope acumulado, lock de venta adquirido)',
        v_pid, v_sold_qty, v_devolved_qty, v_qty;
    END IF;
  END LOOP;

  -- Método permitido
  IF p_payment_method NOT IN ('cash','transfer','zelle','store_credit') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_METHOD: %', p_payment_method;
  END IF;

  -- MISIÓN CAJA 2026-10-23: moneda del reembolso (por la que SALE el dinero).
  -- La tasa SIEMPRE server-side (jerarquía tienda→BCC→elToque, fail-closed) —
  -- sin tasas inventadas. CUP ⇒ rate 1 (comportamiento previo exacto).
  IF v_refund_currency NOT IN ('CUP', 'USD', 'AS_PAID') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_CURRENCY: % (CUP|USD|AS_PAID)', v_refund_currency;
  END IF;
  -- MISIÓN DE CIERRE (§6): el multi-moneda «según lo pagado» exige entrega
  -- física simultánea de ambas monedas → solo efectivo. Zelle es riel USD.
  IF v_refund_currency = 'AS_PAID' AND p_payment_method <> 'cash' THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_AS_PAID_CASH_ONLY: el reembolso según lo pagado (multi-moneda) exige entrega en efectivo (ambas monedas simultáneamente)';
  END IF;
  IF p_payment_method = 'zelle' AND v_refund_currency = 'CUP' THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_ZELLE_CURRENCY: zelle opera en USD (riel del exterior) — un reembolso por zelle no puede emitirse en CUP';
  END IF;
  -- MISIÓN DE CIERRE (Fase E §7): el importe USD del reembolso NO usa la
  -- tasa VIGENTE de la tienda (jerarquía retirada): se ancla a la TASA
  -- IMPLÍCITA HISTÓRICA de los pagos USD de ESTA venta, calculada más abajo
  -- (tras la determinación del pagado — mismas fuentes). Sin tasa histórica
  -- reconstruible el flujo USD falla cerrado: ERR_DEVOLUTION_RATE_UNDETERMINED.

  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, v_eff
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    -- REVISIÓN FINAL v2.24.1 (anti-sobre-reembolso): el precio del reembolso
    -- lo fija el SERVIDOR a partir de la venta original — price_at_sale_cup
    -- ponderado por cantidad; fallback price_at_sale × tasa del ítem con la
    -- convención fail-safe de la casa (tasa ausente ⇒ 1, nunca > pagado en
    -- CUP). El unit_price del payload se IGNORA: DF-07 topa la CANTIDAD y
    -- este gate topa el PRECIO — un payload manipulado ya no puede reembolsar
    -- más de lo cobrado.
    SELECT COALESCE(
             SUM(ti.price_at_sale_cup * ti.quantity) / NULLIF(SUM(ti.quantity), 0),
             SUM(ti.price_at_sale * COALESCE(ti.exchange_rate, 1) * ti.quantity) / NULLIF(SUM(ti.quantity), 0)
           )
      INTO v_sale_unit_cup
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;
    v_price := COALESCE(v_sale_unit_cup, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    -- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): los servicios (is_service=true)
    -- NO tienen existencias propias → NO se registra movimiento de entrada
    -- de stock (evita stock/inventory/kardex fantasma). El reembolso
    -- financiero DF-03 y la trazabilidad documental se conservan íntegros.
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := v_qty, p_movement_type := 'return',
        p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
        p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  -- REVISIÓN FINAL v2.24.1: registrar la identidad en el registry (paridad
  -- create_sale_v2) — hace posible la comparación de hash en reintentos.
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (p_idempotency_key, 'create_devolution_v2', v_devolution_id, v_param_hash,
            jsonb_build_object('status', 'pending'))
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  -- ═══ DF-03: CONTRA-ASIENTO FINANCIERO en la MISMA TX ═══
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_AMOUNT_POSITIVE';
  END IF;

  IF p_payment_method IN ('cash','transfer','zelle') THEN
    -- sesión de caja abierta de la tienda (find-or-create para que el out nunca se pierda)
    SELECT id INTO v_session_id FROM public.cash_register_sessions
      WHERE store_id = p_store_id AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO public.cash_register_sessions (store_id, cashier_id, opening_cash, opened_at, status)
      VALUES (p_store_id, v_caller_uid, 0, NOW(), 'open')
      RETURNING id INTO v_session_id;
    END IF;

    -- contra-asiento de caja: out por el total devuelto
    INSERT INTO public.cash_movements (session_id, movement_type, method, amount, reason, store_id)
    VALUES (v_session_id, 'out', p_payment_method::payment_method_enum, v_total,
            'Devolución ' || v_dev_number || ': ' || COALESCE(p_reason,''), p_store_id);

    -- asiento financiero trazable: venta → devolución → reversión.
    -- MISIÓN CAJA 2026-10-23: moneda REAL del reembolso (física por la que
    -- salió el dinero). amount = canónico / tasa para USD ⇒ amount_cup
    -- generado conserva el total canónico (invariante intacta).
    -- MISIÓN DE CIERRE: el importe del reembolso se fija MÁS ABAJO, tras la
    -- determinación del pagado y de la tasa implícita histórica (v_rate_sale).

    -- ═══ MISIÓN POST-MERGE FINAL 2026-10-24 — REGLA CONTABLE DEL REEMBOLSO ═══
    -- (misión §3/§10, estándar SAS Premium). Un reembolso monetario devuelve
    -- valor por la MONEDA en que SALE el dinero. Dos validaciones DEFINITIVAS
    -- en PostgreSQL (la del frontend es solo espejo):
    --
    -- (a) TOPE POR MONEDA: nunca más efectivo de X que lo NETO pagado por
    --     esta venta en X menos lo ya reembolsado (no convertido) en X. La
    --     equivalencia canónica CUP NO autoriza por sí sola una salida en CUP
    --     de una venta cobrada en USD, ni al revés: la conversión implícita
    --     queda estructuralmente imposible (el modelo NO tiene operación de
    --     cambio; una conversión solo podría existir como operación explícita
    --     con tasa, importes en ambas monedas y doble asiento — hoy inexistente).
    -- (b) FÍSICO POR MONEDA (solo efectivo): misma fuente autoritativa que el
    --     libro (get_cash_currency_summary → net → v_refund_currency) — el
    --     reembolso no puede llevar el cajón a negativo (paridad con la
    --     correctiva 20261024220000 de egresos ordinarios y reversiones).
    --
    -- NETO PAGADO por moneda — mismas fuentes de verdad que el libro usa para
    -- explicar el saldo (§1 liquidación / §2 legacy+carve de get_cash_currency_
    -- summary), más las filas de pago reales (v2.25: una por componente) para
    -- los rieles bancarios:
    --   1) liquidación explícita (cash_received_* − change_given_*, v2.24+)
    --      + filas transfer/zelle;
    --   2) sin liquidación, con filas reales no-CUP (v2.25 sin liquidación);
    --   3) legacy: filas/pools canónicos CUP + carve USD por ítems
    --      (la fila canónica CUP de v2.24 NUNCA se toma como CUP físico pagado
    --      cuando la liquidación declara USD — no asumir que amount_cup son
    --      billetes CUP, misión §3);
    --   4) sin ninguna fuente ⇒ pagos indeterminables ⇒ flujo AMBIGUO
    --      bloqueado (fail-closed, misión §10: no inventar la conversión).
    -- Lo YA REEMBOLSADO cuenta las filas refund de devoluciones NO revertidas
    -- (la reversión deshace la devolución a efectos del tope; su fila refund
    -- persiste en el libro — residual documentado en el expediente). El
    -- store_credit NO consume el tope por moneda: es pasivo CUP-canónico ya
    -- acotado por el tope de cantidad DF-07 y no mueve efectivo.
    SELECT COUNT(*),
           COALESCE(SUM(CASE WHEN pt.payment_method = 'cash'     AND pt.currency = 'CUP' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method = 'cash'     AND pt.currency = 'USD' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method IN ('transfer','zelle') AND pt.currency = 'CUP' THEN pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.payment_method IN ('transfer','zelle') AND pt.currency = 'USD' THEN pt.amount END), 0)
      INTO v_paid_rows, v_row_cash_cup, v_row_cash_usd, v_row_bank_cup, v_row_bank_usd
      FROM public.payment_transactions pt
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'sale';

    SELECT COALESCE(SUM(ti.cash_paid), 0),
           COALESCE(SUM(ti.cash_paid * ti.exchange_rate), 0)
      INTO v_carve_usd, v_carve_cup
      FROM public.transaction_items ti
      WHERE ti.transaction_id = p_original_transaction_id
        AND ti.cash_currency = 'USD' AND ti.currency = 'USD'
        AND COALESCE(ti.cash_paid, 0) > 0;

    SELECT (t.cash_received_cup IS NOT NULL OR t.cash_received_usd IS NOT NULL
            OR t.change_given_cup IS NOT NULL OR t.change_given_usd IS NOT NULL),
           COALESCE(t.cash_received_cup, 0) - COALESCE(t.change_given_cup, 0),
           COALESCE(t.cash_received_usd, 0) - COALESCE(t.change_given_usd, 0)
      INTO v_settle_present, v_paid_cup, v_paid_usd
      FROM public.transactions t
      WHERE t.id = p_original_transaction_id;

    IF v_settle_present THEN
      -- (1) liquidación explícita: billetes reales ± vuelto + rieles bancarios
      v_paid_cup := v_paid_cup + v_row_bank_cup;
      v_paid_usd := v_paid_usd + v_row_bank_usd;
    ELSIF v_row_cash_usd > 0 THEN
      -- (2) filas reales no-CUP sin liquidación (v2.25 defensivo)
      v_paid_cup := v_row_cash_cup + v_row_bank_cup;
      v_paid_usd := v_row_cash_usd + v_row_bank_usd;
    ELSIF v_paid_rows > 0 THEN
      -- (3) legacy con filas canónicas: split por carve USD de los ítems.
      --     Las filas transfer/zelle son SIEMPRE reales (ambas eras) y se
      --     cuentan íntegras en su moneda.
      v_paid_cup := v_row_cash_cup - v_carve_cup + v_row_bank_cup;
      v_paid_usd := v_carve_usd + v_row_bank_usd;
    ELSE
      -- (3b) muy legacy: pools de la venta + carve
      SELECT COALESCE(t.cash_amount, 0) - v_carve_cup + COALESCE(t.transfer_amount, 0),
             v_carve_usd
        INTO v_paid_cup, v_paid_usd
        FROM public.transactions t
        WHERE t.id = p_original_transaction_id;
    END IF;

    -- MISIÓN DE CIERRE (§5): el tope cuenta DINERO, no estado documental —
    -- reembolsos NO recuperados = Σ refunds − Σ recoveries de la venta, sin
    -- filtro de estado: una reversión documental ya no libera capacidad.
    SELECT COALESCE(SUM(CASE WHEN pt.direction = 'refund'   AND pt.currency = 'CUP' THEN pt.amount
                              WHEN pt.direction = 'recovery' AND pt.currency = 'CUP' THEN -pt.amount END), 0),
           COALESCE(SUM(CASE WHEN pt.direction = 'refund'   AND pt.currency = 'USD' THEN pt.amount
                              WHEN pt.direction = 'recovery' AND pt.currency = 'USD' THEN -pt.amount END), 0)
      INTO v_refunded_cup, v_refunded_usd
      FROM public.payment_transactions pt
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'devolution'
        AND pt.direction IN ('refund', 'recovery');

    -- MISIÓN DE CIERRE (Fase E §7): TASA IMPLÍCITA HISTÓRICA de los pagos USD
    -- de ESTA venta — misma jerarquía de fuentes que el tope: (a) filas de
    -- pago USD (v2.25, tasa persistida por fila) → media ponderada;
    -- (b) liquidación explícita pura (v2.24, sin rieles bancarios) →
    -- (canónico − CUP neto)/USD neto; (c) carve por ítems (legacy) → media
    -- ponderada de cash_paid×tasa. Indeterminable → NULL y fail-closed.
    SELECT COALESCE(SUM(pt.amount), 0), COALESCE(SUM(pt.amount * pt.exchange_rate), 0)
      INTO v_usd_rows_amt, v_usd_rows_cup
      FROM public.payment_transactions pt
      WHERE pt.transaction_id = p_original_transaction_id
        AND pt.ref_type = 'sale' AND pt.currency = 'USD' AND pt.exchange_rate > 1;
    IF v_usd_rows_amt > 0 THEN
      v_rate_sale := v_usd_rows_cup / v_usd_rows_amt;
    ELSIF v_settle_present AND v_paid_usd > 0
          AND v_row_bank_cup = 0 AND v_row_bank_usd = 0 THEN
      SELECT (COALESCE(t.total_amount, 0)
                - (COALESCE(t.cash_received_cup, 0) - COALESCE(t.change_given_cup, 0)))
             / NULLIF(COALESCE(t.cash_received_usd, 0) - COALESCE(t.change_given_usd, 0), 0)
        INTO v_rate_sale
        FROM public.transactions t WHERE t.id = p_original_transaction_id;
    ELSE
      SELECT COALESCE(SUM(ti.cash_paid), 0), COALESCE(SUM(ti.cash_paid * ti.exchange_rate), 0)
        INTO v_usd_rows_amt, v_usd_rows_cup
        FROM public.transaction_items ti
        WHERE ti.transaction_id = p_original_transaction_id
          AND ti.cash_currency = 'USD' AND ti.currency = 'USD'
          AND COALESCE(ti.cash_paid, 0) > 0;
      IF v_usd_rows_amt > 0 THEN
        v_rate_sale := v_usd_rows_cup / v_usd_rows_amt;
      END IF;
    END IF;
    IF v_rate_sale IS NOT NULL AND v_rate_sale <= 1 THEN
      v_rate_sale := NULL;  -- tasa implícita sin sentido contable → indeterminada
    END IF;

    -- ═══ MISIÓN DE CIERRE (§6/§7): IMPORTE DEL REEMBOLSO (tras la tasa) ═══
    IF v_refund_currency = 'AS_PAID' THEN
      -- §6 criterio de diseño: la devolución multi-moneda representa CADA
      -- componente con su importe y moneda, bajo UNA transacción atómica.
      -- Componentes = restante reembolsable POR MONEDA (pagado − reembolsado
      -- no recuperado). Sin regla inequívoca de asignación por artículo, el
      -- caso ambiguo (parcial de mixta en AS_PAID) se BLOQUEA: la validación
      -- canónica exige consumir íntegramente lo reembolsable.
      v_comp_cup := v_paid_cup - v_refunded_cup;
      v_comp_usd := v_paid_usd - v_refunded_usd;
      IF v_comp_cup < 0 OR v_comp_usd < 0 THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_CAP: reembolsado no recuperado excede lo pagado (CUP %/%, USD %/%) — inconsistencia de datos',
          v_paid_cup, v_refunded_cup, v_paid_usd, v_refunded_usd;
      END IF;
      IF v_comp_usd > 0 AND v_rate_sale IS NULL THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RATE_UNDETERMINED: la venta pagó USD pero su tasa histórica no es reconstruible (sin filas con tasa, liquidación pura o carve) — el reembolso mixto queda bloqueado';
      END IF;
      IF abs(v_total - (v_comp_cup + v_comp_usd * COALESCE(v_rate_sale, 1))) > 0.05 THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_MIXED_ALLOCATION: la devolución mixta exige consumir íntegramente lo reembolsable por moneda (valor devuelto=%, componentes=% CUP + % USD a tasa %) — no existe regla de asignación por artículo: el caso ambiguo se bloquea',
          round(v_total, 2), round(v_comp_cup, 2), round(v_comp_usd, 2), COALESCE(v_rate_sale, 1);
      END IF;
      v_refund_components := jsonb_build_object('CUP', v_comp_cup, 'USD', v_comp_usd, 'rate_sale', v_rate_sale);
    ELSIF v_refund_currency = 'USD' THEN
      IF v_rate_sale IS NULL THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RATE_UNDETERMINED: la venta pagó USD pero su tasa histórica no es reconstruible — el reembolso USD queda bloqueado (regla §7: devolver la moneda y el importe neto realmente cobrados)';
      END IF;
      v_refund_rate := v_rate_sale;
      v_refund_amount := round(v_total / v_rate_sale, 2);
    ELSE
      v_refund_amount := v_total;
    END IF;

    IF v_paid_cup = 0 AND v_paid_usd = 0
       AND v_refunded_cup = 0 AND v_refunded_usd = 0 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_PAYMENTS_UNDETERMINED: la venta original no tiene pagos determinables (sin filas de pago, liquidación ni efectivo registrado) — el reembolso monetario queda bloqueado (regla contable: sin conversión implícita entre monedas)';
    END IF;

    v_refundable := CASE v_refund_currency
                      WHEN 'USD' THEN v_paid_usd - v_refunded_usd
                      ELSE v_paid_cup - v_refunded_cup
                    END;
    IF v_refund_currency <> 'AS_PAID' AND v_refund_amount > v_refundable + 0.005 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_CAP: reembolso en % excede lo reembolsable de esa moneda para esta venta (pagado neto=%, ya reembolsado=%, solicitado=%) — no se convierte implícitamente el pago de otra moneda',
        v_refund_currency,
        round(CASE v_refund_currency WHEN 'USD' THEN v_paid_usd ELSE v_paid_cup END, 2),
        round(CASE v_refund_currency WHEN 'USD' THEN v_refunded_usd ELSE v_refunded_cup END, 2),
        round(v_refund_amount, 2);
    END IF;

    IF p_payment_method = 'cash' THEN
      IF v_refund_currency = 'AS_PAID' THEN
        IF v_comp_cup > 0 THEN
          SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                           -> 'net' ->> 'CUP')::numeric, 0) INTO v_balance_currency;
          IF v_comp_cup > v_balance_currency + 0.005 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, reembolso=%',
              round(v_balance_currency, 2), round(v_comp_cup, 2);
          END IF;
        END IF;
        IF v_comp_usd > 0 THEN
          SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                           -> 'net' ->> 'USD')::numeric, 0) INTO v_balance_currency;
          IF v_comp_usd > v_balance_currency + 0.005 THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico USD disponible=%, reembolso=%',
              round(v_balance_currency, 2), round(v_comp_usd, 2);
          END IF;
        END IF;
      ELSE
        SELECT COALESCE((public.get_cash_currency_summary(p_store_id, NULL, 'infinity'::timestamptz)
                         -> 'net' ->> v_refund_currency)::numeric, 0)
          INTO v_balance_currency;
        IF v_refund_amount > v_balance_currency + 0.005 THEN
          RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, reembolso=%',
            v_refund_currency, round(v_balance_currency, 2), round(v_refund_amount, 2);
        END IF;
      END IF;
    END IF;
    -- ═══ fin de la regla contable del reembolso ═══
    IF v_refund_currency = 'AS_PAID' THEN
      IF v_comp_cup > 0 THEN
        INSERT INTO public.payment_transactions (
          store_id, ref_type, ref_id, transaction_id,
          amount, payment_method, currency, exchange_rate,
          payment_date, direction, paid_by, idempotency_key
        ) VALUES (
          p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
          v_comp_cup, p_payment_method, 'CUP', 1,
          v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund-CUP'
        ) RETURNING id INTO v_pt_id;
      END IF;
      IF v_comp_usd > 0 THEN
        INSERT INTO public.payment_transactions (
          store_id, ref_type, ref_id, transaction_id,
          amount, payment_method, currency, exchange_rate,
          payment_date, direction, paid_by, idempotency_key
        ) VALUES (
          p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
          v_comp_usd, p_payment_method, 'USD', v_rate_sale,
          v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund-USD'
        ) RETURNING id INTO v_pt_id;
      END IF;
    ELSE
      INSERT INTO public.payment_transactions (
        store_id, ref_type, ref_id, transaction_id,
        amount, payment_method, currency, exchange_rate,
        payment_date, direction, paid_by, idempotency_key
      ) VALUES (
        p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
        v_refund_amount, p_payment_method, v_refund_currency, v_refund_rate,
        v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
      ) RETURNING id INTO v_pt_id;
    END IF;

  ELSIF p_payment_method = 'store_credit' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
    END IF;
    -- MISIÓN DE CIERRE (§8): tope canónico del crédito — lo EMITIDO no
    -- compensado no puede exceder lo pagado canónico de la venta (las
    -- compensaciones de reversión son filas negativas → SUM = neto vigente).
    -- Sin este tope, revertir sin compensar y re-devolver duplicaba el pasivo.
    SELECT COALESCE(t.total_amount, 0)
         - COALESCE((SELECT SUM(scl.amount) FROM public.store_credit_ledger scl
                     WHERE scl.origin_transaction_id = p_original_transaction_id), 0)
      INTO v_credit_refundable
      FROM public.transactions t WHERE t.id = p_original_transaction_id;
    IF v_total > v_credit_refundable + 0.005 THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CREDIT_CAP: el crédito de tienda excede lo emitible canónico de la venta (pagado=%, crédito vigente=%, solicitado=%)',
        round(COALESCE((SELECT t2.total_amount FROM public.transactions t2 WHERE t2.id = p_original_transaction_id), 0), 2),
        round(COALESCE((SELECT t2.total_amount FROM public.transactions t2 WHERE t2.id = p_original_transaction_id), 0)
              - v_credit_refundable, 2),
        round(v_total, 2);
    END IF;
    -- pasivo visible y auditable; la caja NO se toca (el dinero ya no sale)
    INSERT INTO public.store_credit_ledger
      (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
    VALUES
      (p_store_id, p_customer_id, v_total, v_devolution_id, p_original_transaction_id,
       'dev-' || v_devolution_id::text || '-credit', v_caller_uid);
  END IF;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items),
      'operation_date', v_eff,
      'import_origin', 'ENERVIDA-EXCEL-IMPORT',
      'cap_lock_df07', true,
      'refund_currency', v_refund_currency,
      'refund_rate', v_refund_rate,
      'refund_amount', v_refund_amount,
      'refund_components', v_refund_components,
      'rate_sale', v_rate_sale,
      'pricing_source', 'server_price_at_sale_cup_v2_24_1',
      'idempotency_param_hash', COALESCE(v_param_hash, ''),
      'financial_contra_entry_df03',
        jsonb_build_object('method', p_payment_method, 'amount', v_total,
          'cash_out', (p_payment_method <> 'store_credit'),
          'idempotency_key', 'dev-' || v_devolution_id::text || '-refund')
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total,
    'refund_currency', v_refund_currency,
    'refund_components', v_refund_components,
    'rate_sale', v_rate_sale,
    'financial_effect', CASE WHEN p_payment_method = 'store_credit' THEN 'store_credit_ledger' ELSE 'cash_out_and_refund' END
  );
END $function$


-- @contract-function name=create_physical_count args="p_store_id uuid, p_user_id uuid, p_notes text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
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


-- @contract-function name=create_physical_inventory args="p_store_id uuid, p_cutoff_date timestamp with time zone, p_description text, p_responsible_name text, p_scope_type text, p_categories text[], p_product_ids uuid[], p_blind_mode boolean, p_observations text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_physical_inventory(p_store_id uuid, p_cutoff_date timestamp with time zone, p_description text DEFAULT NULL::text, p_responsible_name text DEFAULT NULL::text, p_scope_type text DEFAULT 'full'::text, p_categories text[] DEFAULT NULL::text[], p_product_ids uuid[] DEFAULT NULL::uuid[], p_blind_mode boolean DEFAULT false, p_observations text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pi_id UUID;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_CREATE_PI';
  END IF;
  IF p_cutoff_date IS NULL OR p_cutoff_date > NOW() THEN
    RAISE EXCEPTION 'ERR_INVALID_CUTOFF_DATE: la fecha de corte no puede ser futura';
  END IF;
  IF p_scope_type NOT IN ('full','category','selection') THEN
    RAISE EXCEPTION 'ERR_INVALID_SCOPE';
  END IF;
  IF p_scope_type = 'category' AND (p_categories IS NULL OR array_length(p_categories, 1) = 0) THEN
    RAISE EXCEPTION 'ERR_SCOPE_CATEGORIES_REQUIRED';
  END IF;
  IF p_scope_type = 'selection' AND (p_product_ids IS NULL OR array_length(p_product_ids, 1) = 0) THEN
    RAISE EXCEPTION 'ERR_SCOPE_PRODUCTS_REQUIRED';
  END IF;

  INSERT INTO public.physical_inventories (
    store_id, cutoff_date, description, responsible_name,
    scope_type, scope_category_names, scope_products, blind_mode, observations, created_by
  ) VALUES (
    p_store_id, p_cutoff_date, p_description, p_responsible_name,
    p_scope_type, p_categories, p_product_ids, p_blind_mode, p_observations, v_caller_uid
  ) RETURNING id INTO v_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_CREATED', 'physical_inventories', v_pi_id,
          jsonb_build_object('pi_number', (SELECT pi_number FROM public.physical_inventories WHERE id = v_pi_id),
                             'cutoff_date', p_cutoff_date, 'scope_type', p_scope_type,
                             'blind_mode', p_blind_mode), p_store_id);

  RETURN v_pi_id;
END;
$function$


-- @contract-function name=create_production_order_v2 args="p_store_id uuid, p_order_type text, p_customer_name text, p_customer_ci text, p_customer_phone text, p_customer_address text, p_budget_total numeric, p_budget_currency text, p_description text, p_notes text, p_items jsonb, p_advance_amount numeric, p_advance_method text, p_advance_currency text, p_created_by uuid, p_idempotency_key text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_production_order_v2(p_store_id uuid, p_order_type text DEFAULT 'service'::text, p_customer_name text DEFAULT NULL::text, p_customer_ci text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_budget_total numeric DEFAULT 0, p_budget_currency text DEFAULT 'CUP'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_advance_amount numeric DEFAULT 0, p_advance_method text DEFAULT NULL::text, p_advance_currency text DEFAULT 'CUP'::text, p_created_by uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id uuid; v_order_number text; v_item jsonb; v_item_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_existing_result jsonb; v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_store_id::text || '|' || p_order_type || '|' || COALESCE(p_customer_name, '') || '|' ||
      COALESCE(p_customer_ci, '') || '|' || COALESCE(p_customer_phone, '') || '|' ||
      COALESCE(p_customer_address, '') || '|' || p_budget_total::text || '|' ||
      p_budget_currency || '|' || COALESCE(p_description, '') || '|' || COALESCE(p_notes, '') || '|' ||
      COALESCE(p_items::text, '[]') || '|' || p_advance_amount::text || '|' ||
      COALESCE(p_advance_method, '') || '|' || p_advance_currency || '|' || COALESCE(p_created_by::text, '')
    );
    v_existing_result := public.check_idempotency(p_idempotency_key, 'create_po', p_store_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_order_type NOT IN ('production', 'service', 'work') THEN
    RAISE EXCEPTION 'ERR_INVALID_ORDER_TYPE';
  END IF;

  INSERT INTO production_orders (
    store_id, order_type, status, budget_total, budget_currency,
    customer_name, customer_ci, customer_phone, customer_address,
    description, notes, created_by, paid_amount, payment_status,
    idempotency_key, advance_amount, advance_method, advance_currency
  ) VALUES (
    p_store_id, p_order_type, 'draft', p_budget_total, p_budget_currency,
    p_customer_name, p_customer_ci, p_customer_phone, p_customer_address,
    p_description, p_notes, v_caller_uid, 0, 'unpaid',
    p_idempotency_key, p_advance_amount, p_advance_method, p_advance_currency
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF NOT EXISTS (SELECT 1 FROM products WHERE id = (v_item->>'product_id')::uuid AND store_id = p_store_id) THEN
        RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: %', v_item->>'product_id';
      END IF;
      INSERT INTO production_order_items (order_id, product_id, variant_id, budgeted_qty, budgeted_unit_cost, status)
      VALUES (v_order_id, (v_item->>'product_id')::uuid, NULLIF(v_item->>'variant_id', '')::uuid,
        (v_item->>'budgeted_qty')::numeric, (v_item->>'budgeted_unit_cost')::numeric, 'pending');
      v_item_count := v_item_count + 1;
    END LOOP;
  END IF;

  IF p_advance_amount > 0 AND p_advance_method IS NOT NULL THEN
    PERFORM register_supplier_payment(p_store_id := p_store_id,
      p_ref_type := CASE WHEN p_order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := v_order_id, p_amount := p_advance_amount, p_payment_method := p_advance_method,
      p_paid_by := v_caller_uid, p_currency := p_advance_currency,
      p_idempotency_key := 'advance-' || v_order_id::text);
  END IF;

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'order_number', v_order_number, 'items_count', v_item_count);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'create_po', v_order_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'PRODUCTION_ORDER_CREATED', 'production_orders', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'order_type', p_order_type,
      'budget_total', p_budget_total, 'items_count', v_item_count,
      'advance_amount', p_advance_amount, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$


-- @contract-function name=create_purchase_order args="p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number text, p_notes text, p_expected_date date, p_created_by uuid, p_items jsonb" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid DEFAULT NULL::uuid, p_po_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_expected_date date DEFAULT NULL::date, p_created_by uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_po_id       uuid;
  v_total       numeric := 0;
  v_item        jsonb;
  v_item_count  integer := 0;
  v_product_id  uuid;
  v_count       integer;
  v_po_number   text;
BEGIN
  -- ─── 1. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. Validar supplier_name (parity B2 register_reception) ───
  IF p_supplier_name IS NULL OR p_supplier_name = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  -- ─── 3. Validar supplier_id si se provee (Medio #10) ───
  IF p_supplier_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM public.suppliers
    WHERE id = p_supplier_id AND store_id = p_store_id AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_NOT_FOUND: supplier % not in store % or inactive',
        p_supplier_id, p_store_id;
    END IF;
  END IF;

  -- ─── 4. Validar items no vacío (parity B3 register_reception) ───
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- ─── 5. Auto-generar po_number si no viene (Alto #7 complemento) ───
  IF p_po_number IS NULL OR p_po_number = '' THEN
    -- Formato: PO-{store_id_short}-{YYYYMMDD}-{random6}
    SELECT 'PO-' || substr(p_store_id::text, 1, 8) || '-' ||
           to_char(now(), 'YYYYMMDD') || '-' ||
           substr(md5(random()::text), 1, 6)
      INTO v_po_number;
  ELSE
    v_po_number := p_po_number;
    -- Verificar UNIQUE (store_id, po_number) — race-safe vía UNIQUE INDEX
    SELECT COUNT(*) INTO v_count
    FROM public.purchase_orders
    WHERE store_id = p_store_id AND po_number = v_po_number;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'ERR_PO_NUMBER_DUPLICATE: % already exists in store %',
        v_po_number, p_store_id;
    END IF;
  END IF;

  -- ─── 6. Calcular total + validar items ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_count := v_item_count + 1;

    -- Validar campos obligatorios del item
    IF (v_item->>'product_name') IS NULL OR (v_item->>'product_name') = '' THEN
      RAISE EXCEPTION 'ERR_ITEM_PRODUCT_NAME_REQUIRED: item %', v_item_count;
    END IF;

    -- Condición #1: product_id REQUIRED (no NULL)
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ID_REQUIRED: item % has no product_id', v_item_count;
    END IF;

    -- Validar quantity_ordered > 0
    IF COALESCE((v_item->>'quantity_ordered')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_QTY_INVALID: item % quantity_ordered must be > 0', v_item_count;
    END IF;

    -- Condición #1: unit_cost > 0 (no >= 0)
    -- register_reception B4 rechaza unit_cost <= 0; si permitimos 0 aquí,
    -- la PO no sería recepcionable.
    IF COALESCE((v_item->>'unit_cost')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_UNIT_COST_INVALID: item % unit_cost must be > 0 (B4 parity)', v_item_count;
    END IF;

    -- Medio #9: producto debe existir en store
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % not in store %',
        v_product_id, p_store_id;
    END IF;

    v_total := v_total + ((v_item->>'quantity_ordered')::numeric) * ((v_item->>'unit_cost')::numeric);
  END LOOP;

  -- ─── 7. Insertar OC (usa columnas nuevas de G1) ───
  INSERT INTO public.purchase_orders (
    store_id, supplier, supplier_name, supplier_id, po_number,
    status, total_amount, notes, expected_date, created_by
  ) VALUES (
    p_store_id, p_supplier_name, p_supplier_name, p_supplier_id, v_po_number,
    'draft'::public.purchase_status_enum, v_total, p_notes, p_expected_date, p_created_by
  ) RETURNING id INTO v_po_id;

  -- ─── 8. Insertar items ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.purchase_order_items (
      po_id, product_id, product_name, sku,
      quantity_ordered, quantity_received, unit_cost, unit_of_measure
    ) VALUES (
      v_po_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'sku', ''),
      (v_item->>'quantity_ordered')::numeric,
      0,
      (v_item->>'unit_cost')::numeric,
      COALESCE(v_item->>'unit_of_measure', 'unidad')
    );
  END LOOP;

  -- ─── 9. Auditoría ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_created_by, p_store_id, 'po_created', 'purchase_orders', v_po_id,
    jsonb_build_object(
      'supplier', p_supplier_name,
      'supplier_id', p_supplier_id,
      'po_number', v_po_number,
      'total', v_total,
      'items', v_item_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_id', v_po_id,
    'po_number', v_po_number,
    'total_amount', v_total
  );
END;
$function$


-- @contract-function name=create_quotation args="p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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
    IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
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


-- @contract-function name=create_received_service_v2 args="p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid, p_production_order_ids jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid DEFAULT NULL::uuid, p_service_type_name text DEFAULT 'Otro'::text, p_service_date date DEFAULT NULL::date, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_payment_terms_days integer DEFAULT 30, p_distribution_method text DEFAULT 'amount'::text, p_reference_doc text DEFAULT NULL::text, p_observations text DEFAULT NULL::text, p_receipt_ids jsonb DEFAULT '[]'::jsonb, p_created_by uuid DEFAULT NULL::uuid, p_production_order_ids jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_service_id uuid;
  v_service_number text;
  v_receipt_id uuid;
  v_order_id uuid;
  v_count integer;
  v_allocated_per_receipt numeric;
  v_link_count integer;
  v_ot_count integer := 0;
  -- Doctrina actor-explícito (create_sale_v2 §3.1 / v2.17.0): bajo
  -- service_role el actor llega EXPLÍCITO por parámetro derivado server-side
  -- de la sesión verificada; bajo JWT de usuario manda auth.uid().
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- FIX D1: autorización del ACTOR (no de auth.uid() del contexto service_role).
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
  END IF;

  IF p_exchange_rate < 0.01 OR p_exchange_rate > 10000 THEN
    RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: % out of range [0.01, 10000]', p_exchange_rate;
  END IF;

  IF p_payment_terms_days < 1 OR p_payment_terms_days > 365 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_TERMS: % out of range [1, 365]', p_payment_terms_days;
  END IF;

  IF p_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
    RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
  END IF;

  -- 20261015000001: el catálogo de tipos es GLOBAL (store_id IS NULL) con
  -- soporte de variantes por tienda. Se acepta el tipo si pertenece a la
  -- tienda activa O es global, y está activo. (Antes: solo store_id =
  -- p_store_id, lo que excluía a todos los tipos del catálogo oficial.)
  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id
      AND (store_id = p_store_id OR store_id IS NULL)
      AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
    END IF;
  END IF;

  PERFORM public.validate_operation_date(COALESCE(p_service_date, CURRENT_DATE)::timestamp with time zone, p_store_id);

  SELECT 'SRV-' || to_char(COALESCE(p_service_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
         LPAD(nextval('service_number_seq')::text, 5, '0')
  INTO v_service_number;

  INSERT INTO received_services (
    store_id, service_number, service_date, service_type_id, service_type_name,
    supplier, reference_doc, currency, exchange_rate, total_amount,
    observations, status, distribution_method, created_by,
    payment_terms_days, due_date
  ) VALUES (
    p_store_id, v_service_number, COALESCE(p_service_date, CURRENT_DATE),
    p_service_type_id, p_service_type_name, p_supplier, p_reference_doc,
    p_currency, p_exchange_rate, p_total_amount, p_observations,
    'draft', p_distribution_method, v_caller_uid,
    p_payment_terms_days, (COALESCE(p_service_date, CURRENT_DATE) + p_payment_terms_days)::date
  ) RETURNING id INTO v_service_id;

  -- Vinculación documental con recepciones (validación server-side: misma
  -- tienda + recepción activa). NO distribuye costos ni toca inventario.
  v_link_count := jsonb_array_length(p_receipt_ids);
  IF v_link_count > 0 THEN
    v_allocated_per_receipt := p_total_amount / v_link_count;
    FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
      IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = p_store_id AND status = 'active') THEN
        RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
      END IF;
      INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
      VALUES (v_service_id, v_receipt_id, 100.0 / v_link_count, v_allocated_per_receipt);
    END LOOP;
  END IF;

  -- FIX D2: vinculación documental con Órdenes de Trabajo/Producción.
  -- Validación: la OT debe existir, pertenecer a la MISMA tienda y no estar
  -- anulada ni cerrada (draft/approved/in_progress/paused/completed ok).
  IF jsonb_array_length(p_production_order_ids) > 0 THEN
    FOR v_order_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_production_order_ids) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM production_orders
        WHERE id = v_order_id
          AND store_id = p_store_id
          AND status NOT IN ('voided', 'closed')
      ) THEN
        RAISE EXCEPTION 'ERR_PRODUCTION_ORDER_INVALID: % no pertenece a la tienda o su estado no admite vinculación', v_order_id;
      END IF;
      INSERT INTO service_production_order_links (service_id, production_order_id)
      VALUES (v_service_id, v_order_id)
      ON CONFLICT (service_id, production_order_id) DO NOTHING;
      v_ot_count := v_ot_count + 1;
    END LOOP;
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'SERVICE_CREATED', 'received_services', v_service_id,
    jsonb_build_object(
      'service_number', v_service_number, 'supplier', p_supplier,
      'total_amount', p_total_amount, 'currency', p_currency,
      'receipt_ids_linked', v_link_count,
      'production_order_ids_linked', v_ot_count
    ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', v_service_id,
    'service_number', v_service_number, 'link_count', v_link_count,
    'production_order_link_count', v_ot_count
  );
END;
$function$


-- @contract-function name=create_sale_v2 args="p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid, p_supervisor_token_jti text, p_supervisor_scope jsonb, p_discount_reason text, p_notes text, p_payment_incidents jsonb, p_cash_received_cup numeric, p_cash_received_usd numeric, p_change_given_cup numeric, p_change_given_usd numeric, p_change_currency text, p_payment_components jsonb" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid, p_supervisor_token_jti text DEFAULT NULL::text, p_supervisor_scope jsonb DEFAULT NULL::jsonb, p_discount_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_payment_incidents jsonb DEFAULT NULL::jsonb, p_cash_received_cup numeric DEFAULT NULL::numeric, p_cash_received_usd numeric DEFAULT NULL::numeric, p_change_given_cup numeric DEFAULT NULL::numeric, p_change_given_usd numeric DEFAULT NULL::numeric, p_change_currency text DEFAULT NULL::text, p_payment_components jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx_id uuid := gen_random_uuid();
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units numeric;
  -- FIX-USD-CUP-RATE (2026-10-14): conversión por item a la moneda común CUP
  v_item_rate numeric := 1.0;
  v_item_currency text;
  v_stock numeric;
  v_existing uuid;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
  v_calculated_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_taxable_base numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_total numeric := 0;
  v_tax jsonb;
  v_tax_value numeric;
  v_effective_discount_pct numeric := 0;
  v_cash_amt numeric := p_cash_amount;
  -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro (vuelto multimoneda)
  v_settlement_present boolean := false;
  v_chg_rate numeric := NULL;
  v_chg_rate_src text := NULL;
  v_settle_net_cup numeric := 0;
  v_settle_net_usd numeric := 0;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  v_pt_id uuid;
  v_zelle_original_amount numeric;
  -- MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24): componentes de pago por
  -- moneda REAL — importe efectivamente cobrado en CUP y en USD por método.
  v_comp jsonb;
  v_comp_method text;
  v_comp_cur text;
  v_comp_amt numeric;
  v_components_ok boolean := false;
  v_usd_rate numeric := NULL;
  v_usd_rate_source text := NULL;
  v_usd_rate_eff timestamptz := NULL;
  v_comp_cash_cup numeric := 0;
  v_comp_cash_usd numeric := 0;
  v_comp_transfer_cup numeric := 0;
  v_comp_transfer_usd numeric := 0;
  v_comp_zelle_usd numeric := 0;
  v_sum_payments numeric;
  v_wac_prev numeric;
  -- E-SEC (R-SEC-1): precio de referencia server-side y desvío comercial por ítem
  v_catalog_price numeric;
  v_reference_price numeric;
  v_catalog_subtotal numeric := 0;
  v_item_discount_total numeric := 0;
  v_item_discount_pct numeric := 0;
  -- E-SEC-FINAL (D1-D5): umbral por línea, single-use, motivo, snapshot, redondeo
  v_ord bigint;
  v_line_pct numeric := 0;
  v_max_line_pct numeric := 0;
  v_gate_triggered boolean := false;
  v_supervisor_path text := 'none';
  v_reason text;
  v_line_snapshot jsonb := '[]'::jsonb;
  v_snap jsonb;
  v_scope_entry jsonb;
  v_scope_ok boolean := false;
  -- H0-R §6: resolución server-side de la tasa efectiva (D-EXR-01 / D-EXR-02)
  v_server_rate numeric;
  v_rate_source text;
  v_rate_effective_date timestamptz;
  v_client_rate numeric := p_sale_exchange_rate;  -- propuesta cliente: SOLO auditoría/UX (§6.2)
  -- H0-R §5.4: impuestos validados y reconstruidos desde tax_configurations
  v_applied_taxes_canonical jsonb := '[]'::jsonb;
  v_tax_entry jsonb;
  v_tc record;
  v_tax_ids text[] := '{}';
  -- H0-R §7: identidad de idempotencia (param_hash exhaustivo, patrón V2.26)
  v_param_hash text;
  v_idem_result jsonb;
  v_idem_hash text;
  -- MISIÓN-FLEX (2026-10-17): incidencias de pago (flexibilización temporal)
  v_incidents jsonb;
  v_payment_diff numeric := 0;
  v_has_payment_incident boolean := false;
  v_incidence_note text;
  v_notes_final text;
  v_it jsonb;
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes) — sin cambio
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. AUTH (§3.1 paso 2 — ANTES de idempotencia; cierra el oráculo de claves)
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. SELLER BINDING (§4 — Opción B): p_seller_id == actor autenticado, sin
  --    excepciones. El rechazo es temprano y determinista (transactions.seller_id
  --    es NOT NULL: el NULL explícito hoy fallaba tarde, en el INSERT).
  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SELLER_REQUIRED: p_seller_id es obligatorio y debe coincidir con el actor autenticado';
  END IF;
  IF p_seller_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'ERR_SELLER_MISMATCH: p_seller_id=% no coincide con el actor autenticado=%', p_seller_id, v_uid;
  END IF;

  -- 4. Operation date validation — sin cambio
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. IDEMPOTENCIA (§7 — DESPUÉS de auth/seller; identidad = clave + actor +
  --    tienda + param_hash exhaustivo). El registro idempotency_registry
  --    (patrón V2.26, UNIQUE (key, operation)) da la semántica de precedencia:
  --    la misma identidad → MISMA transacción; identidad distinta con la misma
  --    clave → conflicto limpio SIN fuga de transaction_id (fail-closed).
  IF p_idempotency_key IS NOT NULL THEN
    -- §7.2: campos del hash (orden determinista; lo que el cliente ENVÍA)
    v_param_hash := md5(
      'store=' || COALESCE(p_store_id::text, '') ||
      '|actor=' || COALESCE(v_uid::text, '') ||
      '|items=' || COALESCE((
        SELECT string_agg(
          COALESCE(t.value->>'product_id', '') || ':' ||
          COALESCE(t.value->>'variant_id', '') || ':' ||
          COALESCE(t.value->>'quantity', '') || ':' ||
          COALESCE(NULLIF(t.value->>'price_at_sale', ''), t.value->>'price', ''),
          ',' ORDER BY t.value->>'product_id', t.ord)
        FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      ), '') ||
      '|payment_method=' || COALESCE(p_payment_method, '') ||
      '|cash=' || COALESCE(p_cash_amount::text, '') ||
      '|transfer=' || COALESCE(p_transfer_amount::text, '') ||
      '|zelle=' || COALESCE(p_zelle_amount::text, '') ||
      '|discount_type=' || COALESCE(p_discount_type, '') ||
      '|discount_value=' || COALESCE(p_discount_value::text, '') ||
      '|applied_taxes=' || COALESCE(p_applied_taxes::text, '') ||
      '|sale_currency=' || COALESCE(p_sale_currency, '') ||
      '|sale_exchange_rate=' || COALESCE(p_sale_exchange_rate::text, '') ||
      '|customer_id=' || COALESCE(p_customer_id::text, '') ||
      '|customer_name=' || COALESCE(p_customer_name, '') ||
      '|operation_date=' || COALESCE(NULLIF(FLOOR(EXTRACT(EPOCH FROM p_operation_date))::text, ''), '') ||
      '|total_amount=' || COALESCE(p_total_amount::text, '') ||
      '|subtotal=' || COALESCE(p_subtotal::text, '') ||
      '|tax_amount=' || COALESCE(p_tax_amount::text, '') ||
      -- MISIÓN-FLEX: notas e incidencias forman parte de la identidad
      '|notes=' || COALESCE(p_notes, '') ||
      '|payment_incidents=' || COALESCE(p_payment_incidents::text, '') ||
      -- MISIÓN CAJA 2026-10-23: la liquidación del cobro es parte de la
      -- identidad de la venta (misma clave + liquidación distinta = conflicto)
      '|cash_settlement=' || COALESCE(p_cash_received_cup::text, '') || '/' ||
      COALESCE(p_cash_received_usd::text, '') || '/' ||
      COALESCE(p_change_given_cup::text, '') || '/' ||
      COALESCE(p_change_given_usd::text, '') || '/' ||
      COALESCE(p_change_currency, '') ||
      -- MISIÓN PAGOS MIXTOS (2026-10-24): los componentes por moneda forman
      -- parte de la identidad de idempotencia (misma clave + componentes
      -- distintos = conflicto limpio, sin duplicar filas del ledger).
      '|payment_components=' || COALESCE(p_payment_components::text, '')
    );

    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (p_idempotency_key, 'create_sale_v2', v_tx_id, v_param_hash,
            jsonb_build_object('status', 'pending'))
    ON CONFLICT (idempotency_key, operation) DO NOTHING;

    IF NOT FOUND THEN
      -- Registro preexistente: verificar identidad completa
      SELECT result, param_hash INTO v_idem_result, v_idem_hash
        FROM public.idempotency_registry
        WHERE idempotency_key = p_idempotency_key AND operation = 'create_sale_v2'
        LIMIT 1;

      IF v_idem_hash IS DISTINCT FROM v_param_hash THEN
        -- §7.1: misma clave + payload/actor/tienda distinto → conflicto SIN
        -- transaction_id (jamás retorno silencioso de la venta previa)
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la clave % ya está ligada a otra identidad de venta (payload/actor/tienda)', p_idempotency_key;
      END IF;

      -- Misma identidad → MISMA transacción (0 duplicados)
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
      END IF;

      -- Hash coincide pero la transacción no aparece (creación concurrente en
      -- curso en otra sesión): esperar brevemente y reintentar la lectura.
      PERFORM pg_sleep(0.1);
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
      END IF;
      RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — operación previa con la clave % aún en curso', p_idempotency_key;
    ELSE
      -- Registro recién insertado por esta llamada. Compatibilidad con
      -- transacciones pre-hardening creadas sin registro de identidad: si la
      -- clave ya existe en transactions (índice único global), rechazo limpio
      -- fail-closed en lugar de chocar el índice con un 500 con fuga (§7.3).
      SELECT id INTO v_existing FROM public.transactions
        WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la clave % pertenece a una venta previa sin registro de identidad; utilice una clave nueva', p_idempotency_key;
      END IF;
    END IF;
  END IF;

  -- 6. Auto-promote to mixed — sin cambio
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND p_payment_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  -- MISIÓN-FLEX: con incidencias de pago NO se infla el importe Zelle al total
  -- (un Transf. Exterior parcial debe registrarse como lo reportado).
  IF p_payment_incidents IS NULL AND p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
    v_zelle_amt := p_total_amount;
  END IF;

  -- E-SEC-FINAL (D2): normalización del motivo (obligatoriedad solo si el gate dispara)
  v_reason := btrim(COALESCE(p_discount_reason, ''));
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_DISCOUNT_REASON_INVALID: max 500 caracteres';
  END IF;

  -- 7. Primera pasada — orden determinista por product_id (doctrina W62-05 §2.3):
  --    FOR UPDATE de la fila del producto (serializa stock+WAC) + validaciones.
  FOR v_item, v_ord IN SELECT t.value, t.ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
      ORDER BY (t.value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    -- FIX-USD-CUP-RATE (2026-10-14): conversión del item a la moneda común CUP.
    -- La tasa del item (client-sent, persistida en transaction_items.exchange_rate)
    -- aplica SOLO a items no-CUP; CUP = 1 por definición. Fail-safe: tasa nula o
    -- <= 0 -> 1.0 (la venta CUP pura NO cambia; regresión cero).
    v_item_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'CUP');
    IF v_item_currency = 'CUP' THEN
      v_item_rate := 1.0;
    ELSE
      v_item_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::numeric, 1.0);
      IF v_item_rate <= 0 THEN
        v_item_rate := 1.0;
      END IF;
    END IF;

    SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    IF v_stock IS NULL THEN
      -- fallback legacy: producto sin tienda (servicios globales)
      SELECT stock_current, cost_average, price INTO v_stock, v_wac_prev, v_catalog_price
        FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);

    -- DF-02: costo SIEMPRE del servidor (WAC_prev bajo lock)
    IF v_wac_prev IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;
    IF v_wac_prev = 0 THEN
      IF NOT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                     WHERE store_id = p_store_id AND product_id = v_pid AND scope = 'sale') THEN
        RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_pid;
      END IF;
    END IF;

    -- Saltar validación de stock para servicios
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      IF v_stock < v_units THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units;
      END IF;
    END IF;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    -- DF-02: claves cost_at_sale/cost del request IGNORADAS (no error)
    v_cost := v_wac_prev;

    -- E-SEC (R-SEC-1): precio inválido rechazado EN EL SERVIDOR
    IF v_price IS NULL OR v_price <> v_price
       OR v_price >= 'Infinity'::numeric OR v_price <= '-Infinity'::numeric
       OR v_price < 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale=% product=%', v_price, v_pid;
    END IF;

    -- E-SEC-FINAL (D5): precio monetario de línea → 2 decimales
    v_price := ROUND(v_price, 2);

    -- E-SEC (R-SEC-1): precio de referencia del SERVIDOR para evaluar el desvío
    IF v_variant_id IS NOT NULL THEN
      SELECT price INTO v_reference_price
        FROM public.product_variants WHERE id = v_variant_id;
      v_reference_price := COALESCE(v_reference_price, v_catalog_price);
    ELSE
      v_reference_price := v_catalog_price;
    END IF;

    IF v_reference_price IS NOT NULL THEN
      v_reference_price := ROUND(v_reference_price, 2);
    END IF;

    IF v_reference_price IS NOT NULL AND v_reference_price > 0 THEN
      v_catalog_subtotal := v_catalog_subtotal + (v_reference_price * v_qty);
      v_line_pct := 0;
      IF v_price < v_reference_price THEN
        v_item_discount_total := v_item_discount_total
          + ((v_reference_price - v_price) * v_qty);
        v_line_pct := ((v_reference_price - v_price) / v_reference_price) * 100;
      END IF;
      IF v_line_pct > v_max_line_pct THEN
        v_max_line_pct := v_line_pct;
      END IF;
      v_line_snapshot := v_line_snapshot || jsonb_build_object(
        'ord', v_ord,
        'product_id', v_pid,
        'variant_id', v_variant_id,
        'catalog_price', v_reference_price,
        'price_at_sale', v_price,
        'discount_value', ROUND(GREATEST(0, v_reference_price - v_price) * v_qty, 2),
        'discount_pct', ROUND(v_line_pct, 2)
      );
    END IF;

    -- FIX-USD-CUP-RATE: el total de la venta es CUP = Σ precio nativo × tasa del item × qty
    v_calculated_subtotal := v_calculated_subtotal + ROUND((v_price * v_item_rate * v_qty), 2);
  END LOOP;

  -- 8. Recalcular descuento (§8: el descuento NEGATIVO queda estructuralmente
  --    imposibilitado — hoy LEAST(-100, subtotal) inflaba el total, T-FIN-007)
  IF p_discount_value IS NULL OR p_discount_value < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_DISCOUNT: %', p_discount_value;
  END IF;
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 9. Impuestos (§5.4): el cliente PROPONE (ids); el servidor VALIDA contra el
  --    catálogo autorizado (tax_configurations: global + tienda) y REEMPLAZA con
  --    la entrada canónica reconstruida desde la fila. El JSONB cliente JAMÁS se
  --    persiste tal cual. Entradas sin id / id desconocido / inactivo / de otra
  --    tienda / duplicado → ERR_APPLIED_TAX_INVALID (mensaje uniforme, sin
  --    revelar si el id existe).
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  v_applied_taxes_canonical := '[]'::jsonb;
  v_tax_ids := '{}';
  IF p_applied_taxes IS NULL OR jsonb_typeof(p_applied_taxes) <> 'array' THEN
    RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: p_applied_taxes debe ser un array de {id}';
  END IF;
  FOR v_tax_entry IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax_entry->>'id' IS NULL OR btrim(v_tax_entry->>'id') = ''
       OR v_tax_entry->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: entrada sin id de configuración';
    END IF;
    SELECT id, name, type, value, min_exempt INTO v_tc
      FROM public.tax_configurations
      WHERE id = (v_tax_entry->>'id')::uuid
        AND is_active = true
        AND (store_id IS NULL OR store_id = p_store_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID';
    END IF;
    IF v_tc.id::text = ANY(v_tax_ids) THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: impuesto duplicado';
    END IF;
    v_tax_ids := array_append(v_tax_ids, v_tc.id::text);
    v_applied_taxes_canonical := v_applied_taxes_canonical || jsonb_build_object(
      'id', v_tc.id, 'name', v_tc.name, 'type', v_tc.type,
      'value', v_tc.value, 'min_exempt', v_tc.min_exempt);
    IF v_tc.type = 'percentage' THEN
      v_tax_value := GREATEST(0, v_taxable_base - COALESCE(v_tc.min_exempt, 0)) * v_tc.value / 100;
    ELSE
      v_tax_value := v_tc.value;
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 10. Tasa de cambio (§6.1): resolución SERVER-SIDE exclusiva. Jerarquía:
  --     store_exchange_rates (updated_at) → exchange_rates BCC seg 3 (rate_date)
  --     → exchange_rates Diviza informal (rate_date) → fail-closed. D-EXR-01: la tasa
  --     que gana por precedencia y tiene fecha efectiva > 45 días → ERR_RATE_STALE
  --     (FAIL CLOSED, sin salto silencioso a fuente inferior, sin sustitución por
  --     la tasa del cliente). D-EXR-02: p_sale_exchange_rate queda como dato
  --     recibido SIN autoridad financiera (0/−5/680/1000000 → mismo destino:
  --     ignorados; la desviación NUNCA bloquea).
  v_server_rate := NULL;
  v_rate_source := NULL;
  v_rate_effective_date := NULL;
  IF p_sale_currency = 'CUP' THEN
    v_server_rate := 1;  -- CUP = 1 por definición (sin fuente, sin staleness)
  ELSE
    SELECT ser.rate, 'store', ser.updated_at
      INTO v_server_rate, v_rate_source, v_rate_effective_date
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = p_sale_currency;
    IF v_server_rate IS NULL THEN
      SELECT er.rate, 'global_bcc_seg3', er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_server_rate IS NULL THEN
      SELECT er.rate, 'global_' || lower(er.source), er.rate_date
        INTO v_server_rate, v_rate_source, v_rate_effective_date
        FROM public.exchange_rates er
        WHERE er.currency = p_sale_currency AND er.source = 'Diviza'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_server_rate IS NULL OR v_server_rate <= 0 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: currency=%, store=%', p_sale_currency, p_store_id;
    END IF;
    IF v_rate_effective_date < now() - INTERVAL '45 days' THEN
      RAISE EXCEPTION 'ERR_RATE_STALE: currency=%, store=%, source=%, effective=%',
        p_sale_currency, p_store_id, v_rate_source, v_rate_effective_date;
    END IF;
  END IF;

  -- 11. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 11.5 REGLA INNEGOCIABLE (MISIÓN 2026-10-17): una venta ordinaria con
  --     total NEGATIVO jamás se aprueba. Estructuralmente el recálculo ya lo
  --     impide (precio >= 0, descuento LEAST(subtotal), impuestos >= 0); este
  --     guard explícito es defensa en profundidad y produce un error
  --     tipado que la API registra en Auditoría (sale_negative_rejected).
  IF v_calculated_total < 0 THEN
    RAISE EXCEPTION 'ERR_NEGATIVE_SALE: total=% — una venta con total negativo no puede aprobarse', v_calculated_total;
  END IF;

  -- 11.6 MISIÓN-FLEX: normalización de incidencias de pago (flexibilización
  --     TEMPORAL de diferencias de pago). Solo el flujo del cliente que
  --     documentó la incidencia puede registrar una venta descuadrada; un
  --     cliente sin soporte sigue recibiendo el rechazo canónico.
  v_incidents := NULL;
  IF p_payment_incidents IS NOT NULL
     AND jsonb_typeof(p_payment_incidents) = 'array'
     AND jsonb_array_length(p_payment_incidents) > 0 THEN
    -- Guardrail de integridad financiera: sin tasa REAL para USD/EUR las
    -- diferencias NO son validables (fail-closed, ERR_RATE_REQUIRED_FOR_INCIDENT).
    FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_item_currency := COALESCE(NULLIF(v_it->>'currency', ''), 'CUP');
      IF v_item_currency IN ('USD', 'EUR') THEN
        v_item_rate := COALESCE(NULLIF(v_it->>'exchange_rate', '')::numeric, 1.0);
        IF v_item_rate <= 1.0 THEN
          RAISE EXCEPTION 'ERR_RATE_REQUIRED_FOR_INCIDENT: currency=%, rate=% — configure la tasa de la tienda antes de registrar incidencias de pago', v_item_currency, v_item_rate;
        END IF;
      END IF;
    END LOOP;
    v_incidents := p_payment_incidents;
  END IF;

  -- 12. Validar total vs cliente (tolerancia 0.01)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 13. Validar supervisor auth (gate D1–D5 E-SEC-FINAL — SIN CAMBIO)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;
  IF v_catalog_subtotal > 0 THEN
    v_item_discount_pct := (v_item_discount_total / v_catalog_subtotal) * 100;
  END IF;

  IF v_effective_discount_pct >= 15 OR v_max_line_pct >= 15 THEN
    v_gate_triggered := true;
  END IF;

  IF v_gate_triggered THEN
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: global_pct=%, max_line_pct=%', v_effective_discount_pct, v_max_line_pct;
    END IF;
    IF v_reason = '' THEN
      RAISE EXCEPTION 'ERR_DISCOUNT_REASON_REQUIRED: motivo obligatorio para descuento autorizado';
    END IF;
    IF auth.role() <> 'service_role'
       AND p_supervisor_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;

    IF auth.role() = 'service_role' THEN
      v_supervisor_path := 'token';
      IF p_supervisor_token_jti IS NULL OR btrim(p_supervisor_token_jti) = '' THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REQUIRED: token de supervisor requerido';
      END IF;
      INSERT INTO public.supervisor_token_usages
        (jti, supervisor_user_id, operator_user_id, store_id, transaction_id)
      VALUES
        (btrim(p_supervisor_token_jti), p_supervisor_user_id, v_uid, p_store_id, v_tx_id)
      ON CONFLICT (jti) DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_SUPERVISOR_TOKEN_REUSED: jti ya consumido';
      END IF;

      IF v_max_line_pct >= 15 THEN
        IF p_supervisor_scope IS NULL OR jsonb_typeof(p_supervisor_scope) <> 'array' THEN
          RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: scope ausente para lineas >=15%%';
        END IF;
        IF jsonb_array_length(p_supervisor_scope) = 0 THEN
          RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: scope vacio para lineas >=15%%';
        END IF;
        FOR v_snap IN SELECT * FROM jsonb_array_elements(v_line_snapshot) LOOP
          IF COALESCE((v_snap->>'discount_pct')::numeric, 0) >= 15 THEN
            v_scope_ok := false;
            FOR v_scope_entry IN SELECT * FROM jsonb_array_elements(p_supervisor_scope) LOOP
              IF v_scope_entry->>'pid' IS NOT NULL
                 AND v_scope_entry->>'pid' = v_snap->>'product_id'
                 AND COALESCE(v_scope_entry->>'vid', '') = COALESCE(v_snap->>'variant_id', '')
                 AND ROUND(COALESCE((v_scope_entry->>'px')::numeric, -1), 2)
                     <= ROUND((v_snap->>'price_at_sale')::numeric, 2) THEN
                v_scope_ok := true;
                EXIT;
              END IF;
            END LOOP;
            IF NOT v_scope_ok THEN
              RAISE EXCEPTION 'ERR_SUPERVISOR_SCOPE_VIOLATION: product=%, price=% no cubierto por el scope autorizado', v_snap->>'product_id', v_snap->>'price_at_sale';
            END IF;
          END IF;
        END LOOP;
      END IF;
    ELSE
      v_supervisor_path := 'self_session';
    END IF;
  END IF;

  -- 13.7 MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24): COMPONENTES DE PAGO
  --      POR MONEDA REAL. El cliente declara lo efectivamente cobrado en cada
  --      moneda: [{method, currency, amount}] con importes ORIGINALES (sin
  --      convertir). El servidor:
  --        1. Valida la estructura (método ∈ cash|transfer|zelle, moneda ∈
  --           CUP|USD, importe > 0; zelle es riel USD por diseño).
  --        2. Resuelve la TASA USD de la operación con la jerarquía autoritaria
  --           (tienda → BCC seg3 → Diviza informal, fail-closed, staleness 45 días) —
  --           la MISMA fuente del §10; para venta USD reutiliza v_server_rate.
  --        3. DERIVA los pools canónicos (v_cash_amt/v_transfer_amt/
  --           v_zelle_amt) desde los componentes a la tasa servidor — el
  --           desglose por moneda del cliente deja de tener autoridad
  --           financiera (paridad con D-EXR-02).
  --      Sin componentes (p_payment_components NULL): flujo previo IDÉNTICO
  --      (compatibilidad con /api/sync/batch y clientes legados).
  v_components_ok := false;
  IF p_payment_components IS NOT NULL THEN
    IF jsonb_typeof(p_payment_components) <> 'array' THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: p_payment_components debe ser un array [{method, currency, amount}]';
    END IF;
    IF jsonb_array_length(p_payment_components) > 20 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: máximo 20 componentes por venta';
    END IF;
    v_comp_cash_cup := 0; v_comp_cash_usd := 0;
    v_comp_transfer_cup := 0; v_comp_transfer_usd := 0;
    v_comp_zelle_usd := 0;
    FOR v_comp IN SELECT * FROM jsonb_array_elements(p_payment_components) LOOP
      v_comp_method := lower(btrim(COALESCE(v_comp->>'method', '')));
      v_comp_cur := upper(btrim(COALESCE(v_comp->>'currency', '')));
      v_comp_amt := COALESCE(NULLIF(v_comp->>'amount', '')::numeric, NULL);
      IF v_comp_method NOT IN ('cash', 'transfer', 'zelle')
         OR v_comp_cur NOT IN ('CUP', 'USD')
         OR v_comp_amt IS NULL OR v_comp_amt <= 0 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componente inválido (method=%, currency=%, amount=%)',
          v_comp_method, v_comp_cur, COALESCE(v_comp->>'amount', 'NULL');
      END IF;
      IF v_comp_method = 'zelle' AND v_comp_cur <> 'USD' THEN
        RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: zelle es un riel USD (currency=%)', v_comp_cur;
      END IF;
      IF v_comp_method = 'cash' THEN
        IF v_comp_cur = 'CUP' THEN
          v_comp_cash_cup := v_comp_cash_cup + v_comp_amt;
        ELSE
          v_comp_cash_usd := v_comp_cash_usd + v_comp_amt;
        END IF;
      ELSIF v_comp_method = 'transfer' THEN
        IF v_comp_cur = 'CUP' THEN
          v_comp_transfer_cup := v_comp_transfer_cup + v_comp_amt;
        ELSE
          v_comp_transfer_usd := v_comp_transfer_usd + v_comp_amt;
        END IF;
      ELSE
        v_comp_zelle_usd := v_comp_zelle_usd + v_comp_amt;
      END IF;
    END LOOP;

    -- CP-MONEY-002 (D3, posmerge #1467): UNICIDAD de (método, moneda). El
    -- cliente AGRUPA por (método, moneda) (buildPaymentComponents); un payload
    -- con duplicados solo puede venir de un cliente no estándar y §17
    -- insertaría DOS filas del ledger con la MISMA idempotency_key
    -- 'pay-<method>-<currency>-<tx>' — payment_transactions no tiene
    -- UNIQUE(idempotency_key) (verificado contra la BD viva 2026-10-24: solo
    -- PK) → filas duplicadas en la fuente autoritativa del Reporte Entrega.
    -- Fail-closed coherente con la regla de la misión (Fase B: «Rechaza
    -- componentes duplicados») y con la agregación previa de pools (§13.7).
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payment_components) c
      GROUP BY lower(btrim(c->>'method')), upper(btrim(c->>'currency'))
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'ERR_PAYMENT_COMPONENTS_INVALID: componentes duplicados — agrupa los importes del mismo método y moneda en un solo componente [{method, currency, amount}]';
    END IF;

    -- Tasa USD de la operación (jerarquía §6.1 — misma fuente que v_server_rate)
    IF upper(COALESCE(p_sale_currency, 'CUP')) = 'USD' AND v_server_rate > 1 THEN
      v_usd_rate := v_server_rate;  -- venta USD: la tasa ya resuelta ES la tasa USD
    END IF;
    IF (v_comp_cash_usd + v_comp_transfer_usd + v_comp_zelle_usd) > 0
       AND (v_usd_rate IS NULL OR v_usd_rate <= 1) THEN
      SELECT ser.rate, 'store_exchange_rates', ser.updated_at
        INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
        FROM public.store_exchange_rates ser
        WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
      IF v_usd_rate IS NULL THEN
        SELECT er.rate, 'global_bcc_seg3', er.rate_date
          INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_usd_rate IS NULL THEN
        SELECT er.rate, 'global_' || lower(er.source), er.rate_date
          INTO v_usd_rate, v_usd_rate_source, v_usd_rate_eff
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'Diviza'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: componentes en USD exigen tasa USD (jerarquía tienda→BCC→Diviza) — tienda %', p_store_id;
      END IF;
      IF v_usd_rate_eff < now() - INTERVAL '45 days' THEN
        RAISE EXCEPTION 'ERR_RATE_STALE: currency=USD, store=%, source=%, effective=%',
          p_store_id, v_usd_rate_source, v_usd_rate_eff;
      END IF;
    END IF;

    -- Pools canónicos DERIVADOS (autoridad servidor, fail-closed): la suma de
    -- componentes convertidos a la tasa de la operación.
    v_cash_amt := v_comp_cash_cup + v_comp_cash_usd * COALESCE(v_usd_rate, 1);
    v_transfer_amt := v_comp_transfer_cup + v_comp_transfer_usd * COALESCE(v_usd_rate, 1);
    v_zelle_amt := v_comp_zelle_usd * COALESCE(v_usd_rate, 1);
    v_components_ok := true;
  END IF;

  -- 14. Validar/setear payment split
  --     MISIÓN-FLEX (2026-10-17): con incidencias documentadas por el cliente
  --     (v_incidents) se permiten faltante/sobrepago/desglose descuadrado y
  --     se registran los importes REALMENTE recibidos. Sin incidencias el
  --     comportamiento canónico anterior queda intacto (fail-closed).
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 1.00 THEN
      IF v_incidents IS NULL THEN
        RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
          v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
      END IF;
      -- flexibilizado: la diferencia se documenta en nota + auditoría
    END IF;
  ELSIF v_components_ok THEN
    -- MISIÓN PAGOS MIXTOS (2026-10-24): los pools DERIVADOS de los
    -- componentes (§13.7) son la autoridad — el importe realmente recibido
    -- por moneda ya está validado contra la tasa servidor. Las sobreescritas
    -- por método (total canónico / pool del cliente) NO aplican: destruirían
    -- el desglose por moneda. La suma sigue validándose abajo (14.5/14.9/18)
    -- con las mismas reglas e incidencias MISIÓN-FLEX.
    NULL;
  ELSIF v_effective_method = 'cash' THEN
    IF v_incidents IS NOT NULL AND p_cash_amount IS NOT NULL AND p_cash_amount >= 0 THEN
      v_cash_amt := p_cash_amount;  -- lo realmente recibido (puede faltar/sobrar)
    ELSE
      v_cash_amt := v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'transfer' THEN
    IF v_incidents IS NOT NULL AND p_transfer_amount IS NOT NULL AND p_transfer_amount >= 0 THEN
      v_transfer_amt := p_transfer_amount;
    ELSE
      v_transfer_amt := v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'zelle' THEN
    IF v_incidents IS NOT NULL AND p_zelle_amount IS NOT NULL AND p_zelle_amount >= 0 THEN
      v_zelle_amt := p_zelle_amount;
    ELSE
      v_zelle_amt := v_calculated_total;
    END IF;
  END IF;

  -- 14.5 MISIÓN-FLEX: diferencia de pago + nota automática de incidencia.
  --     La nota respeta la nota manual (p_notes) SIN sobrescribirla: se
  --     antepone y la incidencia se añade en línea nueva.
  v_payment_diff := ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total, 2);
  v_has_payment_incident := (v_incidents IS NOT NULL)
    AND (abs(v_payment_diff) > 0.01 OR jsonb_array_length(v_incidents) > 0);
  v_incidence_note := NULL;
  IF v_has_payment_incident THEN
    IF v_payment_diff < 0 THEN
      v_incidence_note := 'INCIDENCIA DE PAGO: venta registrada con pago insuficiente. Total: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. Importe recibido: '
        || to_char(v_cash_amt + v_transfer_amt + v_zelle_amt, 'FM999999990.00')
        || ' CUP. Pendiente: ' || to_char(abs(v_payment_diff), 'FM999999990.00') || ' CUP.';
    ELSIF v_payment_diff > 0 THEN
      v_incidence_note := 'INCIDENCIA DE PAGO: sobrepago detectado. Total de venta: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. Importe recibido: '
        || to_char(v_cash_amt + v_transfer_amt + v_zelle_amt, 'FM999999990.00')
        || ' CUP. Diferencia: ' || to_char(v_payment_diff, 'FM999999990.00')
        || ' CUP. Revisar el tratamiento del vuelto según los medios de pago utilizados.';
    ELSE
      v_incidence_note := 'INCIDENCIA DE PAGO: descuadre en el desglose de medios de pago. Total de venta: '
        || to_char(v_calculated_total, 'FM999999990.00') || ' CUP. El desglose por línea se conserva documentado en la venta.';
    END IF;
    v_incidence_note := v_incidence_note
      || ' Validación temporal autorizada por la configuración del sistema. ['
      || to_char(v_eff AT TIME ZONE 'America/Havana', 'YYYY-MM-DD HH24:MI')
      || ' HV] usuario=' || COALESCE(v_uid::text, 'desconocido');
  END IF;
  v_notes_final := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF v_notes_final IS NOT NULL AND v_incidence_note IS NOT NULL THEN
    v_notes_final := v_notes_final || E'\n' || v_incidence_note;
  ELSIF v_incidence_note IS NOT NULL THEN
    v_notes_final := v_incidence_note;
  END IF;

  -- 14.7 MISIÓN CAJA 2026-10-23 (D6): LIQUIDACIÓN DEL COBRO — vuelto por
  --      moneda, ENLAZADO a la venta. El efecto en caja sigue siendo UNO
  --      (cash_amount neto canónico): NO se crea fila de caja aparte para el
  --      vuelto (prohibido duplicar — misión §8). Validación server-side:
  --        · importes no negativos; vuelto ≤ recibido POR MONEDA;
  --        · moneda de vuelto ∈ (CUP, USD);
  --        · cobro/vuelto en USD ⇒ tasa SERVIDOR obligatoria (jerarquía de
  --          ventas, fail-closed) con fuente registrada — sin tasas ocultas;
  --        · (recibido CUP − vuelto CUP) + (recibido USD − vuelto USD)×tasa =
  --          componente cash de la venta (±0.01) ⇒ sin diferencias contables.
  --      Sin liquidación (ventas legacy/transfer/zelle) el flujo queda
  --      IDÉNTICO a v2.23.0 (columnas NULL).
  v_settlement_present := (p_cash_received_cup IS NOT NULL OR p_cash_received_usd IS NOT NULL
    OR p_change_given_cup IS NOT NULL OR p_change_given_usd IS NOT NULL);
  IF v_settlement_present THEN
    IF COALESCE(p_cash_received_cup, 0) < 0 OR COALESCE(p_cash_received_usd, 0) < 0
       OR COALESCE(p_change_given_cup, 0) < 0 OR COALESCE(p_change_given_usd, 0) < 0 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_INVALID: los importes de la liquidación no pueden ser negativos';
    END IF;
    IF p_change_currency IS NOT NULL AND upper(btrim(p_change_currency)) NOT IN ('CUP', 'USD') THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_INVALID: moneda de vuelto no admitida (%)', p_change_currency;
    END IF;
    IF COALESCE(p_cash_received_cup, 0) + COALESCE(p_cash_received_usd, 0)
       + COALESCE(p_change_given_cup, 0) + COALESCE(p_change_given_usd, 0) > 0
       AND v_cash_amt <= 0 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_NOT_APPLICABLE: la venta no tiene componente en efectivo';
    END IF;
    -- NOTA: NO se exige «vuelto ≤ recibido POR MONEDA»: el vuelto puede darse
    -- en una moneda NO recibida (misión §8: paga 60.000 CUP → recibe 80 USD de
    -- vuelto — el cajón USD puede quedar momentáneamente negativo si no había
    -- billetes; el LIBRO por moneda lo refleja y la ENTREGA valida contra el
    -- saldo acumulado). La restricción real es CANÓNICA y se valida abajo:
    -- recibido − vuelto (a tasa servidor) = cash de la venta ≥ 0.
    IF COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0 THEN
      SELECT ser.rate, 'store_exchange_rates' INTO v_chg_rate, v_chg_rate_src
        FROM public.store_exchange_rates ser
        WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
      IF v_chg_rate IS NULL THEN
        SELECT er.rate, 'global_bcc_seg3' INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL THEN
        SELECT er.rate, 'global_' || lower(er.source) INTO v_chg_rate, v_chg_rate_src
          FROM public.exchange_rates er
          WHERE er.currency = 'USD' AND er.source = 'Diviza'
          ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
      END IF;
      IF v_chg_rate IS NULL OR v_chg_rate <= 1 THEN
        RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: el cobro/vuelto en USD exige tasa USD de la tienda (jerarquía tienda→BCC→Diviza) — sin tasa no se completa la operación (tienda %)', p_store_id;
      END IF;
    END IF;
    v_settle_net_cup := COALESCE(p_cash_received_cup, 0) - COALESCE(p_change_given_cup, 0);
    v_settle_net_usd := COALESCE(p_cash_received_usd, 0) - COALESCE(p_change_given_usd, 0);
    IF abs((v_settle_net_cup + v_settle_net_usd * COALESCE(v_chg_rate, v_server_rate)) - v_cash_amt) > 0.01 THEN
      RAISE EXCEPTION 'ERR_CASH_SETTLEMENT_MISMATCH: la liquidación (%) no cuadra con el efectivo de la venta (%)',
        round(v_settle_net_cup + v_settle_net_usd * COALESCE(v_chg_rate, v_server_rate), 2), round(v_cash_amt, 2);
    END IF;
  END IF;

  -- 14.9 REVISIÓN FINAL v2.24.1 (F4) — bloqueo preventivo del vuelto NO
  --     registrable (cobros mixtos / sobrepagos sin liquidación). Un cobro
  --     cuyo importe recibido excede el total debido exige entregar vuelto
  --     físico. Sin liquidación (cash_received_*/change_given_*), ese vuelto
  --     no queda registrado en NINGUNA moneda y el libro sobreestima el
  --     efectivo disponible (defecto medio del escenario C de la auditoría).
  --     La venta se RECHAZA: el cajero debe (a) ajustar el desglose a
  --     importes exactos, (b) registrar el cobro con la liquidación de
  --     vuelto (identidad recibido − vuelto = cash de la venta, ya soportada
  --     para cualquier método), o (c) cobrar el faltante como incidencia —
  --     el pago insuficiente NO se toca: no exige salida física de caja.
  --     Ventas históricas: intactas (el gate solo aplica a INSERT nuevos).
  IF NOT v_settlement_present AND v_payment_diff > 0.01 THEN
    RAISE EXCEPTION 'ERR_OVERPAYMENT_UNREGISTERED_CHANGE: recibido (%) > total (%) sin liquidación de vuelto — el vuelto físico no sería registrable por el backend; ajuste el desglose o registre la liquidación',
      ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt, 2), ROUND(v_calculated_total, 2);
  END IF;

  -- 15. INSERT transactions — §6.3/§4/§5.4: tasa servidor, seller = v_uid,
  --     impuestos = snapshot canónico del catálogo
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name,
    -- MISIÓN-FLEX: nota (manual + incidencia) e incidencias estructuradas
    notes, payment_incidents,
    -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro (vuelto multimoneda)
    cash_received_cup, cash_received_usd, change_given_cup, change_given_usd,
    change_currency, change_exchange_rate, change_rate_source
  ) VALUES (
    v_tx_id, p_store_id, v_uid, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, v_applied_taxes_canonical,
    p_sale_currency, v_server_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name,
    v_notes_final, v_incidents,
    p_cash_received_cup, p_cash_received_usd, p_change_given_cup, p_change_given_usd,
    CASE WHEN v_settlement_present THEN COALESCE(upper(btrim(p_change_currency)),
      CASE WHEN COALESCE(p_change_given_usd, 0) > 0 THEN 'USD' ELSE 'CUP' END) END,
    CASE WHEN v_settlement_present AND (COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0)
      THEN v_chg_rate END,
    CASE WHEN v_settlement_present AND (COALESCE(p_cash_received_usd, 0) > 0 OR COALESCE(p_change_given_usd, 0) > 0)
      THEN v_chg_rate_src END
  );

  -- 16. Segunda pasada: stock movement + transaction_items — MISMA autoridad de costo
  FOR v_item, v_ord IN SELECT t.value, t.ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ord)
      ORDER BY (t.value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;
    v_price := ROUND(v_price, 2);

    -- FIX-USD-CUP-RATE (2026-10-14): conversión del item a la moneda común CUP.
    -- La tasa del item (client-sent, persistida en transaction_items.exchange_rate)
    -- aplica SOLO a items no-CUP; CUP = 1 por definición. Fail-safe: tasa nula o
    -- <= 0 -> 1.0 (la venta CUP pura NO cambia; regresión cero).
    v_item_currency := COALESCE(NULLIF(v_item->>'currency', ''), 'CUP');
    IF v_item_currency = 'CUP' THEN
      v_item_rate := 1.0;
    ELSE
      v_item_rate := COALESCE(NULLIF(v_item->>'exchange_rate', '')::numeric, 1.0);
      IF v_item_rate <= 0 THEN
        v_item_rate := 1.0;
      END IF;
    END IF;

    SELECT e INTO v_snap FROM jsonb_array_elements(v_line_snapshot) AS e
      WHERE (e->>'ord')::bigint = v_ord;

    SELECT cost_average INTO v_cost
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;
    IF v_cost IS NULL THEN
      SELECT cost_average INTO v_cost FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    IF v_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
        p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
        p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
      cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
      cash_currency, transfer_currency, zelle_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      zelle_discount_type, zelle_discount_value, zelle_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup,
      catalog_price_at_sale, item_discount_value, item_discount_pct
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum,
      v_discount_amount,
      p_sale_currency,
      -- FIX-USD-CUP-RATE: precio CUP del item con SU tasa (antes v_server_rate,
      -- que es la tasa de la VENTA y es 1 en ventas CUP: un item USD quedaba
      -- registrado con su precio nativo como si fuera CUP).
      v_price * v_item_rate,
      (v_snap->>'catalog_price')::numeric,
      COALESCE((v_snap->>'discount_value')::numeric, 0),
      COALESCE((v_snap->>'discount_pct')::numeric, 0)
    );
  END LOOP;

  -- 17. payment_transactions (fuente autoritativa de pagos) — §6.3: zelle
  --     siempre con la tasa servidor
  -- MISIÓN PAGOS MIXTOS (2026-10-24): con componentes, el ledger registra
  -- UNA FILA POR COMPONENTE con su MONEDA REAL y la TASA DE LA OPERACIÓN
  -- persistida (exchange_rate de la fila USD = tasa servidor §13.7). El
  -- invariante PT011 (Σ amount_cup = total) se preserva EXACTO porque los
  -- pools del INSERT de la venta se derivaron de estos mismos componentes a
  -- esta misma tasa. Sin componentes: flujo previo (pool canónico CUP).
  IF v_components_ok THEN
    FOR v_comp IN SELECT * FROM jsonb_array_elements(p_payment_components) LOOP
      v_comp_method := lower(btrim(COALESCE(v_comp->>'method', '')));
      v_comp_cur := upper(btrim(COALESCE(v_comp->>'currency', '')));
      v_comp_amt := COALESCE(NULLIF(v_comp->>'amount', '')::numeric, NULL);
      IF v_comp_method = 'zelle' THEN
        -- Zelle: mismas reglas canónicas del flujo previo (riel USD, tasa > 1,
        -- moneda de venta USD/EUR/MLC).
        IF p_sale_currency = 'CUP' OR v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
          RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and server_exchange_rate > 1. Got: currency=%, rate=%',
            p_sale_currency, v_usd_rate USING ERRCODE = 'PT009';
        END IF;
        IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
          RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
            p_sale_currency USING ERRCODE = 'PT004';
        END IF;
      END IF;
      INSERT INTO public.payment_transactions (
        store_id, ref_type, ref_id, transaction_id,
        amount, payment_method, currency, exchange_rate,
        payment_date, paid_by, idempotency_key
      ) VALUES (
        p_store_id, 'sale', v_tx_id, v_tx_id,
        v_comp_amt, v_comp_method, v_comp_cur,
        CASE WHEN v_comp_cur = 'USD' THEN v_usd_rate ELSE 1.0 END,
        v_eff, v_uid, 'pay-' || v_comp_method || '-' || v_comp_cur || '-' || v_tx_id::text
      ) RETURNING id INTO v_pt_id;
    END LOOP;
  ELSIF v_cash_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_cash_amt, 'cash', 'CUP', 1.0,
      v_eff, v_uid, 'pay-cash-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_transfer_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_transfer_amt, 'transfer', 'CUP', 1.0,
      v_eff, v_uid, 'pay-transfer-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF NOT v_components_ok AND v_zelle_amt > 0 THEN
    IF p_sale_currency = 'CUP' OR v_server_rate IS NULL OR v_server_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and server_exchange_rate > 1. Got: currency=%, rate=%',
        p_sale_currency, v_server_rate USING ERRCODE = 'PT009';
    END IF;
    IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
        p_sale_currency USING ERRCODE = 'PT004';
    END IF;
    v_zelle_original_amount := v_zelle_amt / v_server_rate;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_zelle_original_amount, 'zelle', p_sale_currency, v_server_rate,
      v_eff, v_uid, 'pay-zelle-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 18. Validación post-INSERT: I1b (POS exige pago completo) — sin cambio
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_tx_id;

  IF ABS(v_sum_payments - v_calculated_total) > 0.01 THEN
    IF v_incidents IS NULL THEN
      RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
        v_sum_payments, v_calculated_total USING ERRCODE = 'PT011';
    END IF;
    -- MISIÓN-FLEX: venta con incidencia de pago documentada — la diferencia
    -- entre lo recibido y el total queda registrada en notes +
    -- payment_incidents + evento SALE_PAYMENT_INCIDENT (trazabilidad).
  END IF;

  -- 19. Cerrar el registro de idempotencia con el resultado definitivo
  --     (patrón V2.26: el retry posterior lee el resultado del registry)
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_registry
      SET result = jsonb_build_object('status', 'success', 'transaction_id', v_tx_id)
      WHERE idempotency_key = p_idempotency_key AND operation = 'create_sale_v2';
  END IF;

  -- 20. Audit log completo — §6.2/§7: auditoría ampliada con tasa cliente/servidor
  --     (observabilidad NO autoritativa de la divergencia, D-EXR-02) y param_hash
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object(
      'total_amount', v_calculated_total,
      'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount,
      'discount_pct', v_effective_discount_pct,
      'catalog_subtotal', v_catalog_subtotal,
      'item_discount_total', v_item_discount_total,
      'item_discount_pct', v_item_discount_pct,
      'max_line_discount_pct', v_max_line_pct,
      'tax_amount', v_calculated_tax,
      'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id,
      'supervisor_id', p_supervisor_user_id,
      'discount_reason', v_reason,
      'supervisor_path', v_supervisor_path,
      'supervisor_token_jti', CASE WHEN v_supervisor_path = 'token' THEN btrim(p_supervisor_token_jti) END,
      'lines', v_line_snapshot,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true,
      'payment_transactions_created', true,
      'cogs_authority', 'server_side_wac_df02',
      'policy_version', 'E-SEC-FINAL',
      -- H0-R §6.2 (D-EXR-02): trazabilidad no-autoritativa de la tasa
      'client_rate', v_client_rate,
      'server_rate', v_server_rate,
      'rate_source', v_rate_source,
      'rate_authority', 'server_side_h0r_d_exr',
      -- H0-R §7: identidad de idempotencia auditada
      'idempotency_param_hash', v_param_hash,
      -- H0-R §5.4: autoridad fiscal del snapshot
      'tax_authority', 'tax_configurations_server_side',
      -- MISIÓN-FLEX (2026-10-17): incidencias de pago y nota de la venta
      'has_payment_incident', v_has_payment_incident,
      'payment_diff_cup', v_payment_diff,
      'payment_incidents', COALESCE(v_incidents, '[]'::jsonb),
      'sale_notes', v_notes_final,
      -- MISIÓN CAJA 2026-10-23 (D6): liquidación del cobro auditada
      'cash_settlement_present', v_settlement_present,
      'cash_received_cup', p_cash_received_cup,
      'cash_received_usd', p_cash_received_usd,
      'change_given_cup', p_change_given_cup,
      'change_given_usd', p_change_given_usd,
      'change_rate', v_chg_rate,
      'change_rate_source', v_chg_rate_src,
      -- MISIÓN PAGOS MIXTOS (2026-10-24): desglose por moneda auditado
      'payment_components', COALESCE(p_payment_components, 'null'::jsonb),
      'usd_operation_rate', v_usd_rate,
      'usd_operation_rate_source', v_usd_rate_source
    ));

  -- 20.5 MISIÓN-FLEX: evento de auditoría dedicado por venta con incidencia
  --     de pago (visible y filtrable en Inicio → OPERACIÓN → Auditoría).
  --     Vive en la MISMA transacción de la venta: sin duplicados en reintentos
  --     (idempotencia §5) y jamás se registra si la venta no se persiste.
  IF v_has_payment_incident THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('SALE_PAYMENT_INCIDENT', 'transactions', v_tx_id, p_store_id, v_uid,
      jsonb_build_object(
        'transaction_id', v_tx_id,
        'total_amount', v_calculated_total,
        'received_amount_cup', ROUND(v_cash_amt + v_transfer_amt + v_zelle_amt, 2),
        'difference_cup', v_payment_diff,
        'incidents', v_incidents,
        'note', v_notes_final,
        'payment_method', v_effective_method,
        'flexibilization', 'temporal_payment_validation',
        'policy_version', 'MISION-FLEX-2026-10-17'
      ));
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END $function$


-- @contract-function name=create_store_with_membership args="p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_store_with_membership(p_name text, p_address text DEFAULT ''::text, p_created_by uuid DEFAULT NULL::uuid, p_max_stores integer DEFAULT 1, p_logo_url text DEFAULT NULL::text, p_reeup text DEFAULT NULL::text, p_nit text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_plantilla text DEFAULT 'construccion'::text, p_signature_url text DEFAULT NULL::text, p_stamp_url text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_store_id uuid;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_active_count int;
  v_tenant uuid;
BEGIN
  -- Iteración 13: Resolver tenant_id del caller si no se pasa explícito
  v_tenant := COALESCE(p_tenant_id, (SELECT tenant_id FROM public.profiles WHERE id = v_caller_uid));

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_NO_TENANT: User has no tenant_id and p_tenant_id is NULL';
  END IF;

  -- REM-INV-5: serialize per-tenant store creation. Closes the COUNT-then-INSERT
  -- race on the per-tenant store limit (concurrent same-tenant calls could all
  -- observe the pre-insert count and exceed p_max_stores). Transaction-scoped:
  -- released automatically at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext('tenant_stores:' || v_tenant::text));

  -- Check store count per tenant (NO per user)
  SELECT COUNT(*) INTO v_active_count
    FROM public.stores
    WHERE tenant_id = v_tenant AND is_active = true;

  IF v_active_count >= p_max_stores THEN
    RAISE EXCEPTION 'ERR_STORE_LIMIT_REACHED: Tenant % has % active stores, limit is %', v_tenant, v_active_count, p_max_stores;
  END IF;

  -- INSERT store with tenant_id
  INSERT INTO public.stores (
    name, address, created_by, is_active, logo_url, reeup, nit, bank_account,
    phone, email, slug, plantilla, signature_url, stamp_url, latitude, longitude, tenant_id
  ) VALUES (
    p_name, p_address, v_caller_uid, true, p_logo_url, p_reeup, p_nit, p_bank_account,
    p_phone, p_email, p_slug, p_plantilla, p_signature_url, p_stamp_url, p_latitude, p_longitude, v_tenant
  )
  RETURNING id INTO v_store_id;

  -- Create admin membership for caller
  INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
  VALUES (v_caller_uid, v_store_id, 'admin', 'active')
  ON CONFLICT (user_id, store_id) DO NOTHING;

  -- Set active_store_id if NULL
  UPDATE public.profiles SET active_store_id = v_store_id
    WHERE id = v_caller_uid AND active_store_id IS NULL;

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('store_created', 'stores', v_store_id, v_store_id, v_caller_uid,
    jsonb_build_object('store_name', p_name, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
END;

$function$


-- @contract-function name=create_transfer args="p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
  v_item JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_cost NUMERIC := 0;
  v_count INTEGER := 0;
  v_dest_product UUID;
  v_origin_product RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_origin_store RECORD;
  v_dest_store RECORD;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_origin_store FROM public.stores WHERE id = p_origin_store_id;
  SELECT * INTO v_dest_store FROM public.stores WHERE id = p_destination_store_id;
  IF NOT v_origin_store.is_active THEN RAISE EXCEPTION 'ERR_ORIGIN_STORE_INACTIVE'; END IF;
  IF NOT v_dest_store.is_active THEN RAISE EXCEPTION 'ERR_DEST_STORE_INACTIVE'; END IF;

  IF p_origin_store_id = p_destination_store_id THEN
    RAISE EXCEPTION 'ERR_SAME_STORE';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico de fechas. Este RPC
  -- se invoca DIRECTO desde el navegador (transfer-service), por lo que esta
  -- era la única capa de servidor posible: sin gate, cualquier fecha (futura
  -- incluida) persistía en transfers.created_at y en el MAX de la tienda.
  PERFORM public.validate_operation_date(v_effective_date, p_origin_store_id);

  INSERT INTO public.transfers (
    id, origin_store_id, destination_store_id, status, notes, total_cost,
    created_by, created_at
  ) VALUES (
    v_transfer_id, p_origin_store_id, p_destination_store_id, 'PENDIENTE', p_notes, 0,
    v_caller_uid, v_effective_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    PERFORM pg_advisory_xact_lock(hashtext('product:' || v_pid::text));

    SELECT p.id, p.stock_current, p.cost_average, p.sku, p.name, p.unit_of_measure,
           p.description, p.category, p.price, p.price_currency,
           COALESCE(p.is_service, false) AS is_service,
           p.stock_current - COALESCE(
             (SELECT SUM(r.quantity) FROM public.inventory_reservations r
              WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
             0
           ) AS stock_avail
    INTO v_origin_product
    FROM public.products p
    WHERE p.id = v_pid AND p.store_id = p_origin_store_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid; END IF;

    -- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): rechazo explícito de servicios.
    -- Un artículo intangible no tiene existencias transferibles entre
    -- almacenes; el bloqueo accidental por stock 0 era un error confuso.
    IF v_origin_product.is_service THEN
      RAISE EXCEPTION 'ERR_SERVICE_NOT_TRANSFERABLE: el producto % (SKU %) es un servicio (is_service=true) y no tiene existencias transferibles entre almacenes',
        v_origin_product.name, v_origin_product.sku;
    END IF;

    IF v_origin_product.stock_avail < v_qty THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: producto %, disponible %, solicitado %',
        v_origin_product.name, v_origin_product.stock_avail, v_qty;
    END IF;

    v_unit_cost := v_origin_product.cost_average;
    v_line_total := v_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_line_total;
    v_count := v_count + 1;

    -- H-049: Buscar producto destino por SKU
    SELECT id INTO v_dest_product
    FROM public.products
    WHERE sku = v_origin_product.sku AND store_id = p_destination_store_id
    LIMIT 1;

    -- H-049: Si no existe, crear producto espejo con MÁS campos copiados
    -- MISIÓN TIPO-DE-ARTÍCULO: el espejo copia también is_service.
    IF v_dest_product IS NULL THEN
      INSERT INTO public.products (
        store_id, sku, name, description, unit_of_measure,
        stock_current, cost_average, cost_price, price, price_currency,
        is_active, category, is_service
      ) VALUES (
        p_destination_store_id,
        v_origin_product.sku,
        v_origin_product.name,
        COALESCE(v_origin_product.description, v_origin_product.name),  -- H-049: descripción real
        v_origin_product.unit_of_measure,
        0,
        v_unit_cost,
        v_unit_cost,
        COALESCE(v_origin_product.price, v_unit_cost),  -- H-049: precio del origen
        COALESCE(v_origin_product.price_currency, 'CUP'),  -- H-049: moneda del origen
        true,
        COALESCE(v_origin_product.category, 'General'),  -- H-049: categoría del origen
        v_origin_product.is_service
      ) RETURNING id INTO v_dest_product;
    END IF;

    INSERT INTO public.transfer_items (transfer_id, product_id, destination_product_id, quantity, unit_cost, total)
    VALUES (v_transfer_id, v_pid, v_dest_product, v_qty, v_unit_cost, v_line_total);

    INSERT INTO public.inventory_reservations (
      store_id, product_id, reference_type, reference_id,
      quantity, status, created_by, metadata
    ) VALUES (
      p_origin_store_id, v_pid, 'TRANSFER', v_transfer_id,
      v_qty, 'ACTIVE', v_caller_uid,
      jsonb_build_object('destination_store_id', p_destination_store_id, 'dest_product_id', v_dest_product)
    );
  END LOOP;

  UPDATE public.transfers SET total_cost = v_total_cost WHERE id = v_transfer_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_TRANSFER', 'transfers', v_transfer_id, p_origin_store_id, v_caller_uid,
    jsonb_build_object('dest', p_destination_store_id, 'total_cost', v_total_cost, 'items_count', v_count,
      'reservations_created', v_count));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id, 'total_cost', v_total_cost);
END;
$function$


-- @contract-function name=create_vale_salida args="p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slip_id      uuid := gen_random_uuid();
  v_slip_number  text;
  v_caller_uid   uuid;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_po_item_id   uuid;
  v_po_product   uuid;
  v_po_variant   uuid;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_existing_result JSONB;
  v_param_hash TEXT;
  v_eff timestamptz;
BEGIN
  v_eff := COALESCE(p_operation_date, NOW());
  PERFORM public.validate_operation_date(v_eff, p_store_id);

  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_store_id::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,'') || '|' || COALESCE(p_operation_date::text,''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, total_cost, created_by, created_at)
  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, p_notes, 0, v_caller_uid, v_eff);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity   := (v_item->>'quantity')::numeric;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;

      -- DF-09: firma consolidada v3 — costo SIEMPRE server-side (sin p_unit_cost)
      PERFORM public.withdraw_production_item_v3(
        p_item_id := v_po_item_id, p_qty := v_quantity,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_idempotency_key := NULL,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number
      );
      -- el costo usado por v3 (server-side) para el asiento del vale:
      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id;
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE,
        p_operation_date := v_eff
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost, created_at)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost, v_eff);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
      jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));
  END IF;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'withdraw_signature', 'v3_server_side_df09',
      'operation_date', v_eff, 'import_origin', 'ENERVIDA-EXCEL-IMPORT'));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END $function$


-- @contract-function name=detect_orphan_users args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.detect_orphan_users()
 RETURNS TABLE(auth_user_id uuid, email text, detected_at timestamp with time zone, log_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orphan RECORD;
BEGIN
  -- Solo admin puede ejecutar
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can detect orphan users.';
  END IF;

  -- Registrar nuevos huérfanos (idempotente por UNIQUE auth_user_id)
  FOR v_orphan IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.orphaned_users_log (auth_user_id, email)
    VALUES (v_orphan.id, v_orphan.email)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;

  -- Retornar huérfanos actuales con status del log
  RETURN QUERY
    SELECT
      o.auth_user_id,
      o.email,
      o.detected_at,
      o.status
    FROM public.orphaned_users_log o
    WHERE o.status IN ('pending', 'pending_deletion')
    ORDER BY o.detected_at DESC;
END;
$function$


-- @contract-function name=distribute_service_cost_v2 args="p_service_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_total_amount numeric;
  v_service received_services%ROWTYPE;
  v_method text;
  v_link service_reception_links%ROWTYPE;
  v_item receipt_items%ROWTYPE;
  v_total_value numeric := 0;
  v_total_qty numeric := 0;
  v_allocated numeric;
  v_dist_count integer := 0;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT * INTO v_service FROM received_services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  v_store_id := v_service.store_id;
  v_status := v_service.status;
  v_total_amount := v_service.total_amount;
  v_method := v_service.distribution_method;

  -- FIX D1: autorización del ACTOR sobre la tienda REAL del servicio.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_ACTIVE: status % is not active', v_status;
  END IF;

  IF v_method = 'manual' THEN
    RAISE EXCEPTION 'ERR_MANUAL_METHOD: use link_receipts_to_service for manual distribution';
  END IF;

  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;

  FOR v_link IN SELECT * FROM service_reception_links WHERE service_id = p_service_id AND allocated_amount > 0 ORDER BY receipt_id LOOP
    v_allocated := v_link.allocated_amount;

    IF v_method = 'amount' THEN
      SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total_value
      FROM receipt_items WHERE receipt_id = v_link.receipt_id;
      IF v_total_value > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_link.receipt_id ORDER BY id LOOP
          INSERT INTO service_cost_distributions
            (service_id, receipt_id, receipt_item_id, product_id, distribution_amount, distribution_percentage)
          VALUES
            (p_service_id, v_link.receipt_id, v_item.id, v_item.product_id,
             v_allocated * (v_item.quantity * v_item.unit_cost / v_total_value),
             (v_item.quantity * v_item.unit_cost / v_total_value) * 100);
          v_dist_count := v_dist_count + 1;
        END LOOP;
      END IF;

    ELSIF v_method = 'quantity' THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
      FROM receipt_items WHERE receipt_id = v_link.receipt_id;
      IF v_total_qty > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_link.receipt_id ORDER BY id LOOP
          INSERT INTO service_cost_distributions
            (service_id, receipt_id, receipt_item_id, product_id, distribution_amount, distribution_percentage)
          VALUES
            (p_service_id, v_link.receipt_id, v_item.id, v_item.product_id,
             v_allocated * (v_item.quantity / v_total_qty),
             (v_item.quantity / v_total_qty) * 100);
          v_dist_count := v_dist_count + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Forzar recalculo de WAC para cada producto afectado
  UPDATE receipt_items SET updated_at = NOW()
  WHERE product_id IN (SELECT DISTINCT product_id FROM service_cost_distributions WHERE service_id = p_service_id);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_COST_DISTRIBUTED', 'received_services', p_service_id,
    jsonb_build_object('distributed_rows', v_dist_count, 'method', v_method));

  RETURN jsonb_build_object('status', 'success', 'distributed_rows', v_dist_count);
END;
$function$


-- @contract-function name=duplicate_inventory_adjustment args="p_original_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_orig.store_id) THEN
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


-- @contract-function name=duplicate_inventory_adjustment_v2 args="p_original_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_new_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
BEGIN
  -- 1. SELECT FOR UPDATE original
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND';
  END IF;

  -- 2. Autorización (patrón canónico v2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. INSERT new adjustment
  --    PR-4.3.1 Fix: usar 'reason' (enum) en vez de 'adjustment_type' (inexistente)
  --    No incluir 'updated_at' (no existe en inventory_adjustments)
  --    No incluir 'difference' (es GENERATED en inventory_adjustment_items)
  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_new_id, v_original.store_id, 'confirmed',
    v_original.reason,
    v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  -- 4. FOR each item: copy + register_stock_movement (NO INSERT directo a kardex)
  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_original_id
  LOOP
    -- PR-4.3.1 Fix: usar expected_quantity, counted_quantity (no expected_qty, counted_qty)
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);

    IF v_diff = 0 THEN
      CONTINUE;
    END IF;

    -- PR-4.3.1 Fix: no incluir difference en el INSERT (es GENERATED)
    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity
    );

    -- register_stock_movement genera stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_new_id,
      p_unit_cost := 0,
      p_reason := 'Duplicación de ajuste'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement genera la kardex con
    -- movement_type='adjustment'
  END LOOP;

  -- 5. Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ADJUSTMENT_DUPLICATED_V2', 'inventory_adjustments', v_new_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('original_id', p_original_id, 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','new_adjustment_id',v_new_id);
END;
$function$


-- @contract-function name=ensure_fiscal_period args="p_store_id uuid, p_year integer, p_month integer" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.fiscal_closings
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    IF v_id IS NULL THEN
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status)
        VALUES (p_store_id, p_year, p_month, 'open')
        ON CONFLICT (store_id, period_year, period_month) DO NOTHING
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$function$


-- @contract-function name=fn_log_system_health args="p_payload jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.fn_log_system_health(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id uuid;
    v_status text;
    v_priority text;
BEGIN
    -- Validate required fields
    IF p_payload->>'view_name' IS NULL OR p_payload->>'view_name' = '' THEN
        RAISE EXCEPTION 'view_name is required';
    END IF;

    IF p_payload->>'description' IS NULL OR p_payload->>'description' = '' THEN
        RAISE EXCEPTION 'description is required';
    END IF;

    v_status := p_payload->>'status';
    IF v_status NOT IN ('ok', 'warning', 'error', 'critical') THEN
        RAISE EXCEPTION 'Invalid status: %', v_status;
    END IF;

    v_priority := p_payload->>'priority';
    IF v_priority NOT IN ('low', 'medium', 'high') THEN
        RAISE EXCEPTION 'Invalid priority: %', v_priority;
    END IF;

    -- Insert log
    INSERT INTO public.system_health_logs (
        view_name,
        tool_name,
        status,
        description,
        suggestion,
        screenshot_url,
        context,
        priority
    ) VALUES (
        p_payload->>'view_name',
        p_payload->>'tool_name',
        v_status,
        p_payload->>'description',
        p_payload->>'suggestion',
        p_payload->>'screenshot_url',
        COALESCE((p_payload->'context'), '{}'::jsonb),
        v_priority
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$


-- @contract-function name=fn_recalc_wac args="p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb DEFAULT NULL::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_S        numeric;
  v_ca_prev  numeric;
  v_ca_new   numeric;
BEGIN
  IF p_store_id IS NULL OR p_product_id IS NULL OR p_event IS NULL THEN
    RAISE EXCEPTION 'ERR_WAC_RECALC_ARGS: store/product/event obligatorios';
  END IF;

  SELECT stock_current, cost_average
  INTO v_S, v_ca_prev
  FROM products
  WHERE id = p_product_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: % store %', p_product_id, p_store_id;
  END IF;

  v_S := COALESCE(v_S, 0);
  v_ca_prev := COALESCE(v_ca_prev, 0);

  IF p_qty_in IS NULL OR p_qty_in = 0 THEN
    -- Salida pura / devolución A1 / evento neutro: WAC INVARIANTE
    v_ca_new := v_ca_prev;
  ELSIF p_qty_in > 0 THEN
    -- Entrada: blend canónico D-01: ca_new = (S·ca_prev + q·uc) / (S+q)
    v_ca_new := (v_S * v_ca_prev + p_qty_in * COALESCE(p_uc_in, 0)) / (v_S + p_qty_in);
  ELSE
    -- Reversa de entrada (q<0): inversa exacta del blend; exige S+q > 0
    IF v_S + p_qty_in <= 0 THEN
      RAISE EXCEPTION 'ERR_WAC_REVERSE_NEGATIVE_STOCK: S=% q=%', v_S, p_qty_in;
    END IF;
    v_ca_new := (v_S * v_ca_prev + p_qty_in * COALESCE(p_uc_in, 0)) / (v_S + p_qty_in);
  END IF;

  -- Token de escritor: válido SOLO durante este UPDATE (re-sellado tras él)
  SET LOCAL app.wac_writer = 'fn_recalc_wac';
  UPDATE products
     SET cost_average = v_ca_new, updated_at = now()
   WHERE id = p_product_id AND store_id = p_store_id;
  SET LOCAL app.wac_writer = '';

  INSERT INTO public.wac_change_log
    (store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, changed_by)
  VALUES
    (p_store_id, p_product_id, v_ca_prev, v_ca_new, p_event, p_qty_in, p_uc_in,
     p_source_ref, auth.uid());

  RETURN v_ca_new;
END $function$


-- @contract-function name=fn_sync_inventory_on_movement args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_qty numeric;
  v_exists boolean;
  v_product_store_id uuid;
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- FIX H-01: Validar que el producto existe y su store_id coincide
  SELECT store_id INTO v_product_store_id FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: Producto % no existe', NEW.product_id;
  END IF;
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: store_id es NULL para el producto %', NEW.product_id;
  END IF;
  IF v_product_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: products.store_id es NULL para el producto %', NEW.product_id;
  END IF;
  IF NEW.store_id IS DISTINCT FROM v_product_store_id THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: movement store_id % no coincide con product store_id % para el producto %',
      NEW.store_id, v_product_store_id, NEW.product_id;
  END IF;

  -- Check if inventory record exists for this product+store
  SELECT EXISTS(
    SELECT 1 FROM public.inventory
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- inventory no existe → base = 0
    v_new_qty := NEW.quantity_change;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: No hay inventario para el producto % en tienda %. No se puede registrar una salida.', NEW.product_id, NEW.store_id;
    END IF;

    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, v_new_qty, 1, now())
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.inventory
    SET quantity = public.inventory.quantity + NEW.quantity_change,
        version = public.inventory.version + 1,
        updated_at = now()
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
    RETURNING quantity INTO v_new_qty;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: El stock no puede ser negativo para el producto % (Resultado: %)', NEW.product_id, v_new_qty;
    END IF;
  END IF;

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$function$


-- @contract-function name=fn_void_receipt args="p_receipt_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_rec record;
    v_item record;
    v_sale_after_count int;
    v_current_stock int;
    v_new_stock int;
BEGIN
    -- 1. Get Receipt
    SELECT * INTO v_rec FROM public.receipts WHERE id = p_receipt_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;
    IF v_rec.status = 'voided' THEN RAISE EXCEPTION 'Recepción ya anulada'; END IF;

    -- 2. Check for subsequent SALES for these products that might compromise stock
    -- Simple check: If any stock movement of type 'OUT_SALE' exists for these products AFTER receipt creation
    -- Ideally we should check if reversing this makes stock negative.
    
    FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id
    LOOP
        -- Check current stock
        SELECT stock_current INTO v_current_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        
        v_new_stock := v_current_stock - v_item.quantity;
        
        IF v_new_stock < 0 THEN
            RAISE EXCEPTION 'No se puede anular: El stock actual (%) es menor a la cantidad a revertir (%) para producto %', v_current_stock, v_item.quantity, v_item.product_id;
        END IF;

        -- Revert Stock
        UPDATE public.products SET stock_current = v_new_stock WHERE id = v_item.product_id;

        -- Log Reverse Movement
        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_item.product_id, 'VOID_RECEIPT', -v_item.quantity, p_receipt_id, p_user_id, v_new_stock);
    END LOOP;

    -- 3. Mark Void
    UPDATE public.receipts SET status = 'voided' WHERE id = p_receipt_id;

    -- 4. Audit
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, metadata)
    VALUES (p_user_id, 'receipts', p_receipt_id, 'VOID', jsonb_build_object('reason', 'User requested void'));

    RETURN true;
END;
$function$


-- @contract-function name=generate_adjustments_from_physical_inventory args="p_pi_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_adjustments_from_physical_inventory(p_pi_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_line RECORD;
  v_adj_id UUID;
  v_expected NUMERIC;
  v_short_count INT := 0;
  v_surplus_count INT := 0;
  v_adj_short_id UUID;
  v_adj_surplus_id UUID;
  v_current_stock NUMERIC;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'pending_authorization' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING_AUTHORIZATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_GENERATE_ADJUSTMENTS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.physical_inventory_adjustments WHERE pi_id = p_pi_id) THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENTS_ALREADY_GENERATED';
  END IF;

  -- 3.9.a Documento de FALTANTES (salida por STOCKTAKE_SHRINKAGE)
  FOR v_line IN
    SELECT i.*, p.sku, p.name
    FROM public.physical_inventory_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.pi_id = p_pi_id
      AND i.counted_qty IS NOT NULL
      AND COALESCE(i.counted_qty, 0) < i.theoretical_qty
    ORDER BY i.line_number
  LOOP
    SELECT COALESCE(inv.quantity, 0) INTO v_current_stock
    FROM public.inventory inv
    WHERE inv.product_id = v_line.product_id AND inv.store_id = v_pi.store_id
    FOR UPDATE;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    IF v_adj_short_id IS NULL THEN
      INSERT INTO public.inventory_adjustments (
        store_id, created_by, status, reason, notes, source_physical_inventory_id
      ) VALUES (
        v_pi.store_id, v_caller_uid, 'pending', 'STOCKTAKE_SHRINKAGE',
        'Faltantes del inventario físico ' || v_pi.pi_number, p_pi_id
      ) RETURNING id INTO v_adj_short_id;
    END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_adj_short_id, v_line.product_id, v_current_stock, v_line.counted_qty
    );
    v_short_count := v_short_count + 1;
  END LOOP;

  -- 3.9.b Documento de SOBRANTES (entrada por STOCKTAKE_SURPLUS)
  FOR v_line IN
    SELECT i.*, p.sku, p.name
    FROM public.physical_inventory_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.pi_id = p_pi_id
      AND i.counted_qty IS NOT NULL
      AND COALESCE(i.counted_qty, 0) > i.theoretical_qty
    ORDER BY i.line_number
  LOOP
    SELECT COALESCE(inv.quantity, 0) INTO v_current_stock
    FROM public.inventory inv
    WHERE inv.product_id = v_line.product_id AND inv.store_id = v_pi.store_id
    FOR UPDATE;
    IF v_current_stock IS NULL THEN v_current_stock := 0; END IF;

    IF v_adj_surplus_id IS NULL THEN
      INSERT INTO public.inventory_adjustments (
        store_id, created_by, status, reason, notes, source_physical_inventory_id
      ) VALUES (
        v_pi.store_id, v_caller_uid, 'pending', 'STOCKTAKE_SURPLUS',
        'Sobrantes del inventario físico ' || v_pi.pi_number, p_pi_id
      ) RETURNING id INTO v_adj_surplus_id;
    END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_adj_surplus_id, v_line.product_id, v_current_stock, v_line.counted_qty
    );
    v_surplus_count := v_surplus_count + 1;
  END LOOP;

  -- 3.9.c Vínculos PI ↔ documentos + conciliación del inventario
  IF v_adj_short_id IS NOT NULL THEN
    INSERT INTO public.physical_inventory_adjustments (pi_id, adjustment_id, kind, items_count, generated_by)
    VALUES (p_pi_id, v_adj_short_id, 'shortfall', v_short_count, v_caller_uid);
  END IF;
  IF v_adj_surplus_id IS NOT NULL THEN
    INSERT INTO public.physical_inventory_adjustments (pi_id, adjustment_id, kind, items_count, generated_by)
    VALUES (p_pi_id, v_adj_surplus_id, 'surplus', v_surplus_count, v_caller_uid);
  END IF;

  UPDATE public.physical_inventories
    SET status = 'conciliated', authorized_at = NOW(), authorized_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_ADJUSTMENTS_GENERATED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number,
                             'shortfall_adjustment_id', v_adj_short_id,
                             'shortfall_items', v_short_count,
                             'surplus_adjustment_id', v_adj_surplus_id,
                             'surplus_items', v_surplus_count), v_pi.store_id);

  RETURN jsonb_build_object(
    'status', 'success', 'pi_id', p_pi_id, 'new_status', 'conciliated',
    'shortfall_adjustment_id', v_adj_short_id, 'shortfall_items', v_short_count,
    'surplus_adjustment_id', v_adj_surplus_id, 'surplus_items', v_surplus_count
  );
END;
$function$


-- @contract-function name=generate_bulk_confirmation_token args="p_store_ids uuid[], p_action text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
  v_has_protected BOOLEAN;
  v_caller_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede generar tokens bulk';
    END IF;
    -- Verificar que p_user_id coincide con auth.uid()
    IF p_user_id != auth.uid() THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: p_user_id debe coincidir con el usuario autenticado';
    END IF;
  END IF;

  IF p_action NOT IN ('delete', 'archive') THEN
    RAISE EXCEPTION 'ERR_NON_DESTRUCTIVE_ACTION';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  v_token := 'bct_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at, metadata
  ) VALUES (
    v_token, p_store_ids, p_action, p_user_id,
    NOW() + INTERVAL '10 minutes',
    jsonb_build_object('has_protected_stores', v_has_protected)
  );

  RETURN v_token;
END;
$function$


-- @contract-function name=generate_bulk_override_token args="p_confirmation_token text, p_override_user_id uuid, p_reason text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original RECORD;
  v_override_token TEXT;
  v_override_user_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin, y debe ser auth.uid() == p_override_user_id
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() != p_override_user_id THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: p_override_user_id debe coincidir con el usuario autenticado';
    END IF;

    SELECT role INTO v_override_user_role FROM public.profiles WHERE id = p_override_user_id;
    IF v_override_user_role IS NULL OR v_override_user_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede generar override';
    END IF;
  END IF;

  SELECT * INTO v_original
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND consumed_at IS NULL
    AND expires_at > NOW()
    AND is_override = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_OR_EXPIRED_TOKEN';
  END IF;

  IF v_original.created_by = p_override_user_id THEN
    RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.bulk_confirmation_tokens
    WHERE override_for = p_confirmation_token
      AND consumed_at IS NULL AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'ERR_OVERRIDE_ALREADY_EXISTS';
  END IF;

  v_override_token := 'bot_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at,
    is_override, override_for, metadata
  ) VALUES (
    v_override_token, v_original.store_ids, v_original.action, p_override_user_id,
    NOW() + INTERVAL '10 minutes', true, p_confirmation_token,
    jsonb_build_object('override_reason', p_reason,
      'original_created_by', v_original.created_by,
      'override_created_by', p_override_user_id)
  );

  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_override_token_generated', 'stores', NULL,
    jsonb_build_object('confirmation_token', p_confirmation_token,
      'store_ids', v_original.store_ids,
      'override_by', p_override_user_id,
      'original_by', v_original.created_by, 'reason', p_reason)
  );

  RETURN v_override_token;
END;
$function$


-- @contract-function name=generate_confirmation_token args="p_session_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_confirmation_token(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
  v_store_id UUID;
  v_preview_passed BOOLEAN;
BEGIN
  -- Verify session exists, is in DRY_RUN status, and preview passed
  SELECT store_id, preview_passed INTO v_store_id, v_preview_passed
  FROM public.restore_sessions
  WHERE id = p_session_id AND status = 'DRY_RUN';

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SESSION_NOT_FOUND: Sesión % no existe o no está en estado DRY_RUN', p_session_id;
  END IF;

  IF NOT v_preview_passed THEN
    RAISE EXCEPTION 'ERR_PREVIEW_NOT_PASSED: Preview falló. Corrige los errores antes de generar el token.';
  END IF;

  -- Generate random token (using gen_random_uuid for cryptographic randomness)
  v_token := 'rst_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.restore_sessions
  SET confirmation_token = v_token
  WHERE id = p_session_id;

  RETURN v_token;
END;
$function$


-- @contract-function name=generate_inventory_snapshot args="p_store_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.generate_inventory_snapshot(p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    INSERT INTO public.inventory_snapshots (store_id, product_id, quantity, snapshot_date)
    SELECT store_id, product_id, quantity, now() FROM public.inventory WHERE store_id = p_store_id;
END;
$function$


-- @contract-function name=increment_user_usage args="p_user_id uuid, p_action_type text, p_limit integer" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check current count
    SELECT count INTO v_count
    FROM user_usage
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND usage_date = CURRENT_DATE;

    IF v_count IS NULL THEN
        -- First action of the day
        INSERT INTO user_usage (user_id, action_type, usage_date, count)
        VALUES (p_user_id, p_action_type, CURRENT_DATE, 1);
        RETURN TRUE;
    ELSIF v_count < p_limit OR p_limit < 0 THEN
        -- Under limit or unlimited (-1)
        UPDATE user_usage
        SET count = count + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id
          AND action_type = p_action_type
          AND usage_date = CURRENT_DATE;
        RETURN TRUE;
    ELSE
        -- Limit reached
        RETURN FALSE;
    END IF;
END;
$function$


-- @contract-function name=link_receipts_to_service args="p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_receipt_id uuid;
  v_count integer := 0;
  v_allocated_per_receipt numeric;
  v_total_receipts integer;
  v_service_total numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, total_amount INTO v_store_id, v_status, v_service_total
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  -- FIX D1: autorización del ACTOR sobre la tienda REAL del servicio.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_ACTIVE: cannot link to % service', v_status;
  END IF;

  IF p_receipt_ids IS NULL OR jsonb_array_length(p_receipt_ids) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_RECEIPT_IDS';
  END IF;

  v_total_receipts := jsonb_array_length(p_receipt_ids);
  v_allocated_per_receipt := v_service_total / v_total_receipts;

  FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM receipts
      WHERE id = v_receipt_id AND store_id = v_store_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
    END IF;
  END LOOP;

  FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) ORDER BY value LOOP
    INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
    VALUES (p_service_id, v_receipt_id, 100.0 / v_total_receipts, v_allocated_per_receipt);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_LINKED', 'received_services', p_service_id,
    jsonb_build_object('receipt_ids_linked', v_count, 'receipt_ids', p_receipt_ids));

  RETURN jsonb_build_object('status', 'success', 'links_created', v_count);
END;
$function$


-- @contract-function name=lock_fiscal_period args="p_store_id uuid, p_year integer, p_month integer, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    -- Patrón canónico anti-spoofing v2_12_9: bajo service_role la identidad la
    -- provee el código servidor (route.ts ← sesión NextAuth); bajo authenticated,
    -- el JWT del propio usuario. Nunca confianza en identidad enviada por cliente.
    v_admin_id UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional para que la auditoría
    -- por trigger (audit_fiscal_closings_changes → auth.uid()) registre el ACTOR
    -- real también en la vía HTTP service_role (canónico del codebase:
    -- CREATE_SALE_V2 audit 100% con actor). Valor SOLO server-side; local a la txn.
    IF v_admin_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_ADMIN_ONLY: Solo admin puede bloquear periodos fiscales';
    END IF;

    UPDATE public.fiscal_closings
    SET status = 'locked', locked_by = v_admin_id, locked_at = now(), updated_at = now()
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month AND status = 'closed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_CLOSED: El periodo debe estar cerrado antes de bloquearse';
    END IF;

    RETURN jsonb_build_object('status', 'success', 'message', 'Periodo bloqueado');
END;
$function$


-- @contract-function name=log_audit_event args="p_action text, p_payload jsonb, p_store_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_prev_hash TEXT;
    v_payload_hash TEXT;
    v_event_hash TEXT;
    v_event_id UUID;
    v_tenant_id UUID;
    v_role TEXT;
    v_timestamp TIMESTAMPTZ;
    v_ts_str TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(20240325);
    v_timestamp := (now() AT TIME ZONE 'utc');
    v_ts_str := to_char(v_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    SELECT tenant_id, role::text INTO v_tenant_id, v_role FROM public.profiles WHERE id = auth.uid();
    -- Use seq_id for deterministic last record
    SELECT event_hash INTO v_prev_hash FROM public.audit_events ORDER BY seq_id DESC LIMIT 1;
    v_payload_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
    v_event_hash := encode(extensions.digest(v_payload_hash || COALESCE(v_prev_hash, '') || v_ts_str, 'sha256'), 'hex');
    INSERT INTO public.audit_events (actor_id, role, tenant_id, store_id, action, payload_hash, previous_event_hash, event_hash, utc_timestamp)
    VALUES (auth.uid(), v_role, v_tenant_id, p_store_id, p_action, v_payload_hash, v_prev_hash, v_event_hash, v_timestamp)
    RETURNING id INTO v_event_id;
    RETURN v_event_id;
END;
$function$


-- @contract-function name=log_transaction_changes args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.log_transaction_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        -- Handle different user column names
        IF TG_TABLE_NAME = 'transactions' THEN
            v_user_id := NEW.seller_id;
        ELSIF TG_TABLE_NAME = 'receipts' THEN
            v_user_id := NEW.user_id;
        END IF;

        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
        VALUES (
            COALESCE(auth.uid(), v_user_id), 
            'UPDATE_STATUS', 
            TG_TABLE_NAME, 
            NEW.id, 
            jsonb_build_object('old', OLD.status), 
            jsonb_build_object('new', NEW.status),
            NEW.store_id
        );
    END IF;
    RETURN NEW;
END;
$function$


-- @contract-function name=manage_user_memberships args="p_user_id uuid, p_memberships jsonb" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.manage_user_memberships(p_user_id uuid, p_memberships jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    m JSONB;
    v_caller_role text;
BEGIN
    -- SECURITY CHECK: Use helper to get role safely
    v_caller_role := public.get_my_role();

    IF v_caller_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can manage user memberships.';
    END IF;

    -- Replacement logic
    IF v_caller_role = 'admin' THEN
        -- Admins can replace all memberships
        DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    ELSE
        -- Encargados can only replace memberships for stores they manage
        DELETE FROM public.user_store_memberships
        WHERE user_id = p_user_id
        AND store_id IN (
            SELECT store_id FROM public.user_store_memberships
            WHERE user_id = auth.uid()
              AND role IN ('encargado', 'manager')
              AND status = 'active'
        );
    END IF;

    -- Insert new/updated memberships
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            -- Basic validation: Ensure store_id is not null/empty
            IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
                -- If not admin, check if they are manager of this store
                IF v_caller_role = 'admin' OR public.is_store_manager((m->>'store_id')::UUID) THEN
                    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
                    VALUES (
                        p_user_id,
                        (m->>'store_id')::UUID,
                        (m->>'role')::public.user_role,
                        COALESCE((m->>'status')::public.membership_status, 'active')
                    )
                    ON CONFLICT (user_id, store_id) DO UPDATE SET 
                        role = EXCLUDED.role,
                        status = EXCLUDED.status,
                        updated_at = now();
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Ensure active_store_id is still valid for the user
    UPDATE public.profiles
    SET active_store_id = (
        SELECT store_id FROM public.user_store_memberships
        WHERE user_id = p_user_id AND status = 'active' LIMIT 1
    )
    WHERE id = p_user_id
    AND (
        active_store_id NOT IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = p_user_id AND status = 'active')
        OR active_store_id IS NULL
    );
END;
$function$


-- @contract-function name=managed_create_store args="p_name text, p_address text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_create_store(p_name text, p_address text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_store_id uuid;
    v_role user_role;
BEGIN
    -- 🛡️ RBAC Check: Only admins or specifically empowered roles can create stores.
    -- (The existing trigger enforce_encargado_store_limit might allow it, but let's be explicit here)
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    
    IF v_role IS NULL OR v_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Insufficient permissions to create a store.';
    END IF;

    INSERT INTO public.stores (name, address, created_by)
    VALUES (p_name, p_address, auth.uid())
    RETURNING id INTO v_store_id;

    RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'message', 'Store created');
END;
$function$


-- @contract-function name=managed_create_user args="p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_role_id UUID;
    v_role_enum user_role;
    v_role_name TEXT;
    v_user_id UUID;
    v_active_store_id UUID;
    v_creator_role user_role;
    v_auth_uid uuid := auth.uid();
    m JSONB;
BEGIN
    -- 🛡️ identity Verification
    IF p_creator_id IS NOT NULL AND p_creator_id != v_auth_uid THEN
         RAISE EXCEPTION 'ERR_UNAUTHORIZED: Creator ID mismatch.';
    END IF;

    -- 🛡️ RBAC Check
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_auth_uid;
    IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    -- Normalize Role Name
    v_role_name := lower(p_role);
    IF v_role_name IN ('cajero', 'clerk') THEN v_role_enum := 'clerk'::user_role;
    ELSIF v_role_name IN ('almacenero', 'warehouse') THEN v_role_enum := 'warehouse'::user_role;
    ELSIF v_role_name IN ('encargado', 'manager') THEN v_role_enum := 'encargado'::user_role;
    ELSIF v_role_name IN ('admin') THEN v_role_enum := 'admin'::user_role;
    ELSE v_role_enum := 'costo'::user_role;
    END IF;

    -- 🛡️ ROLE HIERARCHY CHECK (CRITICAL FIX)
    IF v_role_enum = 'admin' AND v_creator_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can create other admins.';
    END IF;

    -- Get Role ID from table
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = lower(v_role_enum::text) LIMIT 1;
    
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id FROM public.roles WHERE name = 'costo' LIMIT 1;
        v_role_enum := 'costo'::user_role;
    END IF;

    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    -- Determine initial active_store_id
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
    ELSE
        v_active_store_id := p_store_id;
    END IF;

    -- Create or update profile
    INSERT INTO public.profiles (
        id, email, full_name, role, role_id, active_store_id, is_active, max_stores_limit, max_users_limit, created_by
    ) VALUES (
        v_user_id, p_email, p_full_name, v_role_enum, v_role_id, v_active_store_id, true, p_max_stores, p_max_users, v_auth_uid
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        role_id = EXCLUDED.role_id,
        active_store_id = EXCLUDED.active_store_id,
        is_active = EXCLUDED.is_active,
        max_stores_limit = EXCLUDED.max_stores_limit,
        max_users_limit = EXCLUDED.max_users_limit;

    -- Handle memberships
    IF p_memberships IS NOT NULL THEN
        DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
             -- Only allow adding memberships to stores the creator has access to
             IF v_creator_role = 'admin' OR public.has_store_access((m->>'store_id')::UUID) THEN
                INSERT INTO public.user_store_memberships (user_id, store_id, role)
                VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
             END IF;
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        IF v_creator_role = 'admin' OR public.has_store_access(p_store_id) THEN
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, p_store_id, v_role_enum)
            ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$


-- @contract-function name=managed_create_user_v2 args="p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t DEFAULT 'free'::plan_t, p_store_id uuid DEFAULT NULL::uuid, p_memberships jsonb DEFAULT NULL::jsonb, p_max_stores integer DEFAULT 0, p_max_users integer DEFAULT 0, p_target_user_id uuid DEFAULT NULL::uuid, p_creator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := COALESCE(p_target_user_id, gen_random_uuid());
  v_role_id uuid;
  v_active_store_id uuid;
  m JSONB;
  v_creator_role public.user_role;
  v_creator_uid uuid := COALESCE(p_creator_id, auth.uid());
BEGIN
  -- Validar caller es admin o encargado
  SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_creator_uid;
  IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
  END IF;

  -- Validar email único (entre perfiles activos).
  -- v2_16_0: excluye el perfil del propio usuario objetivo (creado por el
  -- trigger on_auth_user_created) — la unicidad frente a OTROS usuarios se
  -- conserva.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE email = p_email
      AND deleted_at IS NULL
      AND id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'ERR_EMAIL_ALREADY_EXISTS: %', p_email;
  END IF;

  v_active_store_id := COALESCE((p_memberships->0->>'store_id')::UUID, p_store_id);

  -- Encargado solo puede crear en tiendas que gestiona
  IF v_creator_role = 'encargado' AND v_active_store_id IS NOT NULL THEN
    IF NOT public.has_store_access(v_active_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', v_active_store_id;
    END IF;
  END IF;

  -- Buscar role_id
  SELECT id INTO v_role_id FROM public.roles
    WHERE lower(name) = lower(p_role::text)
       OR (name = 'Cajero' AND p_role = 'clerk')
       OR (name = 'Almacenero' AND p_role = 'warehouse')
       OR (name = 'UserCosto' AND p_role = 'costo')
    LIMIT 1;

  -- v2_16_1 (fix/usuarios-en-desarrollo-admin): UPSERT del perfil SIN
  -- active_store_id. El trigger trigger_validate_active_store exige membership
  -- activa para roles operativos; esa membership se inserta a continuación, así
  -- que active_store_id se asigna en el UPDATE final (paso 3).
  INSERT INTO public.profiles (
    id, email, full_name, role, role_id, active_store_id, is_active,
    created_by, max_stores_limit, max_users_limit, plan, created_at, updated_at
  ) VALUES (
    v_user_id, p_email, p_full_name, p_role, v_role_id, NULL, true,
    v_creator_uid, p_max_stores, p_max_users, p_plan, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    active_store_id = NULL,
    plan = EXCLUDED.plan,
    is_active = true,
    deleted_at = NULL,
    deletion_reason = NULL,
    deleted_by = NULL,
    updated_at = now()
  RETURNING id INTO v_user_id;

  -- Procesar memberships (el perfil ya existe: FK user_id satisfecha)
  IF p_memberships IS NOT NULL THEN
    IF v_creator_role != 'admin' AND v_creator_role != 'superadmin' THEN
      DELETE FROM public.user_store_memberships
        WHERE user_id = v_user_id
        AND store_id IN (
          SELECT store_id FROM public.user_store_memberships
          WHERE user_id = v_creator_uid AND role IN ('encargado', 'manager')
        );
    ELSE
      DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
    END IF;

    FOR m IN SELECT * FROM jsonb_array_elements(p_memberships) LOOP
      IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
        IF v_creator_role IN ('admin', 'superadmin') OR public.has_store_access((m->>'store_id')::UUID) THEN
          INSERT INTO public.user_store_memberships (user_id, store_id, role)
          VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::public.user_role)
          ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
        END IF;
      END IF;
    END LOOP;
  ELSIF p_store_id IS NOT NULL THEN
    INSERT INTO public.user_store_memberships (user_id, store_id, role)
    VALUES (v_user_id, p_store_id, p_role)
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  END IF;

  -- v2_16_1 paso 3: asignar active_store_id AHORA (con memberships presentes)
  -- para que trigger_validate_active_store evalúe el estado final y no uno
  -- intermedio imposible.
  UPDATE public.profiles
  SET active_store_id = v_active_store_id, updated_at = now()
  WHERE id = v_user_id;

  -- Audit log atómico (regresión C-2 restaurada)
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
  VALUES (
    v_creator_uid, v_user_id, 'USER_CREATED',
    jsonb_build_object(
      'email', p_email, 'full_name', p_full_name, 'role', p_role::text,
      'plan', p_plan::text, 'active_store_id', v_active_store_id,
      'max_stores', p_max_stores, 'max_users', p_max_users
    ),
    jsonb_build_object('memberships_count', CASE WHEN p_memberships IS NOT NULL THEN jsonb_array_length(p_memberships) ELSE 0 END)
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$


-- @contract-function name=managed_delete_product args="p_product_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_delete_product(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_product_name text;
  v_product_tenant_id uuid;
  v_store_tenant_id uuid;
  v_has_movements boolean;
BEGIN
  SELECT p.store_id, p.name, p.tenant_id, s.tenant_id
  INTO v_store_id, v_product_name, v_product_tenant_id, v_store_tenant_id
  FROM public.products p
  LEFT JOIN public.stores s
    ON s.id = p.store_id
  WHERE p.id = p_product_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_tenant_id IS NOT NULL
     AND v_product_tenant_id IS DISTINCT FROM v_store_tenant_id THEN
    RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'Unauthorized product access' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p_product_id
    UNION ALL
    SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p_product_id
    UNION ALL
    SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p_product_id
  ) INTO v_has_movements;

  IF v_has_movements THEN
    RAISE EXCEPTION 'No se puede eliminar un producto con movimientos. Desactivelo en su lugar.';
  END IF;

  DELETE FROM public.inventory
  WHERE product_id = p_product_id
    AND store_id = v_store_id;

  DELETE FROM public.product_variants
  WHERE product_id = p_product_id;

  DELETE FROM public.products
  WHERE id = p_product_id
    AND store_id = v_store_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
  VALUES (
    auth.uid(),
    'DELETE_PRODUCT',
    'products',
    p_product_id,
    jsonb_build_object('name', v_product_name, 'store_id', v_store_id)
  );
END;
$function$


-- @contract-function name=managed_delete_user args="p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_delete_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Security Check: Allow if service role (auth.uid() is null) or if current user is admin
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Solo los administradores pueden eliminar usuarios.';
    END IF;

    -- Cannot delete self
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'ERR_CANNOT_DELETE_SELF: No puedes eliminar tu propio usuario.';
    END IF;

    -- Safety Check
    IF NOT public.can_safely_delete_user(p_user_id) THEN
        RAISE EXCEPTION 'ERR_USER_HAS_RECORDS: El usuario tiene registros operativos y no puede ser eliminado por integridad de datos. Se recomienda desactivarlo.';
    END IF;

    -- Perform deletion (Cascades to memberships and other metadata)
    -- We explicitly delete memberships first just in case
    DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    
    -- Deleting from profiles
    DELETE FROM public.profiles WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Perfil de usuario eliminado correctamente.');
END;
$function$


-- @contract-function name=managed_reset_password args="p_user_id uuid, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_reset_password(p_user_id uuid, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_target_email text;
  v_target_role public.user_role;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_RESET_BLOCKED';
  END IF;

  SELECT email, role INTO v_target_email, v_target_role
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  -- CP-ORG-001: solo otro SuperAdmin puede disparar la recuperación de la
  -- cuenta SuperAdmin de plataforma.
  IF v_target_role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'PASSWORD_RESET_REQUESTED',
    jsonb_build_object('email', v_target_email, 'method', 'recovery_link')
  );

  RETURN jsonb_build_object('success', true, 'email', v_target_email);
END;
$function$


-- @contract-function name=managed_revoke_membership args="p_membership_id uuid, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_remaining_active int;
BEGIN
  SELECT m.id, m.user_id, m.store_id, m.role, m.status
    INTO v_old
    FROM public.user_store_memberships m
    WHERE m.id = p_membership_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MEMBERSHIP_NOT_FOUND';
  END IF;

  -- FIX H-7: Autorización usa nueva sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
  IF NOT public.has_store_role(v_caller_uid, v_old.store_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only store admins can revoke memberships.';
  END IF;

  IF v_old.status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE id = p_membership_id;

  SELECT COUNT(*) INTO v_remaining_active
    FROM public.user_store_memberships
    WHERE user_id = v_old.user_id AND status = 'active';

  IF v_remaining_active = 0 THEN
    UPDATE public.profiles SET is_active = false, updated_at = now()
      WHERE id = v_old.user_id AND deleted_at IS NULL;

    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
    VALUES (
      v_caller_uid, v_old.user_id, 'USER_AUTO_DEACTIVATED',
      jsonb_build_object('reason', 'No active memberships remaining after revoke')
    );
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, v_old.user_id, 'MEMBERSHIP_REVOKED',
    jsonb_build_object('membership_id', p_membership_id, 'store_id', v_old.store_id, 'role', v_old.role::text, 'status', v_old.status),
    jsonb_build_object('status', 'revoked'),
    jsonb_build_object('store_id', v_old.store_id, 'remaining_active_memberships', v_remaining_active)
  );

  RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'remaining_active_memberships', v_remaining_active);
END;
$function$


-- @contract-function name=managed_soft_delete_user args="p_user_id uuid, p_reason text, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_active_memberships_count int;
  v_anon_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DELETE_BLOCKED';
  END IF;

  SELECT id, email, full_name, role, plan, is_active INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND_OR_ALREADY_DELETED';
  END IF;

  -- CP-ORG-001: un admin ordinario no puede dar de baja la cuenta
  -- SuperAdmin de plataforma (anonimización irreversible).
  IF v_old.role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  SELECT COUNT(*) INTO v_active_memberships_count
    FROM public.user_store_memberships
    WHERE user_id = p_user_id AND status = 'active';
  IF v_active_memberships_count > 0 THEN
    RAISE EXCEPTION 'ERR_USER_HAS_ACTIVE_MEMBERSHIPS: % active. Revoke memberships first.', v_active_memberships_count;
  END IF;

  v_anon_email := 'deleted+' || substr(p_user_id::text, 1, 8) || '@anonymized.local';

  UPDATE public.profiles SET
    deleted_at = now(),
    deletion_reason = p_reason,
    deleted_by = v_caller_uid,
    is_active = false,
    full_name = '[deleted user]',
    email = v_anon_email,
    ai_api_key = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'USER_SOFT_DELETED',
    jsonb_build_object(
      'email', v_old.email, 'full_name', v_old.full_name,
      'role', v_old.role::text, 'plan', v_old.plan::text, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'email', v_anon_email, 'full_name', '[deleted user]',
      'is_active', false, 'deleted_at', now()
    ),
    jsonb_build_object('reason', p_reason, 'memberships_revoked', v_active_memberships_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'status', 'soft_deleted',
    'note', 'auth.users preserved. API route should ban via auth.admin.updateUser.'
  );
END;
$function$


-- @contract-function name=managed_toggle_product_active args="p_product_id uuid, p_is_active boolean" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_old_active boolean;
  v_product_tenant_id uuid;
  v_store_tenant_id uuid;
BEGIN
  SELECT p.store_id, p.is_active, p.tenant_id, s.tenant_id
  INTO v_store_id, v_old_active, v_product_tenant_id, v_store_tenant_id
  FROM public.products p
  LEFT JOIN public.stores s
    ON s.id = p.store_id
  WHERE p.id = p_product_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_tenant_id IS NOT NULL
     AND v_product_tenant_id IS DISTINCT FROM v_store_tenant_id THEN
    RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'Unauthorized product access' USING ERRCODE = '42501';
  END IF;

  UPDATE public.products
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_product_id
    AND store_id = v_store_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'ACTIVATE_PRODUCT' ELSE 'DEACTIVATE_PRODUCT' END,
    'products',
    p_product_id,
    jsonb_build_object('is_active', v_old_active, 'store_id', v_store_id),
    jsonb_build_object('is_active', p_is_active, 'store_id', v_store_id)
  );
END;
$function$


-- @contract-function name=managed_toggle_user_status args="p_user_id uuid, p_is_active boolean, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin', 'encargado', 'manager') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED';
  END IF;

  SELECT id, is_active, full_name, role INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  -- CP-ORG-001: la cuenta SuperAdmin de plataforma solo puede ser
  -- activada/desactivada por otro SuperAdmin (evita el bloqueo de la
  -- administración global por un admin/encargado ordinario).
  IF v_old.role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  IF v_old.is_active = p_is_active THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values)
  VALUES (
    v_caller_uid, p_user_id,
    CASE WHEN p_is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    jsonb_build_object('is_active', v_old.is_active),
    jsonb_build_object('is_active', p_is_active)
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$function$


-- @contract-function name=managed_update_membership args="p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_update_membership(p_membership_id uuid, p_role user_role DEFAULT NULL::user_role, p_status text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT m.id, m.user_id, m.store_id, m.role, m.status
    INTO v_old
    FROM public.user_store_memberships m
    WHERE m.id = p_membership_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MEMBERSHIP_NOT_FOUND';
  END IF;

  -- FIX H-7: Autorización usa nueva sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
  -- service_role (API route) pasa p_caller_id=session.user.id → verifica acceso de ese user
  -- authenticated pasa p_caller_id=NULL → v_caller_uid=auth.uid() → verifica su propio acceso
  IF NOT public.has_store_role(v_caller_uid, v_old.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin or manager of the store.';
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.user_store_memberships SET role = p_role, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> v_old.status::text THEN
    IF p_status NOT IN ('active', 'revoked') THEN
      RAISE EXCEPTION 'ERR_INVALID_STATUS: %', p_status;
    END IF;
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_status));
    UPDATE public.user_store_memberships SET status = p_status::membership_status, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, v_old.user_id, 'MEMBERSHIP_UPDATED',
      jsonb_build_object('membership_id', p_membership_id, 'store_id', v_old.store_id, 'role', v_old.role::text, 'status', v_old.status),
      v_changes,
      jsonb_build_object('store_id', v_old.store_id)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'changes', v_changes);
END;
$function$


-- @contract-function name=managed_update_tenant_plan args="p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing — service_role (Stripe webhook) puede pasar NULL caller_id
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_old_plan plan_t;
  v_old_status text;
  v_role public.user_role;
BEGIN
  -- Validación: si caller_uid es NULL (service_role anónimo para Stripe webhook), permitir
  -- Si caller_uid NO es NULL, debe ser admin/superadmin
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_uid;
    IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can change tenant plan';
    END IF;
  END IF;

  SELECT plan, subscription_status INTO v_old_plan, v_old_status
    FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TENANT_NOT_FOUND: %', p_tenant_id;
  END IF;

  UPDATE public.tenants SET
    plan = p_plan,
    subscription_status = COALESCE(p_subscription_status, subscription_status),
    updated_at = now()
  WHERE id = p_tenant_id;

  UPDATE public.profiles SET
    plan = p_plan,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, NULL, 'TENANT_PLAN_UPDATED',
    jsonb_build_object('old_plan', v_old_plan::text, 'old_status', v_old_status),
    jsonb_build_object('new_plan', p_plan::text, 'new_status', COALESCE(p_subscription_status, v_old_status)),
    jsonb_build_object('tenant_id', p_tenant_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'old_plan', v_old_plan::text,
    'new_plan', p_plan::text
  );
END;
$function$


-- @contract-function name=managed_update_user args="p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.managed_update_user(p_user_id uuid, p_full_name text DEFAULT NULL::text, p_role user_role DEFAULT NULL::user_role, p_role_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT NULL::boolean, p_max_stores_limit integer DEFAULT NULL::integer, p_max_users_limit integer DEFAULT NULL::integer, p_plan plan_t DEFAULT NULL::plan_t, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing — service_role puede pasar p_caller_id explícito
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Validar caller es admin (usa v_caller_uid que ahora NO es spoofable para authenticated)
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can update users.';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND: %', p_user_id;
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED: Cannot deactivate own account.';
  END IF;

  -- CP-ORG-001: la cuenta SuperAdmin de plataforma (CUALQUIER campo) solo
  -- puede modificarse por otro SuperAdmin — coherente con toggle/baja/reset.
  IF v_old.role = 'superadmin' AND v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'ERR_PLATFORM_ACCOUNT_PROTECTED: la cuenta SuperAdmin solo puede gestionarla otro SuperAdmin';
  END IF;

  -- CP-ORG-001: roles de plataforma — el cambio de rol 'superadmin'
  -- (en cualquier dirección) queda reservado a un SuperAdmin, y nadie
  -- puede cambiar su PROPIO rol.
  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    IF p_user_id = v_caller_uid THEN
      RAISE EXCEPTION 'ERR_SELF_ROLE_CHANGE: Cannot change your own role via this RPC.';
    END IF;
    IF (p_role = 'superadmin' OR v_old.role = 'superadmin')
       AND v_caller_role <> 'superadmin' THEN
      RAISE EXCEPTION 'ERR_PLATFORM_ROLE: Only a SuperAdmin can grant or revoke the platform role superadmin.';
    END IF;
  END IF;

  IF p_full_name IS NOT NULL AND p_full_name <> v_old.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('old', v_old.full_name, 'new', p_full_name));
    UPDATE public.profiles SET full_name = p_full_name, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role_id IS NOT NULL AND (v_old.role_id IS NULL OR p_role_id <> v_old.role_id) THEN
    v_changes := v_changes || jsonb_build_object('role_id', jsonb_build_object('old', v_old.role_id, 'new', p_role_id));
    UPDATE public.profiles SET role_id = p_role_id, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_is_active IS NOT NULL AND p_is_active <> v_old.is_active THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('old', v_old.is_active, 'new', p_is_active));
    UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_stores_limit IS NOT NULL AND (v_old.max_stores_limit IS NULL OR p_max_stores_limit <> v_old.max_stores_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_stores_limit', jsonb_build_object('old', v_old.max_stores_limit, 'new', p_max_stores_limit));
    UPDATE public.profiles SET max_stores_limit = p_max_stores_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_users_limit IS NOT NULL AND (v_old.max_users_limit IS NULL OR p_max_users_limit <> v_old.max_users_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_users_limit', jsonb_build_object('old', v_old.max_users_limit, 'new', p_max_users_limit));
    UPDATE public.profiles SET max_users_limit = p_max_users_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_plan IS NOT NULL AND p_plan <> v_old.plan THEN
    v_changes := v_changes || jsonb_build_object('plan', jsonb_build_object('old', v_old.plan::text, 'new', p_plan::text));
    UPDATE public.profiles SET plan = p_plan, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, p_user_id, 'USER_UPDATED',
      jsonb_build_object(
        'full_name', v_old.full_name, 'role', v_old.role::text,
        'is_active', v_old.is_active, 'plan', v_old.plan::text
      ),
      v_changes,
      jsonb_build_object('fields_changed', jsonb_object_keys(v_changes))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'changes', v_changes);
END;
$function$


-- @contract-function name=mark_expired_lots args="p_store_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.mark_expired_lots(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.product_lots
    SET status = 'expired', updated_at = now()
    WHERE expiration_date IS NOT NULL
      AND expiration_date < CURRENT_DATE
      AND status = 'active'
      AND (p_store_id IS NULL OR store_id = p_store_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$


-- @contract-function name=next_document_number args="p_store_id uuid, p_document_type text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.next_document_number(p_store_id uuid, p_document_type text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  -- SELECT FOR UPDATE para atomicidad (dos usuarios concurrentes jamás
  -- obtienen el mismo número: la serialización ocurre dentro de la transacción
  -- del RPC creador, que además toma advisory lock por tienda).
  SELECT last_number INTO v_last
    FROM public.document_sequences
    WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
    FOR UPDATE;

  IF v_last IS NULL THEN
    -- Primera vez: INSERT
    INSERT INTO public.document_sequences (store_id, document_type, year, last_number)
    VALUES (p_store_id, p_document_type, v_year, 1)
    ON CONFLICT (store_id, document_type, year) DO NOTHING
    RETURNING last_number INTO v_next;

    -- Si ON CONFLICT disparó (race condition), re-select
    IF v_next IS NULL THEN
      SELECT last_number INTO v_last
        FROM public.document_sequences
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
        FOR UPDATE;
      v_next := v_last + 1;
      UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
    END IF;
  ELSE
    -- Ya existe: incrementar
    v_next := v_last + 1;
    UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
      WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
  END IF;

  v_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'FAC'
    WHEN 'credit_note' THEN 'NC'
    WHEN 'quotation' THEN 'COT'
    WHEN 'z_report' THEN 'ZR'
    WHEN 'vale_salida' THEN 'VS'
    WHEN 'cash_flow' THEN 'IE'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$


-- @contract-function name=on_auth_user_created args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role_id UUID;
  v_role_enum USER_ROLE;
  v_metadata_role TEXT;
  v_company_name TEXT;
  v_full_name TEXT;
  v_tenant_id UUID;
BEGIN
  -- Extract role from metadata if present
  v_metadata_role := NEW.raw_user_meta_data->>'role';

  -- Normalize and convert to enum
  IF v_metadata_role IS NOT NULL THEN
    BEGIN
      v_role_enum := v_metadata_role::USER_ROLE;
    EXCEPTION WHEN OTHERS THEN
      v_role_enum := 'tenant_admin'::USER_ROLE;
    END;
  ELSE
    -- Iteración 13: self-signup users are tenant_admin by default
    v_role_enum := 'tenant_admin'::USER_ROLE;
  END IF;

  -- Extract company_name and full_name from metadata
  v_company_name := NEW.raw_user_meta_data->>'company_name';
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Iteración 13: Create tenant for self-signup users
  -- If user was created by admin (via managed_create_user_v2), they may already
  -- have a tenant_id set via p_target_user_id. In that case, skip tenant creation.
  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.tenants (name, owner_id, plan, subscription_status, trial_ends_at, is_active)
    VALUES (
      v_company_name,
      NEW.id,
      'free'::plan_t,
      'trial',
      now() + interval '14 days',
      true
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Get matching role_id from public.roles
  SELECT id INTO v_role_id FROM public.roles
    WHERE name = v_metadata_role OR lower(name) = lower(v_role_enum::text)
    LIMIT 1;

  -- Insert profile with tenant_id
  INSERT INTO public.profiles (id, email, full_name, role, role_id, is_active, tenant_id, plan, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_role_enum,
    v_role_id,
    true,
    v_tenant_id,
    'free'::plan_t,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id),
    plan = EXCLUDED.plan,
    is_active = true,
    updated_at = now();

  -- Audit log
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
  VALUES (
    NEW.id, NEW.id, 'USER_REGISTERED_PUBLICLY',
    jsonb_build_object('email', NEW.email, 'role', v_role_enum::text, 'tenant_id', v_tenant_id),
    jsonb_build_object('company_name', v_company_name, 'source', 'self_signup')
  );

  RETURN NEW;
END;
$function$


-- @contract-function name=open_cash_shift args="p_store_id uuid, p_opening_balance_cup numeric, p_opening_balance_usd numeric, p_opening_note text, p_difference_note text, p_idempotency_key text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.open_cash_shift(p_store_id uuid, p_opening_balance_cup numeric, p_opening_balance_usd numeric DEFAULT 0, p_opening_note text DEFAULT NULL::text, p_difference_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_counted_cup numeric;
  v_counted_usd numeric;
  v_expected_cup numeric := 0;
  v_expected_usd numeric := 0;
  v_diff_cup numeric := 0;
  v_diff_usd numeric := 0;
  v_diff_note text;
  v_usd_rate numeric;
  v_usd_rate_source text;
  v_opening_canonical numeric := 0;
  v_existing public.cash_closures%ROWTYPE;
  v_closure_id uuid;
  v_param_hash text;
  v_idem jsonb;
  v_summary jsonb;
  v_result jsonb;
BEGIN
  -- 1. AUTH actor-explícito + rol de operación de caja (paridad con el INSERT
  --    directo que hoy hace la UI con las policies de cash_closures)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin', 'manager', 'encargado', 'clerk']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: requiere admin, manager, encargado o clerk en la tienda';
  END IF;

  -- 2. Validación de los importes declarados: no negativos, 2 decimales
  v_counted_cup := COALESCE(p_opening_balance_cup, 0);
  v_counted_usd := COALESCE(p_opening_balance_usd, 0);
  IF v_counted_cup < 0 OR v_counted_usd < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: el efectivo declarado no puede ser negativo';
  END IF;
  IF v_counted_cup <> round(v_counted_cup, 2) OR v_counted_usd <> round(v_counted_usd, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;

  -- 3. Advisory lock por tienda (serializa aperturas/cierres/entregas)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 4. IDEMPOTENCIA (patrón v2.26)
  v_param_hash := md5(
    p_store_id::text || '|' || v_caller_uid::text || '|'
    || v_counted_cup::text || '|' || v_counted_usd::text
    || '|' || COALESCE(btrim(p_opening_note), '')
  );
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT ir.result INTO v_idem
      FROM public.idempotency_registry ir
      WHERE ir.idempotency_key = p_idempotency_key
        AND ir.operation = 'open_cash_shift'
      LIMIT 1;
    IF v_idem IS NOT NULL THEN
      SELECT ir.param_hash INTO v_param_hash
        FROM public.idempotency_registry ir
        WHERE ir.idempotency_key = p_idempotency_key
          AND ir.operation = 'open_cash_shift'
        LIMIT 1;
      IF v_param_hash IS NULL OR v_idem IS NULL THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_idem;
    END IF;
  END IF;

  -- 5. Un solo turno pendiente por tienda (índice único vivo one_pending_*)
  SELECT * INTO v_existing FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    LIMIT 1
    FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'ERR_SHIFT_ALREADY_OPEN: ya existe un turno pendiente (abierto %) — ciérralo antes de abrir uno nuevo', v_existing.created_at;
  END IF;

  -- 6. Tasa USD server-side para la apertura canónica (jerarquía de ventas)
  v_usd_rate := NULL;
  v_usd_rate_source := NULL;
  IF v_counted_usd > 0 THEN
    SELECT ser.rate, 'store_exchange_rates' INTO v_usd_rate, v_usd_rate_source
      FROM public.store_exchange_rates ser
      WHERE ser.store_id = p_store_id AND ser.currency = 'USD';
    IF v_usd_rate IS NULL THEN
      SELECT er.rate, 'global_bcc_seg3' INTO v_usd_rate, v_usd_rate_source
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'BCC' AND er.segment = '3'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_usd_rate IS NULL THEN
      SELECT er.rate, 'global_' || lower(er.source) INTO v_usd_rate, v_usd_rate_source
        FROM public.exchange_rates er
        WHERE er.currency = 'USD' AND er.source = 'Diviza'
        ORDER BY er.rate_date DESC, er.captured_at DESC LIMIT 1;
    END IF;
    IF v_usd_rate IS NULL OR v_usd_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_EXCHANGE_RATE_UNAVAILABLE: configure la tasa USD de la tienda antes de declarar apertura en USD';
    END IF;
  END IF;

  -- 7. SALDO ESPERADO del libro por moneda (sin semillas de apertura — D2)
  v_summary := public.get_cash_currency_summary(p_store_id, NULL, NULL);
  v_expected_cup := COALESCE((v_summary->'net'->>'CUP')::numeric, 0);
  v_expected_usd := COALESCE((v_summary->'net'->>'USD')::numeric, 0);
  v_diff_cup := round(v_counted_cup - v_expected_cup, 2);
  v_diff_usd := round(v_counted_usd - v_expected_usd, 2);

  -- 8. Gestión AUTORIZADA de la diferencia (misión §10.8): jamás silenciosa
  v_diff_note := NULLIF(btrim(COALESCE(p_difference_note, '')), '');
  IF (abs(v_diff_cup) > 0.01 OR abs(v_diff_usd) > 0.01) AND (v_diff_note IS NULL OR length(v_diff_note) < 10) THEN
    RAISE EXCEPTION 'ERR_OPENING_DIFFERENCE_NOTE_REQUIRED: lo contado difiere del saldo del libro (CUP %, USD %) — documente la causa autorizada de la diferencia',
      round(v_diff_cup, 2), round(v_diff_usd, 2);
  END IF;

  -- 9. INSERT del turno: apertura canónica (fórmulas v2.23.0 intactas) +
  --    desglose físico + diferencias registradas
  v_opening_canonical := v_counted_cup + (v_counted_usd * COALESCE(v_usd_rate, 0));
  INSERT INTO public.cash_closures (
    store_id, user_id, status,
    opening_balance, opening_balance_cup, opening_balance_usd,
    opening_difference_cup, opening_difference_usd, opening_difference_note,
    notes
  ) VALUES (
    p_store_id, v_caller_uid, 'pendiente',
    v_opening_canonical, v_counted_cup, v_counted_usd,
    v_diff_cup, v_diff_usd, v_diff_note,
    NULLIF(btrim(COALESCE(p_opening_note, '')), '')
  )
  RETURNING id INTO v_closure_id;

  -- 10. Auditoría atómica
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'CASH_SHIFT_OPENED', 'cash_closures', v_closure_id,
    jsonb_build_object(
      'opening_balance_cup', v_counted_cup,
      'opening_balance_usd', v_counted_usd,
      'opening_canonical_cup', round(v_opening_canonical, 2),
      'expected_cup', round(v_expected_cup, 2),
      'expected_usd', round(v_expected_usd, 2),
      'difference_cup', v_diff_cup,
      'difference_usd', v_diff_usd,
      'difference_note', v_diff_note,
      'usd_rate', v_usd_rate,
      'usd_rate_source', v_usd_rate_source,
      'formula', 'v1.0.0'
    )
  );

  v_result := jsonb_build_object(
    'status', 'success',
    'closure_id', v_closure_id,
    'counted_cup', v_counted_cup,
    'counted_usd', v_counted_usd,
    'expected_cup', round(v_expected_cup, 2),
    'expected_usd', round(v_expected_usd, 2),
    'difference_cup', v_diff_cup,
    'difference_usd', v_diff_usd,
    'opening_canonical_cup', round(v_opening_canonical, 2),
    'usd_rate', v_usd_rate,
    'usd_rate_source', v_usd_rate_source
  );

  -- 11. Registro de idempotencia (después del éxito — patrón v2.26)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    INSERT INTO public.idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
    VALUES (btrim(p_idempotency_key), 'open_cash_shift', v_closure_id, v_param_hash, v_result)
    ON CONFLICT (idempotency_key, operation) DO NOTHING;
  END IF;

  RETURN v_result;
END;
$function$


-- @contract-function name=pay_commission args="p_payment_id uuid, p_payment_method text, p_reference text, p_currency text, p_exchange_rate numeric, p_paid_at timestamp with time zone, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.pay_commission(p_payment_id uuid, p_payment_method text, p_reference text DEFAULT NULL::text, p_currency text DEFAULT NULL::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_comm record;
  v_currency text;
  v_phys_out numeric := 0;
  v_phys_available numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  SELECT id, store_id, status, currency, exchange_rate, amount_cup, final_amount
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;
  IF v_comm.id IS NULL THEN
    RAISE EXCEPTION 'ERR_COMMISSION_NOT_FOUND: %', p_payment_id;
  END IF;

  IF NOT public.has_store_role_as(v_uid, v_comm.store_id, 'admin')
     AND NOT public.has_store_role_as(v_uid, v_comm.store_id, 'manager') THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: pagar comisiones requiere admin o manager';
  END IF;

  -- Idempotencia natural (misma semántica que la ruta: ya pagada → replay)
  IF v_comm.status = 'paid' THEN
    RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', true,
      'message', 'La comisión ya estaba pagada');
  END IF;
  IF v_comm.status NOT IN ('approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_INVALID_COMMISSION_STATUS: no se puede pagar una comisión con estado "%"', v_comm.status;
  END IF;
  IF lower(trim(p_payment_method)) NOT IN ('cash', 'transfer', 'zelle', 'mixed') THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_METHOD: %', p_payment_method;
  END IF;
  IF p_currency IS NOT NULL AND upper(trim(p_currency)) NOT IN ('CUP', 'USD') THEN
    RAISE EXCEPTION 'ERR_INVALID_CURRENCY: %', p_currency;
  END IF;

  -- Fecha del pago: nunca futura (regla 1 del negocio, validada en servidor)
  IF p_paid_at IS NOT NULL AND p_paid_at > now() THEN
    RAISE EXCEPTION 'ERR_PAYMENT_DATE_FUTURE: la fecha del pago (%) no puede ser posterior a ahora (%)', p_paid_at, now();
  END IF;

  v_currency := COALESCE(upper(btrim(p_currency)), v_comm.currency);

  -- Protocolo del cajón: advisory ANTES de la lectura que autoriza la salida
  PERFORM pg_advisory_xact_lock(hashtext(v_comm.store_id::text));

  -- Fase A: una comisión pagada en EFECTIVO entrega BILLETES de su moneda.
  -- Efecto físico por moneda = final_amount en la moneda efectiva del pago
  -- (término v_comm del libro — misma fuente autoritativa). Fail-closed;
  -- lectura post-lock con upper bound 'infinity' (coherente con el lock).
  -- NOTA 'mixed': el libro (v_comm) solo cuenta payment_method='cash' — los
  -- pagos mixtos de comisión no participan del físico en la fórmula vigente
  -- (gap contable PREEXISTENTE, documentado como residual): se valida
  -- estrictamente 'cash' para no alterar la aceptación de 'mixed'.
  IF lower(trim(p_payment_method)) = 'cash' THEN
    v_phys_out := v_comm.final_amount;
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      v_comm.store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> v_currency)::numeric, 0);
    IF COALESCE(v_phys_out, 0) > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, comisión=%',
        v_currency, round(v_phys_available, 2), round(COALESCE(v_phys_out, 0), 2);
    END IF;
  END IF;

  UPDATE public.commission_payments SET
    status = 'paid',
    paid_at = COALESCE(p_paid_at, now()),
    paid_by = v_uid,
    payment_method = lower(trim(p_payment_method)),
    payment_reference = p_reference,
    currency = COALESCE(upper(btrim(p_currency)), currency),
    exchange_rate = CASE WHEN p_exchange_rate IS NOT NULL THEN p_exchange_rate
                         WHEN upper(btrim(COALESCE(p_currency, currency))) <> 'CUP' THEN COALESCE(exchange_rate, 1.0)
                         ELSE 1.0 END,
    updated_at = now()
  WHERE id = p_payment_id
    AND status IN ('approved', 'draft')
    AND store_id = v_comm.store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_COMMISSION_STATE_CHANGED: la comisión cambió de estado concurrentemente — reintentar';
  END IF;

  SELECT id, store_id, status, currency, amount_cup, final_amount, paid_at, paid_by, payment_method
    INTO v_comm
    FROM public.commission_payments
    WHERE id = p_payment_id;

  RETURN jsonb_build_object('payment', to_jsonb(v_comm), 'idempotent_replay', false);
END;
$function$


-- @contract-function name=perform_inventory_adjustment args="p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);
  v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);

  IF p_quantity_delta > 0 THEN
    -- DF-01: blend vía escritor único (antes: CASE dentro del UPDATE)
    PERFORM public.fn_recalc_wac(p_store_id, p_product_id, 'adjustment_plus',
                 p_quantity_delta, v_costo_unitario_movimiento,
                 jsonb_build_object('rpc','perform_inventory_adjustment','reason',p_reason));
  END IF;
  -- Δ<0: WAC invariante (correcto por diseño A1/salida pura)

  UPDATE public.products
    SET stock_current = v_nuevo_stock, updated_at = v_effective_date
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
    p_skip_access_check := TRUE
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock,
    'new_cost_average', (SELECT cost_average FROM public.products WHERE id=p_product_id AND store_id=p_store_id));
END $function$


-- @contract-function name=prepare_physical_inventory args="p_pi_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prepare_physical_inventory(p_pi_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_recent BOOLEAN;
  v_drift_count INTEGER := 0;
  v_source_text TEXT;
  v_inserted INTEGER;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo un borrador puede prepararse (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_PREPARE_PI';
  END IF;

  -- ¿El corte es "ahora"? (ventana de 5 min) → usar inventory (fuente primaria).
  v_recent := v_pi.cutoff_date >= NOW() - INTERVAL '5 minutes';

  -- Generación de líneas con instantánea de existencias teóricas:
  --  * corte reciente: inventory.quantity (primary truth model)
  --  * corte histórico: Σ stock_movements.quantity_change (created_at <= corte)
  --    + verificación de coherencia ledger↔inventory (drift → advertencia)
  INSERT INTO public.physical_inventory_items (
    pi_id, line_number, product_id,
    theoretical_qty, theoretical_unit_cost, theoretical_source
  )
  SELECT
    p_pi_id,
    ROW_NUMBER() OVER (ORDER BY p.name, p.sku NULLS LAST),
    p.id,
    CASE WHEN v_recent THEN COALESCE(inv.quantity, 0)
         ELSE COALESCE(ms.sum_cutoff, 0) END::numeric,
    COALESCE(p.cost_average, 0)::numeric,
    CASE WHEN v_recent THEN 'inventory'
         WHEN ROUND(COALESCE(ms.sum_now, 0)::numeric, 4) = ROUND(COALESCE(inv.quantity, 0)::numeric, 4)
           THEN 'ledger'
         ELSE 'ledger_drift' END
  FROM public.products p
  LEFT JOIN public.inventory inv
    ON inv.product_id = p.id AND inv.store_id = v_pi.store_id
  LEFT JOIN LATERAL (
    SELECT SUM(sm.quantity_change) FILTER (WHERE sm.created_at <= v_pi.cutoff_date) AS sum_cutoff,
           SUM(sm.quantity_change) AS sum_now
    FROM public.stock_movements sm
    WHERE sm.product_id = p.id AND sm.store_id = v_pi.store_id
  ) ms ON TRUE
  WHERE p.store_id = v_pi.store_id
    AND p.is_active = true
    AND COALESCE(p.is_service, false) = false
    AND (v_pi.scope_type = 'full'
         OR (v_pi.scope_type = 'category' AND p.category = ANY(v_pi.scope_category_names))
         OR (v_pi.scope_type = 'selection' AND p.id = ANY(v_pi.scope_products)));

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_SCOPE: el alcance no incluye ningún producto activo de la tienda';
  END IF;

  SELECT COUNT(*) INTO v_drift_count
  FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND theoretical_source = 'ledger_drift';

  v_source_text := CASE WHEN v_recent THEN 'inventory' ELSE 'ledger' END;
  UPDATE public.physical_inventories
    SET status = 'prepared',
        snapshot_meta = jsonb_build_object(
          'prepared_at', NOW(),
          'prepared_by', v_caller_uid,
          'cutoff_date', v_pi.cutoff_date,
          'theoretical_method', v_source_text,
          'ledger_drift_products', v_drift_count,
          'lines_generated', v_inserted
        )
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_PREPARED', 'physical_inventories', p_pi_id,
          jsonb_build_object('lines', v_inserted, 'method', v_source_text,
                             'drift_products', v_drift_count), v_pi.store_id);

  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id,
                            'lines', v_inserted, 'ledger_drift_products', v_drift_count,
                            'theoretical_method', v_source_text);
END;
$function$


-- @contract-function name=process_inventory_adjustment args="p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_item public.adjustment_item;
  v_difference NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date, p_store_id);

  INSERT INTO public.inventory_adjustments (store_id, created_by, status, created_at)
  VALUES (p_store_id, p_cashier_id, 'PROCESSING', v_effective_date)
  RETURNING id INTO v_adjustment_id;

  FOREACH v_item IN ARRAY p_items
  LOOP
    v_difference := v_item.counted_quantity - v_item.expected_quantity;
    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity, created_at)
    VALUES (v_adjustment_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity, v_effective_date);

    PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := p_store_id,
        p_user_id := p_cashier_id,
        p_quantity := v_difference,
        p_movement_type := 'adjustment',
        p_operation_date := v_effective_date
    );
  END LOOP;

  UPDATE public.inventory_adjustments SET status = 'COMPLETED', updated_at = v_effective_date
  WHERE id = v_adjustment_id;
  RETURN v_adjustment_id;
END;
$function$


-- @contract-function name=process_pick3_transaction args="p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid, p_reference_play_id uuid, p_notes text, p_metadata jsonb" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid DEFAULT NULL::uuid, p_reference_play_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS pick3_ledger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_current_balance bigint;
    v_new_balance bigint;
    v_ledger_entry public.pick3_ledger;
BEGIN
    -- Get or create profile and lock it for update
    INSERT INTO public.pick3_profiles (user_id, current_bankroll, initial_bankroll)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT current_bankroll INTO v_current_balance
    FROM public.pick3_profiles
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Calculate new balance
    IF p_type IN ('initial_deposit', 'win', 'adjustment') THEN
        v_new_balance := v_current_balance + p_amount;
    ELSIF p_type IN ('bet', 'withdrawal') THEN
        v_new_balance := v_current_balance - p_amount;
    ELSE
        RAISE EXCEPTION 'Invalid transaction type: %', p_type;
    END IF;

    -- Update profile
    UPDATE public.pick3_profiles
    SET current_bankroll = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Insert ledger entry
    INSERT INTO public.pick3_ledger (
        user_id, type, amount, balance_before, balance_after, 
        reference_draw_id, reference_play_id, notes, metadata
    )
    VALUES (
        p_user_id, p_type, p_amount, v_current_balance, v_new_balance,
        p_reference_draw_id, p_reference_play_id, p_notes, p_metadata
    )
    RETURNING * INTO v_ledger_entry;

    RETURN v_ledger_entry;
END;
$function$


-- @contract-function name=purge_old_reset_snapshots args="p_days integer" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.purge_old_reset_snapshots(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.store_reset_snapshots WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$


-- @contract-function name=receive_against_po args="p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamp with time zone, p_invoice_number text" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.receive_against_po(p_po_id uuid, p_received_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id            uuid;
  v_supplier_name       text;
  v_po_status           public.purchase_status_enum;
  v_item                jsonb;
  v_item_id             uuid;
  v_qty                 numeric;
  v_qty_ordered         numeric;
  v_qty_received_before numeric;
  v_product_id          uuid;
  v_unit_cost           numeric;
  v_product_name        text;
  v_all_received        boolean;
  v_any_received        boolean;
  v_new_status          public.purchase_status_enum;
  v_receipt_id          uuid;
  v_reception_items     jsonb := '[]'::jsonb;
  v_count               integer := 0;
  v_po_number           text;
  v_invoice_to_pass     text;
  v_sorted_items        jsonb;
BEGIN
  -- ─── 1. Cargar OC con lock exclusivo ───
  SELECT po.store_id, po.supplier_name, po.status, po.po_number
    INTO v_store_id, v_supplier_name, v_po_status, v_po_number
  FROM public.purchase_orders po
  WHERE po.id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware via has_store_access) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Validar estado de la OC ───
  IF v_po_status = 'cancelled' THEN
    RAISE EXCEPTION 'ERR_PO_CANCELLED';
  END IF;
  -- Solo se puede recibir contra draft, sent o partial.
  IF v_po_status NOT IN ('draft', 'sent', 'partial') THEN
    RAISE EXCEPTION 'ERR_PO_NOT_RECEIVABLE: status % is terminal', v_po_status;
  END IF;

  -- ─── 4. Validar items no vacío (parity B3 register_reception) ───
  IF p_received_items IS NULL OR jsonb_array_length(p_received_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- ─── 5. Condición #5 (anti-deadlock): Ordenar items por po_item_id ASC ───
  SELECT jsonb_agg(elem ORDER BY (elem->>'po_item_id'))
    INTO v_sorted_items
  FROM jsonb_array_elements(p_received_items) AS elem;

  -- ─── 6. Procesar cada item: VALIDAR antes de actualizar ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items) LOOP
    v_item_id := NULLIF(v_item->>'po_item_id', '')::uuid;
    v_qty     := COALESCE((v_item->>'quantity_received')::numeric, 0);

    -- Validar po_item_id presente
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'ERR_ITEM_ID_REQUIRED: missing po_item_id in received_items';
    END IF;

    -- Medio #6: qty > 0
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_NEGATIVE_QTY: qty % for item % must be > 0', v_qty, v_item_id;
    END IF;

    -- Cargar estado actual del item con lock FOR UPDATE
    SELECT product_id, quantity_ordered, quantity_received, unit_cost, product_name
      INTO v_product_id, v_qty_ordered, v_qty_received_before, v_unit_cost, v_product_name
    FROM public.purchase_order_items
    WHERE id = v_item_id AND po_id = p_po_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: %', v_item_id;
    END IF;

    -- Alto #5: over-receive check
    IF (v_qty_received_before + v_qty) > v_qty_ordered THEN
      RAISE EXCEPTION 'ERR_OVER_RECEIVE: item % ordered %, already received %, attempting %',
        v_item_id, v_qty_ordered, v_qty_received_before, v_qty;
    END IF;

    -- Condición #1: todo item debe tener product_id NOT NULL
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ID_REQUIRED: item % has no product_id', v_item_id;
    END IF;

    -- Medio #9: producto debe existir en store
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % not in store %',
        v_product_id, v_store_id;
    END IF;

    -- Acumular para register_reception (formato esperado: product_id, quantity, unit_cost, moneda, tasa)
    v_reception_items := v_reception_items || jsonb_build_object(
      'product_id',   v_product_id,
      'product_name', v_product_name,
      'quantity',     v_qty,
      'unit_cost',    v_unit_cost,
      'moneda_recepcion', 'CUP',
      'tasa_cambio_recepcion', 1.0
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 7. Condición #3: reference_doc NULL si no viene invoice_number ───
  -- Evita colisión con UNIQUE INDEX idx_receipts_store_reference_doc
  -- (store_id, reference_doc) en partial indexes.
  -- El vínculo real receipt↔PO es receipts.po_id (G6).
  IF p_invoice_number IS NULL OR p_invoice_number = '' THEN
    v_invoice_to_pass := NULL;
  ELSE
    v_invoice_to_pass := p_invoice_number;
  END IF;

  -- ─── 8. Crear receipt vinculado vía register_reception ───
  -- register_reception aplica las 8 validaciones B1-B5 + C1-C3 del v2.23.0
  -- (no se relajan). G6 añade p_po_id opcional.
  v_receipt_id := public.register_reception(
    p_store_id        := v_store_id,
    p_supplier        := v_supplier_name,
    p_reception_date  := p_reception_date,
    p_invoice_number  := v_invoice_to_pass,
    p_items           := v_reception_items,
    p_user_id         := p_user_id,
    p_po_id           := p_po_id
  );

  -- ─── 9. Actualizar quantity_received en purchase_order_items ───
  -- (SECURITY DEFINER bypasses RLS DENY UPDATE de G5)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items) LOOP
    v_item_id := NULLIF(v_item->>'po_item_id', '')::uuid;
    v_qty     := (v_item->>'quantity_received')::numeric;

    UPDATE public.purchase_order_items
    SET quantity_received = quantity_received + v_qty
    WHERE id = v_item_id AND po_id = p_po_id;
  END LOOP;

  -- ─── 10. Recalcular status global (cast EXPLÍCITO a enum) ───
  SELECT
    BOOL_AND(quantity_received >= quantity_ordered),
    BOOL_OR(quantity_received > 0)
  INTO v_all_received, v_any_received
  FROM public.purchase_order_items WHERE po_id = p_po_id;

  v_new_status :=
    CASE
      WHEN v_all_received THEN 'received'::public.purchase_status_enum
      WHEN v_any_received THEN 'partial'::public.purchase_status_enum
      ELSE 'sent'::public.purchase_status_enum
    END;

  -- ─── 11. Actualizar OC + vincular receipt en notas ───
  UPDATE public.purchase_orders
  SET status       = v_new_status,
      received_at  = CASE WHEN v_new_status = 'received' THEN NOW() ELSE received_at END,
      notes        = COALESCE(notes, '') ||
                     CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                     '[Receipt ' || v_receipt_id::text || ' linked at ' || NOW()::text || ']'
  WHERE id = p_po_id;

  -- ─── 12. CxP (Grupo 6): marcar receipt con payment_status='unpaid' ───
  -- Solo si aún no está seteado (no sobrescribir si register_reception ya lo puso).
  UPDATE public.receipts
  SET payment_status     = COALESCE(NULLIF(payment_status, ''), 'unpaid'),
      payment_terms_days = COALESCE(payment_terms_days, 30),
      due_date           = COALESCE(due_date, (p_reception_date::date + INTERVAL '30 days')::date)
  WHERE id = v_receipt_id;

  -- ─── 13. Auditoría ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_user_id, v_store_id, 'po_received', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'new_status', v_new_status::text,
      'items_received', v_count,
      'receipt_id', v_receipt_id,
      'po_number', v_po_number,
      'invoice_number', v_invoice_to_pass
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', v_new_status::text,
    'receipt_id', v_receipt_id,
    'items_received', v_count
  );
END;
$function$


-- @contract-function name=receive_production_output args="p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_user_id UUID;
  v_order_status TEXT;
  v_order_store_id UUID;
  v_existing_result JSONB;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_param_hash TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || p_product_id::text || p_quantity::text || p_store_id::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_OUTPUT_RECEIVED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  SELECT status, store_id INTO v_order_status, v_order_store_id
  FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order_status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_IN_PROGRESS: status % is not in_progress', v_order_status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND store_id = v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE';
  END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_quantity must be > 0'; END IF;

  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items WHERE order_id = p_order_id AND actual_qty > 0;

  -- DF-05: PT nunca entra a 0 sin información válida (INV-06/E')
  IF v_total_materials_cost <= 0 THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: sin materiales server-side validos para orden %', p_order_id;
  END IF;

  v_unit_pt_cost := v_total_materials_cost / p_quantity;

  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id AND store_id = v_order_store_id FOR UPDATE;

  v_new_stock := COALESCE(v_current_stock,0) + p_quantity;

  -- DF-01: WAC vía escritor único; SIN espejo cost_price (D-02)
  v_new_cost := public.fn_recalc_wac(v_order_store_id, p_product_id, 'production_in',
                   p_quantity, v_unit_pt_cost,
                   jsonb_build_object('rpc','receive_production_output','order_id',p_order_id));

  UPDATE production_orders SET
    output_product_id = p_product_id, output_quantity = p_quantity,
    output_total_cost = v_total_materials_cost,
    output_unit_cost = v_unit_pt_cost, updated_at = now()
  WHERE id = p_order_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  -- DF-05: qty numérica sin truncamiento (D-11)
  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := p_quantity,
    p_movement_type := 'production_in',
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_unit_pt_cost,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid,
    p_skip_access_check := TRUE
  );

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_OUTPUT_RECEIVED', 'production_orders', p_order_id,
    jsonb_build_object(
      'product_id', p_product_id, 'quantity', p_quantity,
      'total_materials_cost', v_total_materials_cost,
      'unit_cost', v_unit_pt_cost, 'previous_wac', v_current_cost, 'new_wac', v_new_cost,
      'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'new_wac', v_new_cost, 'new_stock', v_new_stock)
    )
  );

  RETURN jsonb_build_object('status','success','new_wac',v_new_cost,'new_stock',v_new_stock,
    'total_materials_cost',v_total_materials_cost);
END $function$


-- @contract-function name=receive_to_warehouse args="p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid DEFAULT NULL::uuid, p_lot_number text DEFAULT NULL::text, p_expiration_date date DEFAULT NULL::date, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_movement_id UUID;
  v_new_stock NUMERIC;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT explícito
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar producto pertenece a la store
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND store_id = p_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND';
  END IF;

  -- Registrar movimiento
  v_movement_id := public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_uid,
    p_quantity := p_quantity,
    p_movement_type := 'purchase',
    p_reference_doc := NULL,
    p_unit_cost := p_unit_cost,
    p_reason := COALESCE(p_reason, 'Recepción a almacén'),
    p_operation_date := NOW(),
    p_skip_access_check := TRUE
  );

  -- Actualizar stock + WAC
  SELECT stock_current INTO v_new_stock FROM public.products WHERE id = p_product_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('RECEIVE_TO_WAREHOUSE', 'products', p_product_id, p_store_id, v_uid,
    jsonb_build_object('quantity', p_quantity, 'unit_cost', p_unit_cost, 'warehouse_id', p_warehouse_id, 'lot', p_lot_number));

  RETURN jsonb_build_object('status', 'success', 'movement_id', v_movement_id, 'new_stock', v_new_stock);
END;
$function$


-- @contract-function name=reconcile_orphan_user args="p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_log RECORD;
  v_target_email text;
BEGIN
  -- Autorización usa is_admin() (internamente auth.uid()) → NO spoofable
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_action NOT IN ('create_profile', 'delete_auth_user', 'ignore') THEN
    RAISE EXCEPTION 'ERR_INVALID_ACTION: %', p_action;
  END IF;

  SELECT * INTO v_log FROM public.orphaned_users_log
    WHERE auth_user_id = p_auth_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORPHAN_NOT_FOUND: %', p_auth_user_id;
  END IF;

  IF v_log.status = 'resolved' THEN
    RAISE EXCEPTION 'ERR_ALREADY_RESOLVED';
  END IF;

  v_target_email := v_log.email;

  IF p_action = 'create_profile' THEN
    INSERT INTO public.profiles (id, email, full_name, role, plan, is_active, created_at, updated_at)
    VALUES (
      p_auth_user_id,
      v_target_email,
      COALESCE(split_part(v_target_email, '@', 1), 'User'),
      'usuario'::public.user_role,
      'free'::plan_t,
      true,
      now(), now()
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.orphaned_users_log SET
      status = 'resolved',
      resolution = 'Profile created with role=usuario, plan=free',
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;

  ELSIF p_action = 'delete_auth_user' THEN
    UPDATE public.orphaned_users_log SET
      status = 'pending_deletion',
      resolution = p_reason,
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;

  ELSIF p_action = 'ignore' THEN
    UPDATE public.orphaned_users_log SET
      status = 'ignored',
      resolution = p_reason,
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_auth_user_id,
    'ORPHAN_RECONCILED',
    jsonb_build_object(
      'action', p_action,
      'reason', p_reason,
      'email', v_target_email,
      'log_status', CASE
        WHEN p_action = 'create_profile' THEN 'resolved'
        WHEN p_action = 'delete_auth_user' THEN 'pending_deletion'
        WHEN p_action = 'ignore' THEN 'ignored'
      END
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'auth_user_id', p_auth_user_id,
    'action', p_action,
    'new_status', CASE
      WHEN p_action = 'create_profile' THEN 'resolved'
      WHEN p_action = 'delete_auth_user' THEN 'pending_deletion'
      WHEN p_action = 'ignore' THEN 'ignored'
    END
  );
END;
$function$


-- @contract-function name=reconcile_stock args="p_store_id uuid, p_fix boolean, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reconcile_stock(p_store_id uuid DEFAULT NULL::uuid, p_fix boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_fixed INTEGER := 0;
  v_skipped_negative INTEGER := 0;
  v_truncated BOOLEAN := FALSE;
  v_discrepancies JSONB[] := ARRAY[]::JSONB[];
  v_rec RECORD;
  -- V2.12.19: anti-spoofing guard V2.12.9
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_expected NUMERIC;
  v_user_is_admin BOOLEAN;
  v_max_details INTEGER := 500;
  v_inspection_logged BOOLEAN := FALSE;
BEGIN
  -- V2.12.10 (preservado): admin check + has_store_role check
  -- V2.12.19: anti-spoofing guard aplicado a v_caller_uid
  v_user_is_admin := public.is_admin();

  IF p_store_id IS NULL THEN
    -- Reconciliar todas las tiendas → requiere admin global
    -- V2.12.19: IS NULL OR NOT (consistencia V2.12.12 + V2.12.18)
    IF v_caller_uid IS NULL OR NOT v_user_is_admin THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_GLOBAL_RECONCILE';
    END IF;
  ELSE
    -- Reconciliar una tienda → requiere admin global o admin/manager de la tienda
    -- V2.12.19: IS NULL OR NOT (consistencia)
    IF v_caller_uid IS NULL OR NOT v_user_is_admin THEN
      IF NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text]) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
      END IF;
    END IF;
  END IF;

  -- Comparar products.stock_current vs SUM(stock_movements.quantity_change)
  FOR v_rec IN
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.store_id,
      p.stock_current AS current_stock,
      COALESCE(SUM(sm.quantity_change), 0) AS expected_stock,
      ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) AS diff
    FROM public.products p
    LEFT JOIN public.stock_movements sm ON sm.product_id = p.id AND sm.store_id = p.store_id
    WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
      AND p.is_active = true
    GROUP BY p.id, p.name, p.store_id, p.stock_current
    HAVING ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) > 0.001
  LOOP
    v_count := v_count + 1;
    v_expected := v_rec.expected_stock;

    IF array_length(v_discrepancies, 1) IS NULL OR array_length(v_discrepancies, 1) < v_max_details THEN
      v_discrepancies := array_append(v_discrepancies, jsonb_build_object(
        'product_id', v_rec.product_id,
        'product_name', v_rec.product_name,
        'store_id', v_rec.store_id,
        'current_stock', v_rec.current_stock,
        'expected_stock', v_rec.expected_stock,
        'diff', v_rec.diff,
        'skipped', (v_expected < 0)
      ));
    ELSE
      v_truncated := TRUE;
    END IF;

    -- H7-4: NO silenciar corrupción negativa con GREATEST(0, v_expected).
    IF v_expected < 0 THEN
      v_skipped_negative := v_skipped_negative + 1;

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'STOCK_RECONCILIATION_NEGATIVE',
        'products',
        v_rec.product_id,
        v_rec.store_id,
        v_caller_uid,
        jsonb_build_object(
          'current_stock', v_rec.current_stock,
          'expected_stock', v_rec.expected_stock,
          'diff', v_rec.diff,
          'fix_mode', p_fix,
          'reason', 'Negative expected stock — possible fraud or bug, manual review required'
        )
      );

      CONTINUE;
    END IF;

    IF p_fix THEN
      UPDATE public.products
        SET stock_current = v_expected, updated_at = NOW()
        WHERE id = v_rec.product_id;

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES ('STOCK_RECONCILIATION', 'products', v_rec.product_id, v_rec.store_id, v_caller_uid,
        jsonb_build_object('old_stock', v_rec.current_stock, 'new_stock', v_expected, 'diff', v_rec.diff));

      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  -- H7-7: Audit log resumen en modo inspección (p_fix=false)
  IF NOT p_fix AND v_count > 0 THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES (
      'STOCK_RECONCILIATION_INSPECT',
      'products',
      NULL,
      p_store_id,
      v_caller_uid,
      jsonb_build_object(
        'discrepancies_found', v_count,
        'discrepancies_skipped_negative', v_skipped_negative,
        'scope', CASE WHEN p_store_id IS NULL THEN 'all_stores' ELSE 'single_store' END,
        'reason', 'Stock reconciliation inspection — no fixes applied'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'discrepancies_found', v_count,
    'discrepancies_fixed', v_fixed,
    'discrepancies_skipped_negative', v_skipped_negative,
    'discrepancies_truncated', v_truncated,
    'fix_mode', p_fix,
    'details', to_jsonb(v_discrepancies)
  );
END;
$function$


-- @contract-function name=record_counted_quantity args="p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
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


-- @contract-function name=record_physical_inventory_counts args="p_pi_id uuid, p_items jsonb, p_source text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.record_physical_inventory_counts(p_pi_id uuid, p_items jsonb, p_source text DEFAULT 'manual'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item public.physical_inventory_items%ROWTYPE;
  v_elem JSONB;
  v_item_id UUID; v_qty NUMERIC; v_expected_ts TIMESTAMPTZ;
  v_applied INT := 0;
  v_conflicts JSONB := '[]'::jsonb;
  v_not_found JSONB := '[]'::jsonb;
  v_invalid JSONB := '[]'::jsonb;
  v_new_status TEXT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_source NOT IN ('manual','excel') THEN RAISE EXCEPTION 'ERR_INVALID_SOURCE'; END IF;

  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_progress' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTING: el conteo solo puede registrarse en estado in_progress (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id := (v_elem->>'item_id')::uuid;
    v_expected_ts := NULLIF(v_elem->>'expected_updated_at','')::timestamptz;
    BEGIN
      v_qty := CASE WHEN jsonb_typeof(v_elem->'counted_qty') = 'null' OR (v_elem->>'counted_qty') = ''
                    THEN NULL ELSE (v_elem->>'counted_qty')::numeric END;
    EXCEPTION WHEN OTHERS THEN
      v_invalid := v_invalid || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_QTY_NOT_NUMERIC');
      CONTINUE;
    END;

    SELECT * INTO v_item FROM public.physical_inventory_items
    WHERE id = v_item_id AND pi_id = p_pi_id FOR UPDATE;

    IF v_item IS NULL OR v_item.id IS NULL THEN
      v_not_found := v_not_found || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_ITEM_NOT_IN_PI');
      CONTINUE;
    END IF;

    -- Bloqueo optimista: si otro usuario contó esta línea desde que el
    -- cliente la cargó, NO se sobrescribe silenciosamente → conflicto 409.
    IF v_expected_ts IS NOT NULL AND v_item.updated_at <> v_expected_ts AND v_item.counted_at IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'item_id', v_item_id,
        'error', 'ERR_CONCURRENT_UPDATE',
        'current_counted_qty', v_item.counted_qty,
        'current_counted_by', v_item.counted_by,
        'current_updated_at', v_item.updated_at);
      CONTINUE;
    END IF;

    IF v_qty IS NOT NULL AND v_qty < 0 THEN
      v_invalid := v_invalid || jsonb_build_object('item_id', v_item_id, 'error', 'ERR_QTY_NEGATIVE');
      CONTINUE;
    END IF;

    v_new_status := CASE WHEN v_qty IS NULL THEN 'pending' ELSE 'counted' END;
    UPDATE public.physical_inventory_items
      SET counted_qty = v_qty,
          status = v_new_status,
          counted_by = CASE WHEN v_qty IS NULL THEN NULL ELSE v_caller_uid END,
          counted_at = CASE WHEN v_qty IS NULL THEN NULL ELSE NOW() END,
          updated_by = v_caller_uid,
          updated_at = NOW()
    WHERE id = v_item_id;

    INSERT INTO public.physical_inventory_count_log (
      pi_id, item_id, product_id, action, old_counted_qty, new_counted_qty, source, user_id)
    VALUES (
      p_pi_id, v_item_id, v_item.product_id,
      CASE WHEN v_qty IS NULL THEN 'clear' WHEN p_source = 'excel' THEN 'import' ELSE 'count' END,
      v_item.counted_qty, v_qty, p_source, v_caller_uid);

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success', 'pi_id', p_pi_id,
    'applied', v_applied,
    'conflicts', v_conflicts, 'not_found', v_not_found, 'invalid', v_invalid
  );
END;
$function$


-- @contract-function name=register_cash_adjustment args="p_store_id uuid, p_direction text, p_amount numeric, p_note text, p_payment_date timestamp with time zone, p_idempotency_key text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.register_cash_adjustment(p_store_id uuid, p_direction text, p_amount numeric, p_note text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_existing record;
  v_phys_available numeric := 0;
BEGIN
  -- Actor y aislamiento multitienda (doctrina del módulo)
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  IF NOT public.has_store_role_as(v_uid, p_store_id, 'admin')
     AND NOT public.has_store_role_as(v_uid, p_store_id, 'manager')
     AND NOT public.has_store_role_as(v_uid, p_store_id, 'encargado') THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: ajustes requieren admin, manager o encargado';
  END IF;

  -- Validaciones (espejo del zod de la ruta)
  IF lower(trim(p_direction)) NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'ERR_INVALID_DIRECTION: %', p_direction;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: %', p_amount;
  END IF;
  IF p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'ERR_AMOUNT_PRECISION: máximo 2 decimales';
  END IF;

  -- Gate canónico de fecha financiera (tope HOY Habana — nunca futuro)
  PERFORM public.validate_operation_date(COALESCE(p_payment_date, now()), p_store_id);

  -- Protocolo del cajón: advisory ANTES de la lectura que autoriza la salida
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- Idempotencia: la misma clave devuelve la fila original (nunca un segundo
  -- registro — un doble clic no duplica el ajuste)
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT id, direction, amount, notes, payment_date, paid_by, created_at
      INTO v_existing
      FROM public.payment_transactions
      WHERE store_id = p_store_id AND ref_type = 'adjustment'
        AND idempotency_key = btrim(p_idempotency_key)
      LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('adjustment', to_jsonb(v_existing), 'idempotent_replay', true);
    END IF;
  END IF;

  -- Fase A: un ajuste direction='out' entrega BILLETES CUP del cajón —
  -- valida el saldo físico por moneda (misma fuente autoritativa y fail-closed
  -- que egresos; lectura post-lock con upper bound 'infinity').
  IF lower(trim(p_direction)) = 'out' THEN
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      p_store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> 'CUP')::numeric, 0);
    IF p_amount > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico CUP disponible=%, ajuste=%',
        round(v_phys_available, 2), round(p_amount, 2);
    END IF;
  END IF;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, transaction_id, direction, amount,
    payment_method, currency, exchange_rate, payment_date, notes,
    paid_by, idempotency_key
  ) VALUES (
    p_store_id, 'adjustment', NULL, NULL, lower(trim(p_direction)), p_amount,
    'cash', 'CUP', 1, COALESCE(p_payment_date, now()), btrim(COALESCE(p_note, '')),
    v_uid, btrim(COALESCE(p_idempotency_key, ''))
  )
  RETURNING id, direction, amount, notes, payment_date, paid_by, created_at
    INTO v_existing;

  RETURN jsonb_build_object('adjustment', to_jsonb(v_existing), 'idempotent_replay', false);
END;
$function$


-- @contract-function name=register_idempotency args="p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  -- UPDATE el registro creado por check_idempotency (status='pending')
  UPDATE idempotency_registry
  SET result = p_result
  WHERE idempotency_key = p_key AND operation = p_operation AND param_hash = p_param_hash;
END;
$function$


-- @contract-function name=register_physical_inventory_sheet args="p_pi_id uuid, p_mode text, p_total_lines integer, p_filter_summary jsonb, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.register_physical_inventory_sheet(p_pi_id uuid, p_mode text, p_total_lines integer, p_filter_summary jsonb DEFAULT NULL::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_seq INTEGER;
  v_id UUID;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_mode NOT IN ('with_theoretical','blind') THEN RAISE EXCEPTION 'ERR_INVALID_SHEET_MODE'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF NOT (public.is_admin()
          OR public.has_store_role(v_pi.store_id,
              ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_SHEET';
  END IF;
  -- En conteo ciego, la hoja con existencias solo puede generarla un rol privilegiado
  IF p_mode = 'with_theoretical' AND v_pi.blind_mode
     AND NOT (public.is_admin()
              OR public.has_store_role(v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_BLIND_MODE_THEORETICAL_FORBIDDEN';
  END IF;

  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_seq
  FROM public.physical_inventory_sheets WHERE pi_id = p_pi_id;

  INSERT INTO public.physical_inventory_sheets (pi_id, seq, mode, total_lines, filter_summary, generated_by)
  VALUES (p_pi_id, v_seq, p_mode, p_total_lines, p_filter_summary, v_caller_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'success', 'sheet_id', v_id, 'seq', v_seq, 'mode', p_mode);
END;
$function$


-- @contract-function name=register_reception args="p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor NUMERIC := 1;
  v_units_to_add NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
  v_uc_base NUMERIC;
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- B2 (v2.23.0): Supplier is required
  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  -- B3 (v2.23.0): Items array must not be empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id   -- ← nueva columna
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id   -- ← pasa NULL si no viene
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    -- B4 (v2.23.0): Reject items with unit_cost <= 0
    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;
    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    -- C1 (v2.23.0): Validate exchange rate is within reasonable range
    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

    -- C2 (v2.23.0): Warning if product has expired lots (non-blocking)
    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id AND store_id = p_store_id
        AND expiration_date IS NOT NULL
        AND expiration_date < v_effective_date
        AND quantity_remaining > 0
    ) THEN
      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    -- B5 (v2.23.0): Product must exist in store — RAISE EXCEPTION (not CONTINUE)
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- REM-F4-04 (gate 20260908-rem-f4-04): el camino real de recepción termina
    -- en el escritor canónico. El trigger trg_update_product_wac (referenciado
    -- por el comentario A1 v2.22.0) NO existe en la BD viva y
    -- register_stock_movement ya no escribe WAC (A2 v2.22.0).
    -- Orden doctrina W62-01 §6 (idéntico a confirm_pending_reception):
    -- WAC primero → movimiento después (kardex ve ca_new).
    -- Costo por unidad BASE para el blend canónico:
    --   q·uc = units_to_add · (unit_cost_cup/factor) = unit_cost_cup · quantity
    v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                      THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                      ELSE v_unit_cost_cup END;
    PERFORM public.fn_recalc_wac(
      p_store_id   := p_store_id,
      p_product_id := v_product_id,
      p_event      := 'reception_in',
      p_qty_in     := v_units_to_add,
      p_uc_in      := v_uc_base,
      p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );


    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object(
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id
    ));

  RETURN v_receipt_id;
END
$function$


-- @contract-function name=register_stock_movement args="p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid, p_unit_cost numeric, p_notes text, p_operation_date timestamp with time zone, p_skip_access_check boolean" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_variant_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_skip_access_check boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- A2 WAC HOTFIX (v2.22.0): WAC update removed from register_stock_movement.
    -- The trigger trg_update_product_wac handles WAC for receipt_items.
    -- For other paths (transfers, devolutions, etc.), cost_average stays as-is
    -- until Grupo B/C adds WAC logic to those specific RPCs.
  END IF;

  INSERT INTO public.business_events (event_type, entity_id, payload, created_at) VALUES (
    'stock_movement', p_product_id,
    jsonb_build_object('store_id',p_store_id,'qty',p_quantity,'type',LOWER(p_movement_type),'new_qty',v_new_qty),
    v_eff
  );
  RETURN jsonb_build_object('status','ok','new_quantity',v_new_qty,'new_version',v_new_version);
END
$function$


-- @contract-function name=register_supplier_payment args="p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_phys_available numeric := 0;
BEGIN
  -- MISIÓN INTEGRAL (Fase A): protocolo común del cajón — advisory por tienda
  -- ANTES de cualquier lectura que autorice una salida de efectivo.
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost INTO v_doc_store_id, v_total
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount INTO v_doc_store_id, v_total
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total INTO v_doc_store_id, v_total
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico para la fecha
  -- financiera del pago. Se conservan las fechas históricas (V2.12.32)
  -- dentro del piso de 6 meses; NUNCA fechas futuras (tope HOY Habana).
  -- v_eff_payment_date = COALESCE(p_payment_date, now()) → NOW() siempre pasa.
  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- Calcular monto en CUP
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- R3: Validar overpay
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
  FROM public.payment_transactions
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  v_balance := v_total - v_paid;
  IF v_amount_cup > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_cup, v_balance;
  END IF;

  -- MISIÓN INTEGRAL (Fase A): un pago en EFECTIVO entrega BILLETES de la moneda
  -- del pago. Misma regla que los egresos (2222): sin conversión implícita,
  -- saldo físico por moneda, fail-closed. Lectura post-lock con upper bound
  -- 'infinity' (todo lo confirmado ES un hecho físico ya — coherente con el
  -- orden de adquisición del advisory).
  IF lower(trim(p_payment_method)) = 'cash' THEN
    v_phys_available := COALESCE((public.get_cash_currency_summary(
      p_store_id, NULL, 'infinity'::timestamptz) -> 'net' ->> upper(trim(p_currency)))::numeric, 0);
    IF p_amount > v_phys_available + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: saldo físico % disponible=%, pago=%',
        upper(trim(p_currency)), round(v_phys_available, 2), round(p_amount, 2);
    END IF;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$


-- @contract-function name=regularize_sale_payment args="p_transaction_id uuid, p_reason text, p_user_id uuid, p_idempotency_key text, p_new_cash numeric, p_new_zelle_cup numeric, p_new_zelle_usd numeric, p_new_zelle_rate numeric, p_new_transfer numeric, p_new_subtotal numeric" owner=costpro_transaction_adjuster proacl={costpro_transaction_adjuster=X/costpro_transaction_adjuster,service_role=X/costpro_transaction_adjuster}
CREATE OR REPLACE FUNCTION public.regularize_sale_payment(p_transaction_id uuid, p_reason text, p_user_id uuid, p_idempotency_key text, p_new_cash numeric DEFAULT NULL::numeric, p_new_zelle_cup numeric DEFAULT NULL::numeric, p_new_zelle_usd numeric DEFAULT NULL::numeric, p_new_zelle_rate numeric DEFAULT NULL::numeric, p_new_transfer numeric DEFAULT NULL::numeric, p_new_subtotal numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tx public.transactions%ROWTYPE;
    v_jwt_role text;
    v_cash numeric;
    v_zelle numeric;
    v_transfer numeric;
    v_new_total numeric;
    v_subtotal numeric;
    v_old_tx jsonb;
    v_old_pays jsonb;
    v_new_pays jsonb;
    v_sum_pays numeric;
    v_idem_exists boolean := false;
BEGIN
    -- 1) Canal de llamada: solo service_role (convención server-to-server del
    --    proyecto). Lectura de claims inline (patrón app_actor_uid) para no
    --    requerir USAGE del esquema auth al rol owner NOLOGIN.
    v_jwt_role := COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    );
    IF v_jwt_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013';
    END IF;
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = 'PT014';
    END IF;

    -- 2) Transacción + lock de fila
    SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016';
    END IF;

    -- 3) Autorización de negocio: admin/manager/encargado EN LA TIENDA de la venta
    IF NOT public.can_admin_reverse_transaction(p_user_id, v_tx.store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
    END IF;

    -- 4) Estado: solo ventas completadas
    IF v_tx.status <> 'completed' THEN
        RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
    END IF;

    -- 5) Idempotencia por audit_logs
    SELECT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE action = 'REGULARIZE_SALE_PAYMENT'
          AND record_id = p_transaction_id
          AND metadata->>'idempotency_key' = btrim(p_idempotency_key)
    ) INTO v_idem_exists;
    IF v_idem_exists THEN
        RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
    END IF;

    -- 6) Montos nuevos (NULL = mantener actual)
    v_cash     := COALESCE(p_new_cash, v_tx.cash_amount, 0);
    v_zelle    := COALESCE(p_new_zelle_cup, v_tx.zelle_amount, 0);
    v_transfer := COALESCE(p_new_transfer, v_tx.transfer_amount, 0);
    IF v_cash < 0 OR v_zelle < 0 OR v_transfer < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_AMOUNTS' USING ERRCODE = 'PT012';
    END IF;
    v_new_total := v_cash + v_zelle + v_transfer;
    v_subtotal  := COALESCE(p_new_subtotal, v_new_total);

    -- 7) Snapshot BEFORE
    SELECT jsonb_build_object(
        'total_amount', v_tx.total_amount, 'subtotal', v_tx.subtotal,
        'cash_amount', v_tx.cash_amount, 'transfer_amount', v_tx.transfer_amount,
        'zelle_amount', v_tx.zelle_amount, 'sale_currency', v_tx.sale_currency,
        'sale_exchange_rate', v_tx.sale_exchange_rate
    ) INTO v_old_tx;
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) - 'amount_cup' ORDER BY pt.payment_method), '[]'::jsonb)
      INTO v_old_pays
      FROM public.payment_transactions pt
     WHERE pt.transaction_id = p_transaction_id;

    -- 8) UPDATE transactions — primero el total (invariante ERR_PAYMENT_EXCEEDS_TOTAL)
    UPDATE public.transactions
       SET cash_amount = v_cash,
           zelle_amount = v_zelle,
           transfer_amount = v_transfer,
           total_amount = v_new_total,
           subtotal = v_subtotal,
           updated_at = now()
     WHERE id = p_transaction_id;

    -- 9) Libro de pagos (amount_cup GENERATED; respete trg_validate_payment_invariants)
    UPDATE public.payment_transactions
       SET amount = v_cash, updated_at = now()
     WHERE transaction_id = p_transaction_id AND payment_method = 'cash' AND currency = 'CUP';

    IF p_new_zelle_usd IS NOT NULL THEN
        UPDATE public.payment_transactions
           SET amount = p_new_zelle_usd,
               exchange_rate = COALESCE(p_new_zelle_rate, exchange_rate),
               updated_at = now()
         WHERE transaction_id = p_transaction_id AND payment_method = 'zelle';
    END IF;

    -- 10) Post-condición: Σ pagos (no refund) = total
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_pays
      FROM public.payment_transactions
     WHERE transaction_id = p_transaction_id
       AND (direction IS DISTINCT FROM 'refund');
    IF ABS(v_sum_pays - v_new_total) > 0.01 THEN
        RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total=%', v_sum_pays, v_new_total
            USING ERRCODE = 'PT011';
    END IF;

    -- 11) Snapshot AFTER + auditoría
    SELECT COALESCE(jsonb_agg(to_jsonb(pt) - 'amount_cup' ORDER BY pt.payment_method), '[]'::jsonb)
      INTO v_new_pays
      FROM public.payment_transactions pt
     WHERE pt.transaction_id = p_transaction_id;

    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
    VALUES (
        'REGULARIZE_SALE_PAYMENT', 'transactions', p_transaction_id, v_tx.store_id, p_user_id,
        jsonb_build_object('transaction', v_old_tx, 'payment_rows', v_old_pays),
        jsonb_build_object('transaction', jsonb_build_object(
            'total_amount', v_new_total, 'subtotal', v_subtotal,
            'cash_amount', v_cash, 'transfer_amount', v_transfer, 'zelle_amount', v_zelle),
            'payment_rows', v_new_pays),
        jsonb_build_object('reason', p_reason, 'idempotency_key', btrim(p_idempotency_key))
    );

    RETURN jsonb_build_object(
        'status', 'success', 'transaction_id', p_transaction_id,
        'old_total', v_old_tx->>'total_amount', 'new_total', v_new_total,
        'new_cash', v_cash, 'new_zelle', v_zelle
    );
END;
$function$


-- @contract-function name=reject_transfer args="p_transfer_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
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


-- @contract-function name=release_expired_reservations args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_sample_id uuid;
  v_sample_store_id uuid;
BEGIN
  -- Capturar un sample antes del UPDATE para el audit log
  SELECT id, store_id INTO v_sample_id, v_sample_store_id
    FROM public.inventory_reservations
    WHERE status = 'ACTIVE' AND expires_at < now()
    LIMIT 1;
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = now()
    WHERE status = 'ACTIVE' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- FIX: audit_logs.record_id es uuid, no text. Usar v_sample_id directo.
  -- Si v_count = 0, v_sample_id es NULL y el INSERT se skipnea (no hay rows).
  IF v_count > 0 AND v_sample_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('RESERVATION_EXPIRED', 'inventory_reservations', v_sample_id, v_sample_store_id, NULL,
      jsonb_build_object('count', v_count, 'reason', 'auto-release expired reservations'));
  END IF;
  RETURN v_count;
END;
$function$


-- @contract-function name=reopen_cash_shift args="p_closure_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: reason must be at least 3 characters';
  END IF;

  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'cerrado' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_CLOSED: status=%', v_closure.status;
  END IF;

  -- Auth: solo admin/manager del store
  IF v_caller_uid IS NULL OR NOT public.has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins/managers can reopen cash closures';
  END IF;

  -- Bypass del trigger de inmutabilidad
  PERFORM set_config('app.bypass_closure_lock', 'true', false);

  UPDATE public.cash_closures SET
    status = 'pendiente',
    notes = COALESCE(notes, '') || E'\n[REOPENED ' || NOW()::text || E'] ' || p_reason
  WHERE id = p_closure_id;

  PERFORM set_config('app.bypass_closure_lock', 'false', false);

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_REOPENED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', 'cerrado', 'reopened_at', NOW()));

  RETURN jsonb_build_object('status', 'success', 'closure_id', p_closure_id);
END;
$function$


-- @contract-function name=reset_store_data args="target_store_id uuid, p_keep_catalog boolean, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reset_store_data(target_store_id uuid, p_keep_catalog boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_validation JSONB;
  v_blockers TEXT;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- SECURITY H2: require management role (admin/manager/encargado) for destructive ops
  IF NOT public.has_management_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_MANAGEMENT_ACCESS_REQUIRED: reset requires admin/manager/encargado role';
  END IF;

  -- H-016: validar dependencias ANTES del borrado destructivo.
  -- REGLA DELIBERADA (fase0 20260802000001, comentario restaurado 2026-10-21
  -- tras perderse en las re-materializaciones): para reset solo bloquean las
  -- transfers ENTRANTEs (la tienda es destino — el reset de la origen rompería
  -- la transferencia ajena; las SALIENTES se borran con la propia tienda) y
  -- las sesiones de caja abiertas. OTs abiertas, recibos pendientes y
  -- transfers salientes son internas de la tienda que se resetea.
  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(target_store_id, 'reset');
  -- AUDITORÍA 2026-10-21 (trampa de nulidad, endurecimiento defensivo):
  -- `NOT (v_validation->>'can_modify')::boolean` con v_validation NULL o clave
  -- ausente ⇒ NOT NULL ⇒ NULL ⇒ IF saltado ⇒ reset destructivo SIN validación
  -- (fail-open). Hoy no es alcanzable (validate_store_can_be_modified es STABLE
  -- y devuelve exactamente una fila con can_modify presente), pero una guarda
  -- de seguridad no puede depender de un INVARIANTE DE CALLEE. Fail-closed en
  -- DOS niveles:
  --   (a) can_modify INDETERMINABLE (fila ausente o clave ausente) ⇒ rechazo
  --       directo — jamás un reset sin validación verificada;
  --   (b) can_modify=false ⇒ regla documentada (solo transfers_in y
  --       open_cash_sessions bloquean) con EXISTENCE en lugar de mensaje
  --       agregado: un bloqueador del tipo permitido con message NULL también
  --       bloquea (string_agg de NULL devuelve NULL y el guard antiguo
  --       `v_blockers IS NOT NULL AND v_blockers != ''` lo dejaba pasar).
  IF v_validation IS NULL OR (v_validation->>'can_modify') IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_VALIDATION_UNAVAILABLE: no se pudo validar las dependencias de la tienda (fail-closed)';
  END IF;
  IF NOT (v_validation->>'can_modify')::boolean THEN
    SELECT string_agg(blocker->>'message', '; ')
    INTO v_blockers
    FROM jsonb_array_elements(v_validation->'blockers') AS blocker
    WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions');
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_validation->'blockers') AS blocker
      WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions')
    ) THEN
      RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %',
        COALESCE(v_blockers, 'transferencias entrantes pendientes o sesiones de caja abiertas');
    END IF;
  END IF;

  -- Enable restore_mode locally so that triggers with bypass pattern allow DELETEs.
  -- This is the canonical pattern for maintenance RPCs (see restore_transaction_snapshot).
  -- The setting is LOCAL to this transaction and does NOT affect other sessions.
  PERFORM set_config('app.restore_mode', 'true', true);

  -- ── 1. Borrar TODAS las tablas operacionales ──

  -- FIX: payment_transactions FIRST (FK ON DELETE RESTRICT to transactions)
  DELETE FROM payment_transactions WHERE store_id = target_store_id;

  -- Hijas de transactions (now safe — payment_transactions already deleted)
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- Hijas de receipts
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- Devoluciones
  DELETE FROM devolution_items WHERE devolution_id IN (
    SELECT id FROM devolutions WHERE store_id = target_store_id
  );
  DELETE FROM devolutions WHERE store_id = target_store_id;

  -- Cotizaciones
  DELETE FROM quotation_items WHERE quotation_id IN (
    SELECT id FROM quotations WHERE store_id = target_store_id
  );
  DELETE FROM quotations WHERE store_id = target_store_id;

  -- Clientes
  DELETE FROM customers WHERE store_id = target_store_id;

  -- Bancos
  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
    SELECT id FROM bank_statements WHERE store_id = target_store_id
  );
  DELETE FROM bank_statements WHERE store_id = target_store_id;

  -- Kardex
  DELETE FROM kardex_entries WHERE store_id = target_store_id;

  -- Conteos físicos
  DELETE FROM physical_count_items WHERE count_id IN (
    SELECT id FROM physical_counts WHERE store_id = target_store_id
  );
  DELETE FROM physical_counts WHERE store_id = target_store_id;

  -- Stock movements
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- Cash
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  DELETE FROM cash_sessions WHERE store_id = target_store_id;
  DELETE FROM cash_movements WHERE store_id = target_store_id;
  DELETE FROM cash_register_sessions WHERE store_id = target_store_id;

  -- Inventory adjustments
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;

  -- Transfers
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;
  DELETE FROM transfer_approval_rules WHERE store_id = target_store_id;

  -- Purchase orders
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- Production orders
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- Workers + commissions
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;

  -- Sales transactions (legacy table if exists)
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;

  -- Exchange rates
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- V4-2 fix: NULLificar category_id antes de borrar categories
  UPDATE products SET category_id = NULL WHERE store_id = target_store_id;
  DELETE FROM suppliers WHERE store_id = target_store_id;
  DELETE FROM categories WHERE store_id = target_store_id;

  -- Warehouse
  DELETE FROM warehouse_stock WHERE store_id = target_store_id;
  DELETE FROM warehouses WHERE store_id = target_store_id;

  -- Inventory
  DELETE FROM inventory WHERE store_id = target_store_id;
  DELETE FROM inventory_batches WHERE store_id = target_store_id;
  DELETE FROM inventory_snapshots WHERE store_id = target_store_id;

  -- Analytics
  DELETE FROM abc_classifications WHERE store_id = target_store_id;
  DELETE FROM price_change_history WHERE store_id = target_store_id;
  DELETE FROM price_commit_log WHERE store_id = target_store_id;
  DELETE FROM tax_configurations WHERE store_id = target_store_id;

  -- Services
  DELETE FROM received_services WHERE store_id = target_store_id;
  DELETE FROM service_types WHERE store_id = target_store_id;

  -- Fiscal
  DELETE FROM fiscal_closings WHERE store_id = target_store_id;

  -- Catalog (conditional)
  IF p_keep_catalog THEN
    UPDATE products SET stock_current = 0, cost_average = 0, updated_at = NOW() WHERE store_id = target_store_id;
    DELETE FROM product_lots WHERE store_id = target_store_id;
  ELSE
    DELETE FROM product_lots WHERE store_id = target_store_id;
    DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE store_id = target_store_id);
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    DELETE FROM store_cost_templates WHERE store_id = target_store_id;
    DELETE FROM cost_sheet_templates WHERE store_id = target_store_id;
    DELETE FROM products WHERE store_id = target_store_id;
  END IF;

  -- Messaging
  DELETE FROM whatsapp_messages WHERE store_id = target_store_id;
  DELETE FROM whatsapp_invitations WHERE store_id = target_store_id;
  DELETE FROM whatsapp_contacts WHERE store_id = target_store_id;
  DELETE FROM whatsapp_risk_state WHERE store_id = target_store_id;
  DELETE FROM whatsapp_configs WHERE store_id = target_store_id;
  DELETE FROM telegram_messages WHERE store_id = target_store_id;
  DELETE FROM telegram_invitations WHERE store_id = target_store_id;
  DELETE FROM telegram_contacts WHERE store_id = target_store_id;
  DELETE FROM telegram_configs WHERE store_id = target_store_id;

  -- Notifications + snapshots
  DELETE FROM store_notifications WHERE store_id = target_store_id;
  DELETE FROM store_reset_snapshots WHERE store_id = target_store_id;

  -- Audit
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES ('store_reset_completed', 'stores', target_store_id, target_store_id,
    jsonb_build_object('reset_by', v_caller_uid, 'reset_at', now(), 'keep_catalog', p_keep_catalog));
END;

$function$


-- @contract-function name=reset_store_data args="p_store_id uuid, p_keep_catalog boolean" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reset_store_data(p_store_id uuid, p_keep_catalog boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_store_id uuid := p_store_id;
BEGIN
  -- Validación de acceso
  IF NOT public.has_management_access_as(auth.uid(), target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin, manager or encargado of the store.';
  END IF;

  -- Activar restore_mode para bypassear triggers de validación
  PERFORM set_config('app.restore_mode', 'true', true);

  BEGIN
    -- ── 1. Datos transaccionales ──
    DELETE FROM payment_transactions WHERE store_id = target_store_id;
    DELETE FROM transaction_items WHERE transaction_id IN (
      SELECT id FROM transactions WHERE store_id = target_store_id
    );
    DELETE FROM transactions WHERE store_id = target_store_id;
    DELETE FROM stock_movements WHERE store_id = target_store_id;
    DELETE FROM inventory_movements WHERE store_id = target_store_id;
    DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
    DELETE FROM receipts WHERE store_id = target_store_id;
    DELETE FROM inventory WHERE store_id = target_store_id;
    DELETE FROM cash_closures WHERE store_id = target_store_id;

    -- ── 2. Catálogo de productos ──
    IF p_keep_catalog THEN
      UPDATE products
      SET
        stock_current = 0,
        cost_average = 0,
        updated_at = NOW()
      WHERE store_id = target_store_id;
    ELSE
      DELETE FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE store_id = target_store_id
      );
      DELETE FROM products WHERE store_id = target_store_id;
    END IF;

    -- ── 3. Reconciliación post-restore ──
    -- Después de bypassear triggers, sincronizar products.stock_current
    -- con inventory.quantity. En este punto inventory fue borrado (step 1),
    -- así que todos los productos tendrán stock_current = 0 (correcto para
    -- un reset). La reconciliación es defensiva: si en el futuro se
    -- reconstruye inventory SIN disparar triggers (otro restore), este
    -- código asegura consistencia.
    UPDATE products p
    SET stock_current = COALESCE(
      (SELECT SUM(inv.quantity) FROM inventory inv
       WHERE inv.product_id = p.id AND inv.store_id = p.store_id),
      0
    )
    WHERE p.store_id = target_store_id;

    -- Desactivar restore_mode
    PERFORM set_config('app.restore_mode', 'false', true);

    RAISE NOTICE 'Store % reset completed. Keep catalog: %. Post-restore reconciliation done.', target_store_id, p_keep_catalog;
  EXCEPTION WHEN OTHERS THEN
    -- Asegurar que restore_mode se desactiva incluso si hay error
    PERFORM set_config('app.restore_mode', 'false', true);
    RAISE;
  END;
END;
$function$


-- @contract-function name=restore_store_backup args="p_store_id uuid, p_backup_payload jsonb, p_mode text, p_confirmation_token text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text DEFAULT 'preview'::text, p_confirmation_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session_id UUID;
  v_store_exists BOOLEAN;
  v_backup_format TEXT;
  v_backup_store_id TEXT;
  v_backup_version TEXT;
  v_tables_in_backup TEXT[];
  v_active_registry_tables TEXT[];
  v_table_count INTEGER;
  v_missing_tables TEXT[];
  v_extra_tables TEXT[];
  v_tier_violations JSONB;
  v_source_of_truth_violations JSONB;
  v_total_rows INTEGER := 0;
  v_table_stats JSONB := '{}'::jsonb;
  v_fk_integrity JSONB;
  v_preview_passed BOOLEAN;
  v_initiator UUID;
  rec RECORD;
  v_rows JSONB;
  v_row_count INTEGER;
  v_lock_token TEXT;
  v_pre_restore_snapshot JSONB;
  v_post_restore_validation JSONB;
  v_tables_processed INTEGER := 0;
  v_tables_failed INTEGER := 0;
  v_existing_session_id UUID;
  v_filter_strategy TEXT;
  v_parent_table TEXT;
  v_parent_fk TEXT;
  v_writable_cols TEXT[];
  v_cols_sql TEXT;
  v_insert_sql TEXT;
  v_rows_inserted BIGINT;
  v_inv_row JSONB;
  v_sync_count INTEGER;
  v_tier_ordered_tables TEXT[];
  v_cols_only TEXT;
  v_caller_role TEXT;
  v_token_session_id UUID;
BEGIN
  -- ============================================================
  -- SECURITY CHECK: Only admin can call this function
  -- ============================================================
  -- When called with user JWT (not service role), auth.uid() returns the user's ID
  -- We check their role in profiles
  v_initiator := auth.uid();
  IF v_initiator IS NOT NULL AND v_initiator != '00000000-0000-0000-0000-000000000000'::UUID THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_initiator;
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar restore_store_backup (rol actual: %)', COALESCE(v_caller_role, 'NULL');
    END IF;
  END IF;
  -- If auth.uid() is NULL, it's the service role — allow

  v_initiator := COALESCE(v_initiator, '00000000-0000-0000-0000-000000000000'::UUID);

  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND';
  END IF;

  v_backup_format := p_backup_payload->'meta'->>'format';
  IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT';
  END IF;

  v_backup_store_id := p_backup_payload->'meta'->>'storeId';
  IF v_backup_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID';
  END IF;

  v_backup_version := p_backup_payload->'meta'->>'version';

  INSERT INTO public.restore_sessions (
    store_id, initiated_by, status, mode, backup_payload
  ) VALUES (
    p_store_id, v_initiator, 'PREPARING', p_mode, p_backup_payload
  ) RETURNING id INTO v_session_id;

  SELECT array_agg(key) INTO v_tables_in_backup
  FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) k;

  v_table_count := COALESCE(array_length(v_tables_in_backup, 1), 0);

  SELECT array_agg(table_name ORDER BY tier, table_name) INTO v_active_registry_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE;

  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(v_tables_in_backup) AS t
  WHERE NOT (t = ANY(v_active_registry_tables));

  SELECT array_agg(t) INTO v_extra_tables
  FROM unnest(v_active_registry_tables) AS t
  WHERE NOT (t = ANY(v_tables_in_backup));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_name', table_name, 'expected', expected_sot, 'actual', source_of_truth
  )), '[]'::jsonb) INTO v_source_of_truth_violations
  FROM (VALUES
    ('inventory', 'primary'), ('stock_movements', 'audit'),
    ('kardex_entries', 'audit'), ('products', 'primary')
  ) AS v(table_name, expected_sot)
  JOIN public.backup_table_registry r USING (table_name)
  WHERE r.source_of_truth != v.expected_sot;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'child_table', r.table_name, 'parent_table', r.parent_table,
    'issue', 'parent not found before child'
  )), '[]'::jsonb) INTO v_tier_violations
  FROM public.backup_table_registry r
  WHERE r.excluded_from_restore = FALSE AND r.parent_table IS NOT NULL
    AND r.table_name = ANY(v_tables_in_backup)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o(t, ord)
      WHERE o.t = r.parent_table AND o.ord < (
        SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
        WHERE o2.t = r.table_name
      )
    );

  FOR rec IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
    v_rows := p_backup_payload->'tables'->rec.table_name;
    v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
                        THEN jsonb_array_length(v_rows) ELSE 0 END;
    v_total_rows := v_total_rows + v_row_count;
    v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name], to_jsonb(v_row_count));
  END LOOP;

  SELECT public.validate_pre_restore_fk_integrity(p_store_id) INTO v_fk_integrity;

  v_preview_passed := TRUE;
  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    PERFORM 1 FROM unnest(v_missing_tables) AS mt
    WHERE NOT EXISTS (SELECT 1 FROM public.backup_table_registry r WHERE r.table_name = mt);
    IF FOUND THEN v_preview_passed := FALSE; END IF;
  END IF;
  IF v_tier_violations != '[]'::jsonb THEN v_preview_passed := FALSE; END IF;
  IF v_source_of_truth_violations != '[]'::jsonb THEN v_preview_passed := FALSE; END IF;

  UPDATE public.restore_sessions
  SET status = 'DRY_RUN',
      post_restore_validation = jsonb_build_object(
        'mode', p_mode, 'backup_store_id', v_backup_store_id,
        'backup_version', v_backup_version, 'target_store_id', p_store_id,
        'table_count_in_backup', v_table_count,
        'active_tables_in_registry', array_length(v_active_registry_tables, 1),
        'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
        'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
        'tier_violations', v_tier_violations,
        'source_of_truth_violations', v_source_of_truth_violations,
        'total_rows_in_backup', v_total_rows, 'table_stats', v_table_stats,
        'fk_integrity', v_fk_integrity
      ),
      fk_integrity_check = v_fk_integrity, preview_passed = v_preview_passed
  WHERE id = v_session_id;

  IF p_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'session_id', v_session_id, 'mode', 'preview',
      'target_store_id', p_store_id, 'backup_store_id', v_backup_store_id,
      'backup_version', v_backup_version,
      'table_count_in_backup', v_table_count,
      'active_tables_in_registry', array_length(v_active_registry_tables, 1),
      'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
      'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
      'tier_violations', v_tier_violations,
      'source_of_truth_violations', v_source_of_truth_violations,
      'total_rows_in_backup', v_total_rows, 'table_stats', v_table_stats,
      'fk_integrity', v_fk_integrity, 'preview_passed', v_preview_passed,
      'next_step', CASE WHEN v_preview_passed THEN 'Preview OK. Get token, then execute.'
                        ELSE 'Preview FAILED.' END
    );
  END IF;

  IF p_mode != 'execute' THEN RAISE EXCEPTION 'ERR_INVALID_MODE'; END IF;
  IF NOT v_preview_passed THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Preview failed', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_PREVIEW_FAILED';
  END IF;

  -- ============================================================
  -- TOKEN VALIDATION: Find the DRY_RUN session with this token
  -- ============================================================
  IF p_confirmation_token IS NULL OR p_confirmation_token = '' THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Missing token', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_MISSING_TOKEN';
  END IF;

  SELECT id INTO v_token_session_id
  FROM public.restore_sessions
  WHERE store_id = p_store_id
    AND confirmation_token = p_confirmation_token
    AND status = 'DRY_RUN'
    AND preview_passed = TRUE
  ORDER BY initiated_at DESC
  LIMIT 1;

  IF v_token_session_id IS NULL THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Invalid token', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_INVALID_TOKEN';
  END IF;

  -- ============================================================
  -- INVALIDATE TOKEN: Mark the preview session as EXECUTING
  -- so it cannot be reused. The current session (v_session_id)
  -- will be the one that completes.
  -- ============================================================
  UPDATE public.restore_sessions
  SET status = 'EXECUTING',
      confirmation_token = NULL  -- clear token so it can't be reused
  WHERE id = v_token_session_id;

  IF (v_fk_integrity->>'can_proceed') != 'true' THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='FK blockers', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_FK_BLOCKERS';
  END IF;

  v_lock_token := 'restore_store_' || p_store_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_token));

  UPDATE public.restore_sessions SET lock_acquired=TRUE, lock_token=v_lock_token, status='EXECUTING' WHERE id=v_session_id;

  SELECT public.create_pre_restore_snapshot(p_store_id) INTO v_pre_restore_snapshot;
  UPDATE public.restore_sessions SET pre_restore_snapshot=v_pre_restore_snapshot WHERE id=v_session_id;

  SET LOCAL app.restore_mode = 'true';

  -- DELETE (tier DESC = children before parents)
  SELECT array_agg(table_name ORDER BY tier DESC, table_name DESC)
  INTO v_tier_ordered_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE
    AND table_name = ANY(v_active_registry_tables)
    AND table_name != 'stores';

  FOR rec IN SELECT unnest(v_tier_ordered_tables) AS table_name LOOP
    CONTINUE WHEN rec.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    SELECT filter_strategy, parent_table, parent_foreign_key
    INTO v_filter_strategy, v_parent_table, v_parent_fk
    FROM public.backup_table_registry
    WHERE table_name = rec.table_name;

    BEGIN
      IF v_filter_strategy = 'via_origin_dest' THEN
        EXECUTE format('DELETE FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1', rec.table_name) USING p_store_id;
      ELSIF v_filter_strategy = 'via_entity_id' THEN
        EXECUTE format('DELETE FROM public.%I WHERE entity_id = $1', rec.table_name) USING p_store_id;
      ELSIF v_filter_strategy = 'store_id' THEN
        EXECUTE format('DELETE FROM public.%I WHERE store_id = $1', rec.table_name) USING p_store_id;
      ELSIF v_filter_strategy = 'via_parent' AND v_parent_table IS NOT NULL AND v_parent_fk IS NOT NULL THEN
        BEGIN
          EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE store_id = $1)', rec.table_name, v_parent_fk, v_parent_table) USING p_store_id;
        EXCEPTION WHEN undefined_column THEN
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1)', rec.table_name, v_parent_fk, v_parent_table) USING p_store_id;
          EXCEPTION WHEN undefined_column THEN
            BEGIN
              EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE entity_id = $1)', rec.table_name, v_parent_fk, v_parent_table) USING p_store_id;
            EXCEPTION WHEN OTHERS THEN
              RAISE NOTICE 'Could not delete from % - skipping', rec.table_name;
            END;
          END;
        END;
      END IF;
      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_delete_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_DELETE_FAILED: % - %', rec.table_name, SQLERRM;
    END;
  END LOOP;

  -- INSERT (tier ASC = parents before children)
  SELECT array_agg(table_name ORDER BY tier ASC, table_name ASC)
  INTO v_tier_ordered_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE
    AND table_name = ANY(v_active_registry_tables);

  FOR rec IN SELECT unnest(v_tier_ordered_tables) AS table_name LOOP
    CONTINUE WHEN rec.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    v_rows := p_backup_payload->'tables'->rec.table_name;
    IF v_rows IS NULL OR jsonb_typeof(v_rows) != 'array' OR jsonb_array_length(v_rows) = 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      IF rec.table_name = 'stores' THEN
        IF jsonb_array_length(v_rows) > 0 THEN
          v_inv_row := v_rows->0;
          UPDATE public.stores SET
            name = v_inv_row->>'name', slug = v_inv_row->>'slug',
            address = v_inv_row->>'address', phone = v_inv_row->>'phone',
            email = v_inv_row->>'email', reeup = v_inv_row->>'reeup',
            nit = v_inv_row->>'nit', bank_account = v_inv_row->>'bank_account'
          WHERE id = p_store_id;
        END IF;
      ELSE
        SELECT public.get_table_writable_columns(rec.table_name) INTO v_writable_cols;
        IF v_writable_cols IS NULL OR array_length(v_writable_cols, 1) IS NULL THEN
          RAISE EXCEPTION 'No writable columns for %', rec.table_name;
        END IF;

        SELECT string_agg(
          column_name || ' ' ||
          CASE WHEN data_type = 'USER-DEFINED' THEN udt_name
               WHEN data_type = 'ARRAY' THEN udt_name
               ELSE data_type
          END,
          ', ' ORDER BY ordinal_position
        )
        INTO v_cols_sql
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = rec.table_name
          AND column_name = ANY(v_writable_cols);

        v_cols_only := array_to_string(v_writable_cols, ', ');

        v_insert_sql := format(
          'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_to_recordset($1) AS x(%s)',
          rec.table_name, v_cols_only, v_cols_only, v_cols_sql
        );

        EXECUTE v_insert_sql USING v_rows;
        GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
        v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_inserted'], to_jsonb(v_rows_inserted));
      END IF;
      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_insert_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_INSERT_FAILED: % - %', rec.table_name, SQLERRM;
    END;
  END LOOP;

  -- SYNC products.stock_current from inventory
  UPDATE public.products p SET stock_current = i.quantity, updated_at = NOW()
  FROM public.inventory i
  WHERE i.product_id = p.id AND i.store_id = p.store_id AND p.store_id = p_store_id;
  GET DIAGNOSTICS v_sync_count = ROW_COUNT;
  v_table_stats := jsonb_set(v_table_stats, ARRAY['products_stock_current_synced'], to_jsonb(v_sync_count));

  SET LOCAL app.restore_mode = 'false';

  SELECT public.validate_post_restore(p_store_id, p_backup_payload) INTO v_post_restore_validation;

  IF (v_post_restore_validation->>'overall_status') != 'PASS' THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Validation failed',
      post_restore_validation=v_post_restore_validation,
      tables_processed=v_tables_processed, tables_failed=v_tables_failed,
      total_rows_processed=v_total_rows, failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_POST_RESTORE_VALIDATION_FAILED: %', v_post_restore_validation;
  END IF;

  -- ============================================================
  -- MARK BOTH SESSIONS AS COMPLETED
  -- The preview session (v_token_session_id) is marked COMPLETED too
  -- so its token is fully invalidated
  -- ============================================================
  UPDATE public.restore_sessions SET status='COMPLETED',
    post_restore_validation=v_post_restore_validation,
    tables_processed=v_tables_processed, tables_failed=v_tables_failed,
    total_rows_processed=v_total_rows, completed_at=NOW()
  WHERE id = v_session_id;

  UPDATE public.restore_sessions SET status='COMPLETED',
    completed_at=NOW(),
    failure_reason='Token consumed by session ' || v_session_id::text
  WHERE id = v_token_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id, 'mode', 'execute',
    'target_store_id', p_store_id, 'backup_store_id', v_backup_store_id,
    'status', 'COMPLETED',
    'tables_processed', v_tables_processed, 'tables_failed', v_tables_failed,
    'total_rows_processed', v_total_rows,
    'products_stock_current_synced', v_sync_count,
    'validation', v_post_restore_validation
  );

EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason=SQLERRM,
      tables_processed=v_tables_processed, tables_failed=v_tables_failed,
      total_rows_processed=v_total_rows, failed_at=NOW() WHERE id=v_session_id;
    -- Also mark the token session as failed if it exists
    IF v_token_session_id IS NOT NULL THEN
      UPDATE public.restore_sessions SET status='FAILED',
        failure_reason='Token session failed: ' || SQLERRM,
        failed_at=NOW()
      WHERE id = v_token_session_id AND status = 'EXECUTING';
    END IF;
    RAISE;
END;
$function$


-- @contract-function name=restore_transaction_snapshot args="p_migration_id text, p_tx_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.restore_transaction_snapshot(p_migration_id text, p_tx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_xid xid;
  v_store_id uuid;
  v_snapshot_count int;
  v_snap_tx jsonb;
  v_snap_items jsonb;
  v_snap_pay jsonb;
  v_snap_sm_target jsonb;
  v_snap_product jsonb;
  v_tx_writable_cols text[];
  v_ti_writable_cols text[];
  v_pt_writable_cols text[];
  v_sm_writable_cols text[];
  v_tx_col_list text;
  v_ti_col_list text;
  v_pt_col_list text;
  v_sm_col_list text;
  v_actual_stock numeric;
  v_tgenabled_before text;
  v_tgenabled_after text;
  v_restored_count int := 0;
  v_updated_bal_count int := 0;
  v_updated_stock_count int := 0;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: restore_transaction_snapshot requires service_role'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT data INTO v_snap_tx FROM public.migration_history_snapshots
    WHERE migration_id = p_migration_id AND table_name = 'transactions' LIMIT 1;
  IF v_snap_tx IS NULL THEN RAISE EXCEPTION 'ERR_SNAPSHOT_MISSING: transactions'; END IF;
  IF (v_snap_tx->>'id')::uuid IS DISTINCT FROM p_tx_id THEN
    RAISE EXCEPTION 'ERR_SNAPSHOT_TX_ID_MISMATCH: snapshot % != p_tx_id %', v_snap_tx->>'id', p_tx_id;
  END IF;
  v_store_id := (v_snap_tx->>'store_id')::uuid;
  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));
  v_xid := pg_current_xact_id();
  BEGIN
    INSERT INTO public.transaction_recovery_ledger (migration_id, transaction_id, recovered_by, rpc_session_xid)
    VALUES (p_migration_id, p_tx_id, NULL, v_xid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ERR_RECOVERY_ALREADY_EXECUTED: ledger already has (migration_id=%, tx_id=%)',
      p_migration_id, p_tx_id USING ERRCODE = 'P0001';
  END;
  SELECT COUNT(*) INTO v_snapshot_count FROM public.migration_history_snapshots WHERE migration_id = p_migration_id;
  IF v_snapshot_count != 18 THEN RAISE EXCEPTION 'ERR_SNAPSHOT_COUNT: expected 18, found %', v_snapshot_count USING ERRCODE = 'P0001'; END IF;
  SELECT data INTO v_snap_items FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'transaction_items' LIMIT 1;
  SELECT data INTO v_snap_pay FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'payment_transactions' LIMIT 1;
  SELECT data INTO v_snap_sm_target FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'stock_movements' LIMIT 1;
  SELECT data INTO v_snap_product FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'products' LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN
    RAISE EXCEPTION 'ERR_PRECONDITION: transactions row still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE id = (v_snap_sm_target->>'id')::uuid) THEN
    RAISE EXCEPTION 'ERR_PRECONDITION: target stock_movement still exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = (v_snap_product->>'id')::uuid) THEN
    RAISE EXCEPTION 'ERR_PRECONDITION: product not found';
  END IF;
  SELECT tgenabled INTO v_tgenabled_before FROM pg_trigger WHERE tgname = 'trg_validate_payment_invariants' AND tgrelid = 'public.payment_transactions'::regclass;
  SET LOCAL app.restore_mode = 'true';
  v_tx_writable_cols := public.get_table_writable_columns('transactions');
  v_ti_writable_cols := public.get_table_writable_columns('transaction_items');
  v_pt_writable_cols := public.get_table_writable_columns('payment_transactions');
  v_sm_writable_cols := public.get_table_writable_columns('stock_movements');
  IF 'amount_cup' = ANY(v_pt_writable_cols) THEN RAISE EXCEPTION 'ERR_GENERATED_NOT_EXCLUDED'; END IF;
  SELECT string_agg(format('%I', col), ', ') INTO v_tx_col_list FROM unnest(v_tx_writable_cols) AS col;
  SELECT string_agg(format('%I', col), ', ') INTO v_ti_col_list FROM unnest(v_ti_writable_cols) AS col;
  SELECT string_agg(format('%I', col), ', ') INTO v_pt_col_list FROM unnest(v_pt_writable_cols) AS col;
  SELECT string_agg(format('%I', col), ', ') INTO v_sm_col_list FROM unnest(v_sm_writable_cols) AS col;
  EXECUTE format('INSERT INTO public.transactions (%s) SELECT %s FROM jsonb_populate_record(NULL::public.transactions, $1)', v_tx_col_list, v_tx_col_list) USING v_snap_tx;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_TX: %', v_restored_count; END IF;
  EXECUTE format('INSERT INTO public.payment_transactions (%s) SELECT %s FROM jsonb_populate_record(NULL::public.payment_transactions, $1)', v_pt_col_list, v_pt_col_list) USING v_snap_pay;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_PAY: %', v_restored_count; END IF;
  EXECUTE format('INSERT INTO public.transaction_items (%s) SELECT %s FROM jsonb_populate_record(NULL::public.transaction_items, $1)', v_ti_col_list, v_ti_col_list) USING v_snap_items;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_ITEMS: %', v_restored_count; END IF;
  EXECUTE format('INSERT INTO public.stock_movements (%s) SELECT %s FROM jsonb_populate_record(NULL::public.stock_movements, $1)', v_sm_col_list, v_sm_col_list) USING v_snap_sm_target;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_SM_TARGET: %', v_restored_count; END IF;
  UPDATE public.stock_movements sm SET balance_after = (mhs.data->>'balance_after')::numeric FROM public.migration_history_snapshots mhs WHERE mhs.migration_id = p_migration_id AND mhs.table_name = 'stock_movements_subsequent' AND sm.id::text = mhs.row_id AND sm.balance_after = (mhs.data->>'balance_after')::numeric + 29;
  GET DIAGNOSTICS v_updated_bal_count = ROW_COUNT;
  IF v_updated_bal_count != 13 THEN RAISE EXCEPTION 'ERR_ANTI_DRIFT_MOVEMENTS: % drifted', 13 - v_updated_bal_count USING ERRCODE = 'P0001'; END IF;
  UPDATE public.products SET stock_current = (v_snap_product->>'stock_current')::numeric WHERE id = (v_snap_product->>'id')::uuid AND stock_current = (v_snap_product->>'stock_current')::numeric + 29;
  GET DIAGNOSTICS v_updated_stock_count = ROW_COUNT;
  IF v_updated_stock_count != 1 THEN RAISE EXCEPTION 'ERR_ANTI_DRIFT_STOCK: % rows', v_updated_stock_count USING ERRCODE = 'P0001'; END IF;
  SET LOCAL app.restore_mode = 'false';
  SELECT tgenabled INTO v_tgenabled_after FROM pg_trigger WHERE tgname = 'trg_validate_payment_invariants' AND tgrelid = 'public.payment_transactions'::regclass;
  IF v_tgenabled_after IS DISTINCT FROM v_tgenabled_before THEN RAISE EXCEPTION 'ERR_POSTCONDITION_TRIGGER'; END IF;
  IF current_setting('app.restore_mode', true) = 'true' THEN RAISE EXCEPTION 'ERR_POSTCONDITION_GUC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN RAISE EXCEPTION 'ERR_POSTCONDITION_TX'; END IF;
  SELECT stock_current INTO v_actual_stock FROM public.products WHERE id = (v_snap_product->>'id')::uuid;
  IF v_actual_stock IS DISTINCT FROM (v_snap_product->>'stock_current')::numeric THEN RAISE EXCEPTION 'ERR_POSTCONDITION_STOCK'; END IF;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'HISTORICAL_DELETE_RECOVERY', 'transactions', p_tx_id, v_store_id, NULL,
    jsonb_build_object('migration_id_recovered', p_migration_id, 'recovery_timestamp', NOW(), 'recovery_method', 'restore_transaction_snapshot RPC v2.3.8+lock', 'ledger_xid', v_xid::text, 'advisory_lock', 'pg_advisory_xact_lock(hashtext(store_id))', 'rpc_version', 'v2.3.8+lock')
  );
  v_result := jsonb_build_object('status', 'success', 'migration_id', p_migration_id, 'transaction_id', p_tx_id, 'ledger_xid', v_xid::text, 'advisory_lock_acquired', true, 'store_id', v_store_id, 'rows_restored', jsonb_build_object('transactions', 1, 'transaction_items', 1, 'payment_transactions', 1, 'stock_movements_target', 1), 'rows_updated', jsonb_build_object('stock_movements_subsequent', v_updated_bal_count, 'products', v_updated_stock_count), 'rpc_version', 'v2.3.8+lock');
  RETURN v_result;
END;
$function$


-- @contract-function name=reverse_cash_flow_document args="p_document_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_cash_flow_document(p_document_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_doc public.cash_flow_documents%ROWTYPE;
  v_reason text;
  v_contra_id uuid;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_cash_flow_in numeric := 0;
  v_cash_flow_out numeric := 0;
  v_cash_refunds numeric := 0;
  v_cash_recoveries numeric := 0;
  v_expected_cash numeric := 0;
  v_balance_currency numeric := 0;
  v_shift RECORD;
BEGIN
  -- 1. Documento con lock de fila (evita doble anulación concurrente)
  SELECT * INTO v_doc FROM public.cash_flow_documents
    WHERE id = p_document_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_DOCUMENT_NOT_FOUND';
  END IF;

  -- 2. AUTH actor-explícito contra la tienda del documento + rol superior
  --    (anular exige admin/manager/encargado — doctrina de reversas)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_doc.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(v_caller_uid, v_doc.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: anular requiere admin, manager o encargado';
  END IF;

  -- 3. Motivo obligatorio (>= 3 caracteres, como el resto de reversas)
  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_TOO_LONG';
  END IF;

  -- 4. Advisory lock por tienda (serializa contra creaciones concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(v_doc.store_id::text));

  -- 5. Estado: solo un confirmado puede anularse (idempotencia de anulación)
  IF v_doc.status <> 'confirmado' THEN
    RAISE EXCEPTION 'ERR_ALREADY_ANNULLED: status=%', v_doc.status;
  END IF;

  -- 6. Anular un INGRESO saca dinero de la caja (fila contra 'out'): exigir
  --    efectivo disponible suficiente para absorber la reversión. Anular un
  --    EGRESO devuelve dinero ('in'): siempre físicamente posible.
  --    El disponible se calcula con la fórmula v2.23.0 (incluye el término
  --    de reembolsos en efectivo — MISIÓN DE SEGUIMIENTO 2026-10-21).
  IF v_doc.doc_type = 'ingreso' THEN
    SELECT * INTO v_shift FROM public.cash_closures
      WHERE store_id = v_doc.store_id AND status = 'pendiente'
      ORDER BY created_at DESC LIMIT 1;
    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'ERR_NO_OPEN_SHIFT: no hay turno abierto para registrar la reversión del efectivo';
    END IF;
    SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
      FROM public.transactions
      WHERE store_id = v_doc.store_id AND status = 'completed'
        AND created_at > v_shift.created_at AND created_at <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('receipt', 'service')
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type IN ('production_order', 'work')
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
      FROM public.commission_payments
      WHERE store_id = v_doc.store_id AND status = 'paid' AND payment_method = 'cash'
        AND paid_at > v_shift.created_at AND paid_at <= 'infinity'::timestamptz;
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cup ELSE 0 END), 0)
      INTO v_cash_flow_in, v_cash_flow_out
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'cash_flow'
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_refunds
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'devolution' AND direction = 'refund'
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    -- MISIÓN DE CIERRE (2026-10-24 §4): recuperaciones simétricas — el dinero
    -- que VOLVIÓ al cajón por reversiones de devoluciones suma al esperado.
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_recoveries
      FROM public.payment_transactions
      WHERE store_id = v_doc.store_id AND payment_method = 'cash'
        AND ref_type = 'devolution' AND direction = 'recovery'
        AND payment_date > v_shift.created_at AND payment_date <= 'infinity'::timestamptz;
    v_opening := COALESCE(v_shift.opening_balance, 0);
    v_expected_cash := v_opening + v_cash_sales + v_cash_production + v_cash_flow_in
                       - v_cash_outflows - v_cash_commissions - v_cash_flow_out
                       - v_cash_refunds + v_cash_recoveries;
    -- MISIÓN POST-MERGE 2026-10-24: anular un ingreso retira BILLETES de su
    -- moneda del cajón; el saldo físico de ESA moneda no puede quedar en
    -- negativo (el canónico con la otra moneda no compensa billetes).
    SELECT COALESCE((public.get_cash_currency_summary(v_doc.store_id, NULL, 'infinity'::timestamptz)
                     -> 'net' ->> v_doc.currency)::numeric, 0)
      INTO v_balance_currency;
    IF v_doc.amount > v_balance_currency + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CURRENCY: anular este ingreso dejaría el saldo físico % en negativo (disponible=%, reversión=%)', v_doc.currency, round(v_balance_currency, 2), round(v_doc.amount, 2);
    END IF;
    IF v_doc.amount_cup > v_expected_cash + 0.005 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_CASH: anular este ingreso dejaría el efectivo esperado en negativo (disponible=%, reversión=%)', round(v_expected_cash, 2), round(v_doc.amount_cup, 2);
    END IF;
  END IF;

  -- 7. Fila CONTRARIA en el ledger (nunca DELETE ni UPDATE de importes; la
  --    corrección física ocurre AHORA — payment_date = now()). Si el documento
  --    original pertenecía a un turno ya cerrado, ese cierre histórico queda
  --    intacto (sus sumas están congeladas) y la reversión entra a la ventana
  --    del turno actual: procedimiento de corrección sin reabrir historia.
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, payment_date, notes, paid_by,
    idempotency_key, direction
  ) VALUES (
    v_doc.store_id, 'cash_flow', v_doc.id, v_doc.amount, 'cash',
    v_doc.currency, v_doc.exchange_rate, now(),
    'Anulación ' || v_doc.document_number || ': ' || v_reason,
    v_caller_uid,
    'cf-anul-' || v_doc.id::text,
    CASE v_doc.doc_type WHEN 'ingreso' THEN 'out' ELSE 'in' END
  )
  RETURNING id INTO v_contra_id;

  -- 8. Estado terminal + trazabilidad completa de la anulación
  UPDATE public.cash_flow_documents SET
    status = 'anulado',
    annulled_at = now(),
    annulled_by = v_caller_uid,
    annulment_reason = v_reason,
    annulment_payment_transaction_id = v_contra_id
  WHERE id = v_doc.id;

  -- 9. Auditoría atómica
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_doc.store_id, 'CASH_FLOW_ANNULLED', 'cash_flow_documents', v_doc.id,
    jsonb_build_object(
      'document_number', v_doc.document_number,
      'doc_type', v_doc.doc_type,
      'concept', v_doc.concept,
      'amount', v_doc.amount,
      'currency', v_doc.currency,
      'amount_cup', v_doc.amount_cup,
      'reason', v_reason,
      'before_status', v_doc.status,
      'after_status', 'anulado',
      'annulment_payment_transaction_id', v_contra_id,
      'original_payment_transaction_id', v_doc.payment_transaction_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'document_id', v_doc.id,
    'document_number', v_doc.document_number,
    'status_doc', 'anulado',
    'annulled_at', now(),
    'annulled_by', v_caller_uid,
    'annulment_payment_transaction_id', v_contra_id
  );
END;
$function$


-- @contract-function name=reverse_commissions_on_sale_void args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_commissions_on_sale_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment RECORD;
  v_flagged_count int := 0;
BEGIN
  -- Solo disparar cuando status cambia a voided o reversed
  IF NEW.status NOT IN ('voided', 'reversed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Buscar commission_payments cuyo período incluye la transacción
  FOR v_payment IN
    SELECT cp.*
    FROM public.commission_payments cp
    WHERE cp.store_id = NEW.store_id
      AND cp.status IN ('approved', 'paid')
      AND cp.period_start <= NEW.created_at
      AND cp.period_end >= NEW.created_at
  LOOP
    -- Opción A: marcar como flagged_for_review (NO cancelar)
    UPDATE public.commission_payments SET
      status = 'flagged_for_review',
      manual_adjustment_reason = COALESCE(manual_adjustment_reason, '') ||
        E'\n[FLAGGED] Contains sale ' || NEW.id || ' (' || NEW.status || '). Manual review required.',
      updated_at = NOW()
    WHERE id = v_payment.id;

    v_flagged_count := v_flagged_count + 1;

    -- Audit log
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('COMMISSION_FLAGGED_FOR_REVIEW', 'commission_payments', v_payment.id::text,
      v_payment.store_id, NEW.seller_id,
      jsonb_build_object(
        'original_payment_id', v_payment.id,
        'voided_sale_id', NEW.id,
        'sale_status', NEW.status,
        'original_amount', v_payment.final_amount,
        'original_status', v_payment.status,
        'reason', 'Sale voided/reversed — manual review required'
      ));
  END LOOP;

  -- Si no se flaggeó ninguna comisión, no es error (puede que no haya comisión para ese período)
  RETURN NEW;
END;
$function$


-- @contract-function name=reverse_devolution args="p_devolution_id uuid, p_reason text, p_user_id uuid, p_recovery jsonb" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_recovery jsonb DEFAULT NULL::jsonb)
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
  v_uc_dev NUMERIC;
  v_store_id UUID;
  v_rec JSONB;              -- componente de recuperación solicitado (elemento jsonb)
  v_refund RECORD;         -- fila refund de esta devolución
  v_credit RECORD;         -- fila de crédito de tienda de esta devolución
  v_credit_outstanding NUMERIC := 0;
  v_requested_cup INTEGER := 0;
  v_requested_usd INTEGER := 0;
  v_expected_cup INTEGER := 0;
  v_expected_usd INTEGER := 0;
  v_rec_date TIMESTAMPTZ;
  v_rec_method TEXT;
  v_recovered JSONB := '[]'::jsonb;
BEGIN
  -- 0) tienda ANTES del lock (store_id es inmutable en devolutions)
  SELECT store_id INTO v_store_id FROM public.devolutions WHERE id = p_devolution_id;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;

  -- 1) advisory lock por tienda (misma llave que create_devolution_v2 /
  --    create_cash_flow_document / close_cash_shift): serializa la reversión
  --    contra reembolsos/entregas/cierres concurrentes del cajón físico.
  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));

  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  -- 2) lock de la venta original (serializa contra el tope de reembolso de
  --    create_devolution_v2, que lockea la venta ANTES de leer el tope)
  IF v_dev.original_transaction_id IS NOT NULL THEN
    PERFORM 1 FROM public.transactions WHERE id = v_dev.original_transaction_id FOR UPDATE;
  END IF;

  -- 3) efecto financiero de ESTA devolución (validado TODO antes de escribir)
  SELECT
    COUNT(*) FILTER (WHERE pt.currency = 'CUP'),
    COUNT(*) FILTER (WHERE pt.currency = 'USD')
    INTO v_expected_cup, v_expected_usd
  FROM public.payment_transactions pt
  WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_devolution_id AND pt.direction = 'refund';

  IF v_expected_cup + v_expected_usd > 0 THEN
    IF p_recovery IS NULL THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_REFUND_NOT_RECOVERED: la devolución tiene reembolso(s) liquidado(s) (% componente CUP, % componente USD) y el dinero no ha vuelto a la caja. La reversión es ATÓMICA con la recuperación: envíe p_recovery = [{currency, method, operation_date?, notes?}] con la moneda y el riel reales de cobro (el importe lo fija el servidor). Una reversión documental no puede liberar el tope de reembolso como si el dinero hubiera regresado.',
        v_expected_cup, v_expected_usd;
    END IF;
    IF jsonb_typeof(p_recovery) <> 'array' THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: p_recovery debe ser un array jsonb de componentes {currency, method, operation_date?, notes?}';
    END IF;
    SELECT
      COUNT(*) FILTER (WHERE upper(btrim(comp->>'currency')) = 'CUP'),
      COUNT(*) FILTER (WHERE upper(btrim(comp->>'currency')) = 'USD')
      INTO v_requested_cup, v_requested_usd
    FROM jsonb_array_elements(p_recovery) comp;
    IF v_requested_cup <> v_expected_cup OR v_requested_usd <> v_expected_usd THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_COMPONENTS: los componentes de recuperación deben cubrir EXACTAMENTE las monedas reembolsadas (esperado: % CUP + % USD; recibido: % CUP + % USD). La recuperación de una moneda no compensa la otra.',
        v_expected_cup, v_expected_usd, v_requested_cup, v_requested_usd;
    END IF;
    -- validación de cada componente (antes de cualquier escritura)
    FOR v_rec IN SELECT comp FROM jsonb_array_elements(p_recovery) comp LOOP
      v_rec_method := lower(btrim(COALESCE(v_rec->>'method', '')));
      IF upper(btrim(COALESCE(v_rec->>'currency', ''))) NOT IN ('CUP', 'USD') THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: moneda de recuperación % no reconocida (CUP|USD)',
          COALESCE(v_rec->>'currency', '');
      END IF;
      IF v_rec_method NOT IN ('cash', 'transfer', 'zelle') THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: método de cobro % no reconocido (cash|transfer|zelle)',
          COALESCE(v_rec->>'method', '');
      END IF;
      -- espejo del invariante PT005 de payment_transactions (fail-closed limpio)
      IF v_rec_method = 'zelle' AND upper(btrim(v_rec->>'currency')) = 'CUP' THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: zelle no opera en CUP (riel USD)';
      END IF;
      IF length(COALESCE(v_rec->>'notes', '')) > 500 THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_INVALID: notes > 500 caracteres';
      END IF;
      v_rec_date := NULL;
      IF COALESCE(v_rec->>'operation_date', '') <> '' THEN
        v_rec_date := (v_rec->>'operation_date')::timestamptz;
      END IF;
      IF v_rec_date IS NOT NULL THEN
        PERFORM public.validate_operation_date(v_rec_date, v_dev.store_id);
      END IF;
      IF EXISTS (SELECT 1 FROM public.payment_transactions
                 WHERE ref_type = 'devolution' AND ref_id = p_devolution_id
                   AND direction = 'recovery'
                   AND currency = upper(btrim(v_rec->>'currency'))) THEN
        RAISE EXCEPTION 'ERR_DEVOLUTION_ALREADY_RECOVERED: ya existe una recuperación en % para esta devolución (idempotencia dev-%%-recovery-%%)',
          upper(btrim(v_rec->>'currency'));
      END IF;
    END LOOP;
  ELSIF p_recovery IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_RECOVERY_UNNECESSARY: la devolución no tiene reembolsos monetarios que recuperar (reversión documental pura)';
  END IF;

  -- 4) RECUPERACIÓN: una fila por componente, importe y tasa FIJADOS por el
  --    servidor desde la fila refund de esa moneda (misma moneda, mismo
  --    importe, misma tasa → el canónico generado espeja y cancela EXACTO).
  --    direction='recovery' = entrada real de dinero por el riel declarado.
  FOR v_refund IN
    SELECT pt.currency, pt.payment_method, pt.amount, pt.exchange_rate
    FROM public.payment_transactions pt
    WHERE pt.ref_type = 'devolution' AND pt.ref_id = p_devolution_id AND pt.direction = 'refund'
    ORDER BY pt.currency
  LOOP
    SELECT lower(btrim(COALESCE(comp->>'method', ''))),
           CASE WHEN COALESCE(comp->>'operation_date', '') <> ''
                THEN (comp->>'operation_date')::timestamptz ELSE NULL END
      INTO v_rec_method, v_rec_date
      FROM jsonb_array_elements(p_recovery) comp
      WHERE upper(btrim(comp->>'currency')) = v_refund.currency LIMIT 1;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, direction, paid_by, idempotency_key
    ) VALUES (
      v_dev.store_id, 'devolution', p_devolution_id, v_dev.original_transaction_id,
      v_refund.amount, v_rec_method::text, v_refund.currency, v_refund.exchange_rate,
      COALESCE(v_rec_date, NOW()), 'recovery', v_uid,
      'dev-' || p_devolution_id::text || '-recovery-' || v_refund.currency
    );
    v_recovered := v_recovered || jsonb_build_object(
      'currency', v_refund.currency, 'amount', v_refund.amount,
      'method', v_rec_method, 'rate', v_refund.exchange_rate);
  END LOOP;

  -- 5) STORE CREDIT: compensación trazable del pasivo (fila negativa con
  --    vínculo a la devolución). El efectivo NO se toca: el crédito nunca fue
  --    billetes. (El modelo no tiene redención/consumo de créditos hoy; cuando
  --    exista deberá respetar estas compensaciones.)
  FOR v_credit IN
    SELECT scl.customer_id, scl.amount
    FROM public.store_credit_ledger scl
    WHERE scl.devolution_id = p_devolution_id AND scl.amount > 0
    ORDER BY scl.created_at
  LOOP
    SELECT COALESCE(SUM(s2.amount), 0) INTO v_credit_outstanding
    FROM public.store_credit_ledger s2 WHERE s2.devolution_id = p_devolution_id;
    IF v_credit_outstanding > 0 THEN
      INSERT INTO public.store_credit_ledger
        (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
      VALUES
        (v_dev.store_id, v_credit.customer_id, -v_credit_outstanding, p_devolution_id,
         v_dev.original_transaction_id, 'dev-' || p_devolution_id::text || '-credit-comp', v_uid);
    END IF;
  END LOOP;

  -- 6) Inventario: pipeline canónico (W9.5 B-10b byte-conservado)
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    SELECT (SUM(sm.unit_cost * sm.quantity_change) / NULLIF(SUM(sm.quantity_change), 0))
      INTO v_uc_dev
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_devolution_id::text
        AND sm.product_id = v_item.product_id
        AND sm.movement_type = 'return';
    IF v_uc_dev IS NULL THEN
      IF v_dev.original_transaction_id IS NOT NULL THEN
        SELECT ti.cost_at_sale INTO v_uc_dev
          FROM public.transaction_items ti
          WHERE ti.transaction_id = v_dev.original_transaction_id
            AND ti.product_id = v_item.product_id
          LIMIT 1;
      END IF;
      IF v_uc_dev IS NULL THEN
        SELECT cost_average INTO v_uc_dev FROM public.products WHERE id = v_item.product_id;
      END IF;
      v_uc_dev := COALESCE(v_uc_dev, 0);
    END IF;

    PERFORM public.fn_recalc_wac(
      v_dev.store_id, v_item.product_id, 'devolution_reverse',
      0, 0,
      jsonb_build_object('rpc', 'reverse_devolution', 'devolution_id', p_devolution_id,
        'qty_reversed', v_item.quantity));

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_dev.store_id,
      p_quantity := -v_item.quantity,
      p_movement_type := 'devolution_reverse',
      p_reason := ('Reversión devolución ' || COALESCE(v_dev.devolution_number, p_devolution_id::text))::text,
      p_user_id := v_uid,
      p_variant_id := NULL,
      p_sale_id := p_devolution_id,
      p_unit_cost := v_uc_dev,
      p_notes := COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION',
      'pipeline', 'register_stock_movement',
      'movement_type', 'devolution_reverse',
      'financial_recovery', v_recovered,
      'store_credit_compensated', (SELECT COALESCE(SUM(scl.amount) < 0, false) FROM public.store_credit_ledger scl WHERE scl.devolution_id = p_devolution_id)));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count,
    'devolution_id', p_devolution_id, 'recovered', v_recovered);
END;
$function$


-- @contract-function name=reverse_inventory_adjustment_v2 args="p_adjustment_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_counter_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_original.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_original.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo ajustes confirmed pueden revertirse (status=%)', v_original.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.can_reverse_document(v_caller_uid, v_original.store_id, 'adjustment') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de ajuste requiere rol admin/manager/encargado en la tienda';
  END IF;

  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_counter_id, v_original.store_id, 'confirmed',
    v_original.reason, v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);
    IF v_diff = 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_counter_id, v_item.product_id, v_item.counted_quantity, v_item.expected_quantity
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_counter_id,
      p_unit_cost := 0,
      p_reason := 'Reversión de ajuste: ' || COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = NOW(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_ADJUSTMENT_V2', 'inventory_adjustments', p_adjustment_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'counter_adjustment_id', v_counter_id,
      'items_reversed', v_count, 'old_status', v_original.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_ADJUSTMENT'));

  RETURN jsonb_build_object('status', 'success', 'adjustment_id', p_adjustment_id,
    'counter_adjustment_id', v_counter_id, 'items_reversed', v_count);
END;
$function$


-- @contract-function name=reverse_production_order args="p_order_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'closed' THEN RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa de rol. Politica congelada: puerta UI real del
  -- modulo (Costo: membership admin/manager/costo en la tienda de la orden) o
  -- admin global transversal. Observacion de producto registrada (02-policy).
  IF NOT public.can_reverse_document(v_caller_uid, v_order.store_id, 'production_order') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de orden de produccion requiere rol admin/manager/costo en la tienda';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_REVERSE'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_reverse',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','reverse_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Reversa producción: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='reversed', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_REVERSED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac,
      'old_status', v_order.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_PRODUCTION_ORDER'));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $function$


-- @contract-function name=reverse_receipt args="p_receipt_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_receipt.store_id) THEN
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


-- @contract-function name=reverse_receipt_v2 args="p_receipt_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  -- R1/R6: real caller identity. service_role callers are server-side actors
  -- (/api/reverse injects session.user.id); every other role is pinned to
  -- auth.uid() so p_user_id cannot forge authorship.
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
  v_current_stock numeric;
  v_new_stock numeric;
  v_unit_cost_cup numeric;
  v_items_processed int := 0;
  v_reversed_payments int := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: status=%', v_receipt.status;
  END IF;

  -- R1 [P1]: tenant/store isolation. Mirrors V1 model + PR-4 guard.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa de rol (fuente unica can_reverse_document).
  -- Politica congelada: operadores de recepciones (membership admin/manager/
  -- encargado/warehouse en la tienda del receipt) o admin global transversal.
  IF NOT public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de recepcion requiere rol admin/manager/encargado/warehouse en la tienda';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_current_stock
    FROM public.products
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id
    FOR UPDATE;
    v_current_stock := COALESCE(v_current_stock, 0);

    -- R2: exact inverse. fn_recalc_wac raises ERR_WAC_REVERSE_NEGATIVE_STOCK
    -- when S + q <= 0 (detection over silence — W7 D-01 / PR-4 / B-12 contract).
    -- fn_recalc_wac locks the product row and updates cost_average with the
    -- app.wac_writer token (single writer).
    PERFORM public.fn_recalc_wac(
      v_receipt.store_id, v_item.product_id, 'reception_reverse',
      -v_item.quantity, v_unit_cost_cup,
      jsonb_build_object('rpc', 'reverse_receipt_v2', 'receipt_id', p_receipt_id));

    v_new_stock := v_current_stock - v_item.quantity;

    UPDATE public.products
    SET stock_current = v_new_stock, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.stock_movements
      (product_id, store_id, movement_type, quantity_change, unit_cost,
       reference_doc, created_at, created_by, movement_date)
    VALUES
      (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type,
       -v_item.quantity, v_unit_cost_cup,
       'Reversión recepción: ' || COALESCE(p_reason, ''), now(), v_caller_uid, now());

    v_items_processed := v_items_processed + 1;
  END LOOP;

  UPDATE public.receipts
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = v_caller_uid,
      reversal_reason = p_reason,
      -- R3: payment reset (PR-4 / void_pending_reception canonical pattern)
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL
  WHERE id = p_receipt_id;

  -- R3: mark related payment transactions (notes marker, canonical pattern)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by reverse_receipt_v2 '
              || p_receipt_id::text || ' at ' || now()::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- R4/R6: unified historical action string + real caller identity
  INSERT INTO public.audit_logs
    (user_id, store_id, action, table_name, record_id, metadata)
  VALUES
    (v_caller_uid, v_receipt.store_id, 'REVERSE_RECEIPT_V2', 'receipts', p_receipt_id,
     jsonb_build_object('reason', p_reason,
                        'items_processed', v_items_processed,
                        'payments_reversed', v_reversed_payments,
                        'old_status', v_receipt.status, 'new_status', 'reversed',
                        'operation', 'ADMIN_REVERSE_RECEIPT',
                        'v2_reverse', true));

  RETURN jsonb_build_object('status', 'success',
                            'receipt_id', p_receipt_id,
                            'items_processed', v_items_processed,
                            'payments_reversed', v_reversed_payments);
END
$function$


-- @contract-function name=reverse_transaction_v2 args="p_transaction_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
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

  -- W9.5 B-8 (MODELO C, Nivel 2 Reversion administrativa): politica
  -- normativa UNICA can_admin_reverse_transaction: admin global
  -- (alcance transversal *) o membership activa con rol
  -- admin/manager/encargado en LA TIENDA de la transaccion.
  -- La membresia responde "puede operar en la tienda"; el ROL responde
  -- "puede realizar esta operacion administrativa". Ownership NO se
  -- exige (venta ajena permitida dentro del alcance); sin ventana
  -- temporal (doc vigente; la ventana 24h de la doc previa esta
  -- superseda). Todo lo demas de V2 se conserva intacto (GATE 14).
  IF NOT public.can_admin_reverse_transaction(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion administrativa requiere rol admin/manager/encargado en la tienda de la venta';
  END IF;

  -- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): además del product_id IS NOT NULL
  -- preexistente, se excluyen los servicios: revertir la venta de un
  -- artículo intangible NO restaura existencias que nunca se descontaron.
  FOR v_item IN
    SELECT ti.product_id, ti.quantity, ti.cost_at_sale
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_transaction_id AND ti.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = ti.product_id AND pr.is_service = true)
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
    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'ADMIN_REVERSE'));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'units_restored', v_total_restored
  );
END;
$function$


-- @contract-function name=reverse_transfer args="p_transfer_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_ref_doc TEXT;
  v_mov JSONB;
  v_dest_stock NUMERIC;
  v_new_wac NUMERIC;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: estado actual: %', v_transfer.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;

  -- W9.5 B-10: capa normativa de rol resuelta en la tienda ORIGEN (duena del
  -- documento y del audit). El acceso al DESTINO sigue siendo requisito
  -- adicional (naturaleza bidireccional de la transferencia).
  IF NOT public.can_reverse_document(v_caller_uid, v_transfer.origin_store_id, 'transfer') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de transferencia requiere rol admin/manager/encargado/warehouse en la tienda de origen';
  END IF;

  v_ref_doc := 'REVERSIÓN ' || UPPER(left(v_transfer.id::text, 8)) || ' [' || left(p_reason, 50) || ']';

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    IF v_item.destination_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_DEST_PRODUCT_NULL: item %', v_item.id;
    END IF;

    -- DF-06: reversa simétrica del blend destino (q<0 con uc congelado) ANTES de mover stock
    SELECT stock_current INTO v_dest_stock FROM public.products
      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id
      FOR UPDATE;
    IF COALESCE(v_dest_stock,0) - v_item.quantity > 0 THEN
      v_new_wac := public.fn_recalc_wac(
        v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_reverse',
        -v_item.quantity, v_item.unit_cost,
        jsonb_build_object('rpc','reverse_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));
    END IF;

    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, 'Reversión: devolución al origen', NOW(), TRUE
    );

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, 'Reversión: retiro del destino', NOW(), TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.transfers
    SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_transfer_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_reversed', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count, 'reference_doc', v_ref_doc,
      'old_status', v_transfer.status, 'new_status', 'REVERSADA',
      'operation', 'ADMIN_REVERSE_TRANSFER',
      'dest_reverse_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END $function$


-- @contract-function name=reverse_vale_salida args="p_slip_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_vale_salida(p_slip_id uuid, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_store_id uuid;
  v_slip_number text;
  v_production_order_id uuid;
  v_item RECORD;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                        THEN COALESCE(p_user_id, auth.uid())
                        ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT store_id INTO v_store_id FROM issue_slips WHERE id = p_slip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));

  IF NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- V-03 DEFENSE 1: status must be 'completed' (no double reversal)
  -- V-03 DEFENSE 2: slip must have at least one original movement (issue_slip_out or production_out)
  -- The second defense is redundant with the first but protects against data corruption
  -- and future modifications that might break the status check.
  IF NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_id::text = p_slip_id::text
      AND movement_type IN ('issue_slip_out', 'production_out')
  ) THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: no original movement found (issue_slip_out or production_out)';
  END IF;

  UPDATE issue_slips
  SET status = 'reversed',
      voided_at = now(),
      voided_by = v_caller_uid,
      void_reason = p_reason
  WHERE id = p_slip_id
    AND status = 'completed'
  RETURNING slip_number, production_order_id INTO v_slip_number, v_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: status must be completed';
  END IF;

  FOR v_item IN
    SELECT si.product_id, si.variant_id, si.production_order_item_id,
           si.quantity, si.unit_cost
    FROM issue_slip_items si
    WHERE si.slip_id = p_slip_id
    ORDER BY si.created_at
  LOOP
    DECLARE
      v_reverse_type text;
    BEGIN
      IF v_item.production_order_item_id IS NOT NULL THEN
        v_reverse_type := 'production_reverse';
        UPDATE production_order_items
        SET actual_qty = actual_qty - v_item.quantity,
            status = CASE
              WHEN actual_qty - v_item.quantity <= 0 THEN 'pending'
              ELSE 'partial'
            END,
            updated_at = now()
        WHERE id = v_item.production_order_item_id;
      ELSE
        v_reverse_type := 'issue_slip_reverse';
      END IF;

      PERFORM register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := v_store_id,
        p_user_id := v_caller_uid,
        p_quantity := v_item.quantity,
        p_movement_type := v_reverse_type,
        p_sale_id := p_slip_id,
        p_unit_cost := v_item.unit_cost,
        p_reason := 'Reversion Vale de Salida ' || v_slip_number,
        p_notes := COALESCE(p_reason, 'Reversion'),
        p_variant_id := v_item.variant_id,
        p_skip_access_check := TRUE
      );
    END;
  END LOOP;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'REVERSE_VALE_SALIDA', 'issue_slips', p_slip_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'slip_number', v_slip_number,
      'reason', p_reason,
      'reversed_at', now(),
      'production_order_id', v_production_order_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'slip_id', p_slip_id,
    'slip_number', v_slip_number,
    'new_status', 'reversed'
  );
END;
$function$


-- @contract-function name=review_physical_inventory_item args="p_pi_id uuid, p_item_id uuid, p_review_notes text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.review_physical_inventory_item(p_pi_id uuid, p_item_id uuid, p_review_notes text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status NOT IN ('in_reconciliation','pending_authorization') THEN
    RAISE EXCEPTION 'ERR_NOT_IN_RECONCILIATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_REVIEW';
  END IF;

  UPDATE public.physical_inventory_items
    SET review_notes = p_review_notes, status = 'review',
        reviewed_by = v_caller_uid, reviewed_at = NOW(),
        updated_by = v_caller_uid, updated_at = NOW()
  WHERE id = p_item_id AND pi_id = p_pi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ITEM_NOT_IN_PI'; END IF;

  INSERT INTO public.physical_inventory_count_log (
    pi_id, item_id, product_id, action, old_counted_qty, new_counted_qty, source, user_id)
  SELECT p_pi_id, p_item_id, product_id, 'review', counted_qty, counted_qty, 'manual', v_caller_uid
  FROM public.physical_inventory_items WHERE id = p_item_id;

  RETURN jsonb_build_object('status', 'success', 'item_id', p_item_id);
END;
$function$


-- @contract-function name=save_ai_api_key args="p_provider text, p_api_key text, p_label text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.save_ai_api_key(p_provider text, p_api_key text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vault_key text;
  v_key_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT value INTO v_vault_key FROM public.system_config WHERE key = 'vault_key';
  INSERT INTO public.ai_api_keys (user_id, provider, api_key_encrypted, label, is_active, updated_at)
  VALUES (auth.uid(), p_provider, extensions.pgp_sym_encrypt(p_api_key, v_vault_key), p_label, true, now())
  ON CONFLICT (id) DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, updated_at = now()
  RETURNING id INTO v_key_id;
  RETURN v_key_id;
END;
$function$


-- @contract-function name=save_product_cost_sheet args="p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cs_id UUID;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para guardar fichas de costo en esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida';
  END IF;

  -- Validate cost_price > 0 (REG-03: division by zero prevention)
  IF p_cost_price < 0 THEN
    RAISE EXCEPTION 'El costo unitario no puede ser negativo';
  END IF;

  -- Upsert the cost sheet
  INSERT INTO product_cost_sheets (product_id, store_id, template_id, modalidad, calculated_data, cost_price, sync_status)
  VALUES (p_product_id, p_store_id, p_template_id, p_modalidad, p_calculated_data, p_cost_price, 'synced')
  ON CONFLICT (product_id) WHERE deleted_at IS NULL
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    modalidad = EXCLUDED.modalidad,
    calculated_data = EXCLUDED.calculated_data,
    cost_price = EXCLUDED.cost_price,
    cost_price_updated_at = now(),
    sync_status = 'synced',
    updated_at = now()
  RETURNING id INTO v_cs_id;

  -- Link product to cost sheet
  UPDATE products SET cost_sheet_id = v_cs_id WHERE id = p_product_id;

  -- Return confirmation
  SELECT jsonb_build_object(
    'id', id,
    'product_id', product_id,
    'cost_price', cost_price,
    'cost_price_updated_at', cost_price_updated_at,
    'sync_status', sync_status
  ) INTO v_result
  FROM product_cost_sheets WHERE id = v_cs_id;

  RETURN v_result;
END;
$function$


-- @contract-function name=set_purchase_order_status args="p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_reason text" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id     uuid;
  v_current      public.purchase_status_enum;
  v_po_number    text;
  v_allowed      text[];
  v_is_allowed   boolean := false;
BEGIN
  -- ─── 1. Cargar PO con lock exclusivo ───
  SELECT store_id, status, po_number
    INTO v_store_id, v_current, v_po_number
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Si no hay cambio, retornar success sin hacer nada ───
  IF v_current = p_new_status THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'po_status', v_current::text,
      'po_number', v_po_number
    );
  END IF;

  -- ─── 4. Definir transiciones permitidas (state machine) ───
  -- 'partial' y 'received' NUNCA son destino válido manualmente
  -- (solo vía receive_against_po).
  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'    THEN ARRAY['cancelled']
    WHEN 'partial' THEN ARRAY['cancelled']
    ELSE ARRAY[]::text[]  -- received, cancelled: terminal, no transitions
  END;

  -- ─── 5. Verificar transición permitida ───
  SELECT EXISTS(SELECT 1 FROM unnest(v_allowed) a WHERE a = p_new_status::text)
    INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current::text, p_new_status::text,
      CASE WHEN array_length(v_allowed, 1) IS NULL THEN 'none' ELSE array_to_string(v_allowed, ', ') END;
  END IF;

  -- ─── 6. Aplicar transición ───
  UPDATE public.purchase_orders
  SET status      = p_new_status,
      received_at = CASE WHEN p_new_status = 'received' THEN NOW() ELSE received_at END
  WHERE id = p_po_id;

  -- ─── 7. Auditoría (action = PO_STATUS_CHANGED) ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END, v_store_id, 'PO_STATUS_CHANGED', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'po_number', v_po_number,
      'from_status', v_current::text,
      'to_status', p_new_status::text,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', p_new_status::text,
    'po_number', v_po_number,
    'previous_status', v_current::text
  );
END;
$function$


-- @contract-function name=set_received_service_status args="p_service_id uuid, p_new_status text, p_user_id uuid, p_reason text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_current text;
  v_service_number text;
  v_allowed text[];
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number
  INTO v_store_id, v_current, v_service_number
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  -- FIX D1: autorización del ACTOR sobre la tienda REAL del servicio.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_current = p_new_status THEN
    RETURN jsonb_build_object('status', 'no_change', 'service_status', v_current);
  END IF;

  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['active', 'cancelled']::text[]
    WHEN 'active'  THEN ARRAY['voided']::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current, p_new_status, array_to_string(v_allowed, ', ');
  END IF;

  PERFORM set_config('app.is_status_change_rpc', 'true', true);

  UPDATE received_services SET status = p_new_status, updated_at = NOW()
  WHERE id = p_service_id;

  PERFORM set_config('app.is_status_change_rpc', 'false', true);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_STATUS_CHANGED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'from_status', v_current, 'to_status', p_new_status, 'reason', p_reason
    ));

  RETURN jsonb_build_object('status', 'success', 'service_status', p_new_status, 'previous_status', v_current);
END;
$function$


-- @contract-function name=set_transfer_approval_rule args="p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric DEFAULT NULL::numeric, p_threshold_quantity numeric DEFAULT NULL::numeric, p_approver_roles text[] DEFAULT ARRAY['admin'::text, 'manager'::text], p_is_active boolean DEFAULT true, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_existing UUID;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT (antes era IF v_caller_uid IS NOT NULL THEN ... END IF)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el usuario sea admin o manager
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_user_role IS NULL OR (v_user_role <> 'admin' AND v_user_role <> 'superadmin' AND NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text])) THEN
    RAISE EXCEPTION 'ERR_INSUFFICIENT_ROLE';
  END IF;

  -- Upsert
  SELECT id INTO v_existing FROM public.transfer_approval_rules
    WHERE store_id = p_store_id AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE public.transfer_approval_rules
      SET threshold_amount = COALESCE(p_threshold_amount, threshold_amount),
          threshold_quantity = COALESCE(p_threshold_quantity, threshold_quantity),
          approver_roles = COALESCE(p_approver_roles, approver_roles),
          is_active = COALESCE(p_is_active, is_active),
          updated_at = NOW()
      WHERE id = v_existing;
  ELSE
    INSERT INTO public.transfer_approval_rules (tenant_id, store_id, threshold_amount, threshold_quantity, approver_roles, is_active, created_at, updated_at)
    VALUES (p_tenant_id, p_store_id, p_threshold_amount, p_threshold_quantity, p_approver_roles, p_is_active, NOW(), NOW())
    RETURNING id INTO v_existing;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SET_TRANSFER_APPROVAL_RULE', 'transfer_approval_rules', v_existing, p_store_id, v_caller_uid,
    jsonb_build_object('threshold_amount', p_threshold_amount, 'threshold_quantity', p_threshold_quantity, 'is_active', p_is_active));

  RETURN jsonb_build_object('status', 'success', 'rule_id', v_existing);
END;
$function$


-- @contract-function name=snapshot_commission_rule args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.snapshot_commission_rule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.commission_rule_versions
  WHERE rule_id = NEW.id;

  INSERT INTO public.commission_rule_versions (rule_id, version, snapshot, changed_by)
  VALUES (
    NEW.id,
    v_next_version,
    jsonb_build_object(
      'type', NEW.type,
      'value_percent', NEW.value_percent,
      'fixed_value', NEW.fixed_value,
      'salary_amount', NEW.salary_amount,
      'base_calculation', NEW.base_calculation,
      'priority', NEW.priority,
      'valid_from', NEW.valid_from,
      'valid_to', NEW.valid_to,
      'worker_id', NEW.worker_id,
      'store_id', NEW.store_id,
      'min_price', NEW.min_price,
      'max_price', NEW.max_price,
      'product_commission_amount', NEW.product_commission_amount,
      'product_commission_mode', NEW.product_commission_mode,
      'snapshotted_at', now()
    ),
    NEW.created_by
  );

  RETURN NEW;
END;
$function$


-- @contract-function name=soft_delete_store args="p_store_id uuid, p_deleted_by uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.soft_delete_store(p_store_id uuid, p_deleted_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_caller_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede soft-delete stores';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o ya inactiva';
  END IF;

  UPDATE stores SET is_active = false WHERE id = p_store_id;
  UPDATE user_store_memberships SET status = 'revoked' WHERE store_id = p_store_id AND status = 'active';
  UPDATE profiles SET active_store_id = NULL WHERE active_store_id = p_store_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_soft_deleted', 'stores', p_store_id, p_store_id,
    jsonb_build_object('deleted_by', p_deleted_by, 'deleted_at', now())
  );

  SELECT jsonb_build_object(
    'store_id', p_store_id, 'is_active', false,
    'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked'),
    'profiles_cleared', (SELECT count(*) FROM profiles WHERE active_store_id IS NULL AND id IN (
      SELECT user_id FROM user_store_memberships WHERE store_id = p_store_id
    ))
  ) INTO v_result;

  RETURN v_result;
END;
$function$


-- @contract-function name=start_physical_inventory_count args="p_pi_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.start_physical_inventory_count(p_pi_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'prepared' THEN
    RAISE EXCEPTION 'ERR_NOT_PREPARED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado','warehouse','clerk']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_COUNT';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'in_progress', count_started_at = NOW(), count_started_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_COUNT_STARTED', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'in_progress');
END;
$function$


-- @contract-function name=submit_physical_inventory_authorization args="p_pi_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.submit_physical_inventory_authorization(p_pi_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'in_reconciliation' THEN
    RAISE EXCEPTION 'ERR_NOT_IN_RECONCILIATION (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_SUBMIT';
  END IF;

  UPDATE public.physical_inventories SET status = 'pending_authorization' WHERE id = p_pi_id;
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_SUBMITTED_FOR_AUTHORIZATION', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'pending_authorization');
END;
$function$


-- @contract-function name=submit_physical_inventory_reconciliation args="p_pi_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.submit_physical_inventory_reconciliation(p_pi_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_pending INT;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status <> 'counted' THEN
    RAISE EXCEPTION 'ERR_NOT_COUNTED (estado actual: %)', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id,
       ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_RECONCILE';
  END IF;
  SELECT COUNT(*) INTO v_pending FROM public.physical_inventory_items
  WHERE pi_id = p_pi_id AND counted_qty IS NULL;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'ERR_PENDING_LINES: un inventario con líneas pendientes no puede conciliarse (% pendientes)', v_pending;
  END IF;

  UPDATE public.physical_inventories
    SET status = 'in_reconciliation', submitted_at = NOW(), submitted_by = v_caller_uid
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_RECONCILIATION_STARTED', 'physical_inventories',
          p_pi_id, jsonb_build_object('pi_number', v_pi.pi_number), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'in_reconciliation');
END;
$function$


-- @contract-function name=sync_inventory_from_products args="p_store_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.sync_inventory_from_products(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sync_product_id uuid, product_name text, action text, old_qty numeric, new_qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_max_version bigint;
BEGIN
  -- Para cada producto activo (de la tienda o todas si p_store_id es null)
  RETURN QUERY
  WITH target_products AS (
    SELECT id, name, store_id, stock_current
    FROM public.products
    WHERE is_active = true
      AND (p_store_id IS NULL OR store_id = p_store_id)
  ),
  existing_inv AS (
    SELECT product_id, store_id, quantity, version
    FROM public.inventory
  ),
  actions AS (
    SELECT
      tp.id as pid,
      tp.name as product_name,
      CASE
        -- No existe en inventory → INSERT
        WHEN ei.quantity IS NULL THEN 'INSERT'
        -- Existe pero cantidad diferente → UPDATE
        WHEN ABS(tp.stock_current - ei.quantity) > 0.001 THEN 'UPDATE'
        ELSE 'SKIP'
      END as action,
      ei.quantity as old_qty,
      tp.stock_current as new_qty,
      ei.version as old_version,
      tp.store_id
    FROM target_products tp
    LEFT JOIN existing_inv ei ON ei.product_id = tp.id AND ei.store_id = tp.store_id
    WHERE ei.quantity IS NULL OR ABS(tp.stock_current - ei.quantity) > 0.001
  )
  SELECT
    a.pid as sync_product_id,
    a.product_name,
    a.action,
    a.old_qty,
    a.new_qty
  FROM actions a;

  -- Ejecutar INSERTs (repetimos la CTE porque RETURN QUERY consume el contexto)
  INSERT INTO public.inventory (product_id, store_id, quantity, version, updated_at)
  SELECT
    tp.id,
    tp.store_id,
    tp.stock_current,
    1,
    now()
  FROM public.products tp
  WHERE tp.is_active = true
    AND (p_store_id IS NULL OR tp.store_id = p_store_id)
    AND tp.stock_current > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory inv
      WHERE inv.product_id = tp.id AND inv.store_id = tp.store_id
    )
  ON CONFLICT (product_id, store_id) DO NOTHING;

  -- Ejecutar UPDATEs (solo si quantity difiere)
  UPDATE public.inventory inv
  SET
    quantity = tp.stock_current,
    version = inv.version + 1,
    updated_at = now()
  FROM public.products tp
  WHERE inv.product_id = tp.id
    AND inv.store_id = tp.store_id
    AND tp.is_active = true
    AND (p_store_id IS NULL OR tp.store_id = p_store_id)
    AND ABS(inv.quantity - tp.stock_current) > 0.001;

END;
$function$


-- @contract-function name=sync_product_has_movements args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.sync_product_has_movements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET has_movements = true
    WHERE id = NEW.product_id AND has_movements = false;

    RETURN NEW;
END;
$function$


-- @contract-function name=sync_product_stock args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.sync_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET stock_current = COALESCE(
        (SELECT sm.balance_after
         FROM public.stock_movements sm
         WHERE sm.product_id = NEW.product_id
         ORDER BY sm.movement_date DESC, sm.created_at DESC
         LIMIT 1),
        0
    )
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$function$


-- @contract-function name=update_receipt_item_tasa args="p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_item RECORD;
  v_store_id uuid;
  v_receipt_id uuid;
  v_old_tasa numeric;
  v_old_moneda text;
  v_effective_moneda text;
  v_new_total numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  -- (1) Lock item + receipt
  SELECT
    ri.id AS item_id,
    ri.receipt_id,
    ri.quantity,
    ri.unit_cost,
    ri.moneda_recepcion,
    ri.tasa_cambio_recepcion,
    r.store_id,
    r.status AS receipt_status
  INTO v_item
  FROM public.receipt_items ri
  JOIN public.receipts r ON r.id = ri.receipt_id
  WHERE ri.id = p_receipt_item_id
  FOR UPDATE OF ri, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_ITEM_NOT_FOUND';
  END IF;

  v_store_id := v_item.store_id;
  v_receipt_id := v_item.receipt_id;
  v_old_tasa := v_item.tasa_cambio_recepcion;
  v_old_moneda := v_item.moneda_recepcion;

  -- (2) Authorization
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- (3) Status guard
  IF v_item.receipt_status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED';
  END IF;
  IF v_item.receipt_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  -- (4) Validación coherencia moneda ↔ tasa
  IF p_new_moneda_recepcion IS NOT NULL
     AND p_new_moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
  THEN
    RAISE EXCEPTION 'ERR_UNSUPPORTED_CURRENCY: % no soportada', p_new_moneda_recepcion;
  END IF;

  v_effective_moneda := COALESCE(p_new_moneda_recepcion, v_old_moneda);

  -- CUP = tasa 1 (estricto)
  IF v_effective_moneda = 'CUP'
     AND p_new_tasa_cambio_recepcion IS DISTINCT FROM 1.0
  THEN
    RAISE EXCEPTION 'ERR_CUP_RATE_MUST_BE_1: moneda CUP requiere tasa=1, recibido %',
      p_new_tasa_cambio_recepcion;
  END IF;

  -- FX = tasa > 1.5
  IF v_effective_moneda <> 'CUP' THEN
    IF p_new_tasa_cambio_recepcion IS NULL OR p_new_tasa_cambio_recepcion <= 1.5 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: moneda % requiere tasa > 1.5, recibido %',
        v_effective_moneda, COALESCE(p_new_tasa_cambio_recepcion::text, 'NULL');
    END IF;
    IF p_new_tasa_cambio_recepcion < 0.01 OR p_new_tasa_cambio_recepcion > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa % fuera de rango [0.01, 10000]',
        p_new_tasa_cambio_recepcion;
    END IF;
  END IF;

  -- (5) No-op guard
  IF v_old_tasa IS NOT DISTINCT FROM p_new_tasa_cambio_recepcion
     AND (p_new_moneda_recepcion IS NULL OR v_old_moneda = p_new_moneda_recepcion)
  THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'receipt_item_id', p_receipt_item_id,
      'receipt_id', v_receipt_id
    );
  END IF;

  -- (6) Audit BEFORE mutating
  INSERT INTO public.receipt_tasa_audit (
    receipt_item_id, valor_anterior, valor_nuevo,
    moneda_anterior, moneda_nueva, modificado_por, modificado_at, motivo
  ) VALUES (
    p_receipt_item_id,
    v_old_tasa,
    p_new_tasa_cambio_recepcion,
    v_old_moneda,
    COALESCE(p_new_moneda_recepcion, v_old_moneda),
    v_caller_uid,
    NOW(),
    COALESCE(p_motivo, 'update_receipt_item_tasa RPC')
  );

  -- (7) Mutate receipt_items
  UPDATE public.receipt_items
    SET
      tasa_cambio_recepcion = p_new_tasa_cambio_recepcion,
      moneda_recepcion = COALESCE(p_new_moneda_recepcion, moneda_recepcion),
      updated_at = NOW()
    WHERE id = p_receipt_item_id;

  -- (8) Recalcular total_cost — UNA sola llamada
  v_new_total := public.calculate_receipt_total_cup(v_receipt_id);

  UPDATE public.receipts
    SET
      total_cost = v_new_total,
      updated_at = NOW()
    WHERE id = v_receipt_id;

  -- (9) Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'UPDATE_RECEIPT_ITEM_TASA', 'receipt_items', p_receipt_item_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'valor_anterior', v_old_tasa,
      'valor_nuevo', p_new_tasa_cambio_recepcion,
      'moneda_anterior', v_old_moneda,
      'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
      'motivo', p_motivo
    )
  );

  -- (10) Return
  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_item_id', p_receipt_item_id,
    'receipt_id', v_receipt_id,
    'valor_anterior', v_old_tasa,
    'valor_nuevo', p_new_tasa_cambio_recepcion,
    'moneda_anterior', v_old_moneda,
    'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
    'new_total_cost', v_new_total
  );
END;
$function$


-- @contract-function name=update_reception_items args="p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_deleted boolean;
  v_new_total numeric := 0;
  v_updated_count integer := 0;
  v_failed_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
  FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- PR-2 C4: alinear auth con patrón v2.12.12 (has_store_access_as + v_caller_uid)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_item_updates) LOOP
    v_item_id := (v_item->>'id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_deleted := COALESCE((v_item->>'deleted')::boolean, false);

    IF v_deleted THEN
      DELETE FROM public.receipt_items WHERE id = v_item_id AND receipt_id = p_receipt_id;
      v_updated_count := v_updated_count + 1;
    ELSE
      UPDATE public.receipt_items
      SET quantity = v_qty, unit_cost = v_cost
      WHERE id = v_item_id AND receipt_id = p_receipt_id;

      IF NOT FOUND THEN
        v_failed_count := v_failed_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- PR-2 C4: recalcular total_cost usando calculate_receipt_total_cup (con tasa)
  v_new_total := public.calculate_receipt_total_cup(p_receipt_id);

  UPDATE public.receipts SET total_cost = v_new_total, updated_at = NOW()
  WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_store_id, 'reception_items_updated', 'receipts', p_receipt_id,
    jsonb_build_object('updated', v_updated_count, 'failed', v_failed_count, 'new_total', v_new_total)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', v_updated_count,
    'failed_count', v_failed_count,
    'new_total', v_new_total
  );
END;
$function$


-- @contract-function name=update_transaction_taxes args="p_transaction_id uuid, p_applied_taxes jsonb, p_reason text" owner=costpro_transaction_adjuster proacl={costpro_transaction_adjuster=X/costpro_transaction_adjuster,authenticated=X/costpro_transaction_adjuster,service_role=X/costpro_transaction_adjuster}
CREATE OR REPLACE FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := public.app_actor_uid();
  v_store_id uuid;
  v_status text;
  v_subtotal numeric;
  v_discount numeric;
  v_old_tax numeric;
  v_old_taxes jsonb;
  v_old_total numeric;
  v_paid_total numeric;
  v_base numeric;
  v_new_tax numeric := 0;
  v_new_total numeric;
  v_applied jsonb := '[]'::jsonb;
  v_tax_ids text[] := '{}';
  v_entry jsonb;
  v_tc record;
  v_reason text;
BEGIN
  -- WHO (1): autenticación (PT014)
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014';
  END IF;

  -- WHICH STORE + WHEN: fila bajo lock; la tienda se lee DE LA TRANSACCIÓN
  SELECT store_id, status::text, subtotal, COALESCE(discount_value, 0),
         tax_amount, applied_taxes, total_amount
    INTO v_store_id, v_status, v_subtotal, v_discount,
         v_old_tax, v_old_taxes, v_old_total
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND: %', p_transaction_id;
  END IF;

  -- WHO (2): autorización por membresía EN LA TIENDA DE LA TRANSACCIÓN
  -- (o admin global). Roles globales sin membresía: DENEGADOS (T-UTT-005).
  IF NOT (
    public.is_admin()
    OR public.has_store_role_as(v_actor, v_store_id, ARRAY['admin', 'manager', 'encargado'])
  ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- WHEN (estados): solo ventas confirmadas ('pending' | 'completed')
  IF v_status NOT IN ('pending', 'completed') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_STATE: status=% no admite corrección tributaria', v_status;
  END IF;

  -- MOTIVO (PT013): obligatorio 1..500 tras btrim
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'ERR_REASON_INVALID: max 500 caracteres';
  END IF;

  -- WHAT + HOW: reconstrucción server-side desde tax_configurations (§5.4)
  IF p_applied_taxes IS NULL OR jsonb_typeof(p_applied_taxes) <> 'array' THEN
    RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: p_applied_taxes debe ser un array de {id}';
  END IF;
  v_base := GREATEST(0, v_subtotal - v_discount);
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_entry->>'id' IS NULL OR btrim(v_entry->>'id') = ''
       OR v_entry->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: entrada sin id de configuración';
    END IF;
    SELECT id, name, type, value, min_exempt INTO v_tc
      FROM public.tax_configurations
      WHERE id = (v_entry->>'id')::uuid
        AND is_active = true
        AND (store_id IS NULL OR store_id = v_store_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID';
    END IF;
    IF v_tc.id::text = ANY(v_tax_ids) THEN
      RAISE EXCEPTION 'ERR_APPLIED_TAX_INVALID: impuesto duplicado';
    END IF;
    v_tax_ids := array_append(v_tax_ids, v_tc.id::text);
    v_applied := v_applied || jsonb_build_object(
      'id', v_tc.id, 'name', v_tc.name, 'type', v_tc.type,
      'value', v_tc.value, 'min_exempt', v_tc.min_exempt);
    IF v_tc.type = 'percentage' THEN
      v_new_tax := v_new_tax + GREATEST(0, v_base - COALESCE(v_tc.min_exempt, 0)) * v_tc.value / 100;
    ELSE
      v_new_tax := v_new_tax + v_tc.value;
    END IF;
  END LOOP;

  -- Invariante canónica: total = subtotal − descuento + impuesto
  v_new_total := v_subtotal - v_discount + v_new_tax;

  -- INVARIANTE PT002: el pago registrado nunca queda por encima del total
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total
    FROM public.payment_transactions
    WHERE transaction_id = p_transaction_id;
  IF v_paid_total > v_new_total + 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS: new_total=% < paid=%', v_new_total, v_paid_total
      USING ERRCODE = 'PT002';
  END IF;

  -- NO-OP auditado: nada que mutar
  IF v_new_tax = v_old_tax AND v_applied = v_old_taxes AND v_new_total = v_old_total THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
    VALUES ('UPDATE_TRANSACTION_TAXES_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('tax_amount', v_old_tax, 'applied_taxes', v_old_taxes, 'total_amount', v_old_total),
      jsonb_build_object('tax_amount', v_new_tax, 'applied_taxes', v_applied, 'total_amount', v_new_total),
      jsonb_build_object('reason', v_reason, 'result', 'NO_OP', 'paid_total_at_time', v_paid_total,
                         'executed_as', current_user, 'auth_uid', v_actor));
    RETURN true;
  END IF;

  -- Mutación (owner costpro_transaction_adjuster: única clase PT008)
  UPDATE public.transactions
    SET applied_taxes = v_applied,
        tax_amount = v_new_tax,
        total_amount = v_new_total,
        updated_at = now()
    WHERE id = p_transaction_id;

  -- AUDIT completa
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, old_data, new_data, metadata)
  VALUES ('UPDATE_TRANSACTION_TAXES', 'transactions', p_transaction_id, v_store_id, v_actor,
    jsonb_build_object('tax_amount', v_old_tax, 'applied_taxes', v_old_taxes, 'total_amount', v_old_total),
    jsonb_build_object('tax_amount', v_new_tax, 'applied_taxes', v_applied, 'total_amount', v_new_total),
    jsonb_build_object('reason', v_reason, 'paid_total_at_time', v_paid_total,
                       'executed_as', current_user, 'auth_uid', v_actor));

  RETURN true;
END;
$function$


-- @contract-function name=upsert_manual_exchange_rate_with_audit args="p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date, p_source text, p_capture_method text, p_source_ip text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.upsert_manual_exchange_rate_with_audit(p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date DEFAULT NULL::date, p_source text DEFAULT 'elToque'::text, p_capture_method text DEFAULT 'real'::text, p_source_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_role text;
  v_today date := COALESCE(p_rate_date, CURRENT_DATE);
  v_old_rate numeric;
  v_old_rate_date date;
  v_row_id uuid;
  v_audit_id uuid;
BEGIN
  -- ── 1) Autorización contra la fuente de verdad (BD) ─────────────────────
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: actor nulo'
      USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_actor_role
    FROM public.profiles
   WHERE id = p_actor_id;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: % no es admin global',
      COALESCE(p_actor_id::text,'NULL')
      USING ERRCODE = '42501';
  END IF;

  -- ── 2) Snapshot bloqueado del valor inmediatamente anterior (H1) ────────
  SELECT er.rate, er.rate_date INTO v_old_rate, v_old_rate_date
    FROM public.exchange_rates er
   WHERE er.currency = p_currency
     AND er.source = p_source
     AND er.segment = '3'
   ORDER BY er.rate_date DESC, er.captured_at DESC
   LIMIT 1
   FOR UPDATE;

  -- ── 3) Mutación de la tasa (mismo conflict-key que la ruta histórica) ───
  INSERT INTO public.exchange_rates
    (rate_date, captured_at, currency, source, segment, rate, capture_method)
  VALUES (
    v_today, now(), p_currency, p_source, '3', p_rate,
    CASE WHEN p_capture_method IN ('real','estimated') THEN p_capture_method ELSE 'real' END
  )
  ON CONFLICT (rate_date, currency, source, segment)
  DO UPDATE SET rate = EXCLUDED.rate, captured_at = EXCLUDED.captured_at
  RETURNING id INTO v_row_id;

  -- ── 4) Pista de auditoría — MISMA TRANSACCIÓN (¿quién, qué, cuándo,
--        entidad, old/new?) ────────────────────────────────────────────────
  INSERT INTO public.exchange_rate_audit
    (actor_id, action, currency, old_rate, old_rate_date, new_rate, rate_date, source_ip)
  VALUES (
    p_actor_id, 'manual_upsert', p_currency,
    v_old_rate, v_old_rate_date, p_rate, v_today, p_source_ip
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'row_id', v_row_id,
    'audit_id', v_audit_id,
    'currency', p_currency,
    'old_rate', v_old_rate,
    'old_rate_date', v_old_rate_date,
    'new_rate', p_rate,
    'rate_date', v_today,
    'actor_role', v_actor_role
  );
END;
$function$


-- @contract-function name=upsert_store_cost_template args="p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text DEFAULT 'res148'::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado'])) THEN
    RAISE EXCEPTION 'Sin permisos para modificar la plantilla de esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida. Debe ser: produccion, servicios o comercializacion';
  END IF;

  -- Validate store exists
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o inactiva';
  END IF;

  INSERT INTO store_cost_templates (store_id, template_id, template_data, modalidad, pdf_format, created_by)
  VALUES (p_store_id, p_template_id, p_template_data, p_modalidad, p_pdf_format, p_created_by)
  ON CONFLICT (store_id)
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    template_data = EXCLUDED.template_data,
    modalidad = EXCLUDED.modalidad,
    pdf_format = EXCLUDED.pdf_format,
    is_active = true,
    updated_at = now()
  RETURNING jsonb_build_object(
    'id', id,
    'store_id', store_id,
    'template_id', template_id,
    'modalidad', modalidad,
    'pdf_format', pdf_format,
    'is_active', is_active,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$function$


-- @contract-function name=upsert_usage_aggregate args="p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text, p_endpoint text, p_count integer, p_sum_value double precision" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text DEFAULT 'api'::text, p_endpoint text DEFAULT NULL::text, p_count integer DEFAULT 1, p_sum_value double precision DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  INSERT INTO public.usage_aggregates
    (bucket_start, bucket_end, metric_type, service, endpoint, count, sum_value, created_at, updated_at)
  VALUES
    (p_bucket_start, p_bucket_end, p_metric_type, p_service, p_endpoint, p_count, p_sum_value, now(), now())
  ON CONFLICT (bucket_start, metric_type, service, COALESCE(endpoint, ''))
  DO UPDATE SET
    count = usage_aggregates.count + EXCLUDED.count,
    sum_value = usage_aggregates.sum_value + EXCLUDED.sum_value,
    updated_at = now();
END;
$function$


-- @contract-function name=validate_active_store args="" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.validate_active_store()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := NEW.role;

    -- CP-ORG-001 ciclo 5: NIVEL ADMINISTRATIVO (admin|superadmin) transversal.
    -- active_store_id es opcional; si se fija, la tienda debe existir y estar
    -- activa. NO se exige membresía: la cuenta de plataforma no la lleva y
    -- no debe necesitar membresías ficticias (causa raíz del incidente).
    IF v_role = 'admin'::user_role
       OR v_role = 'superadmin'::user_role THEN
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.stores
                    WHERE id = NEW.active_store_id
                      AND is_active = true
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: la tienda no existe o no está activa.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- rol 'costo': semántica PREVIA intacta (membresía activa obligatoria en UPDATE)
    IF v_role = 'costo'::user_role THEN
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_store_memberships
                    WHERE user_id = NEW.id
                      AND store_id = NEW.active_store_id
                      AND status = 'active'
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Para roles operativos (encargado, clerk, warehouse, manager, usuario)
    IF TG_OP = 'INSERT' THEN
        -- En INSERT: ser permisivo. La función managed_create_user inserta
        -- memberships justo después. No validar nada aquí.
        RETURN NEW;
    ELSE
        -- UPDATE: solo validar si active_store_id cambió realmente
        -- (evita bloquear updates de otros campos en perfiles intermedios)
        IF OLD.active_store_id IS NOT DISTINCT FROM NEW.active_store_id THEN
            -- active_store_id no cambió → permitir el UPDATE sin validar
            RETURN NEW;
        END IF;

        -- active_store_id cambió → validar consistencia
        IF NEW.active_store_id IS NULL THEN
            IF v_role IN ('encargado'::user_role, 'clerk'::user_role, 'warehouse'::user_role) THEN
                RAISE EXCEPTION 'ERR_STORE_REQUIRED: El rol % requiere una tienda activa asignada.', v_role;
            END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
END;
$function$


-- @contract-function name=void_closed_production_order args="p_order_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text DEFAULT 'Anulación'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'closed' THEN RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_VOID'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_void',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','void_closed_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Void orden cerrada: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='voided', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_VOIDED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $function$


-- @contract-function name=void_inventory_adjustment args="p_adjustment_id uuid, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
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


-- @contract-function name=void_pending_reception args="p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.void_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulación de recepción pendiente'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  v_eff_date timestamptz := COALESCE(p_operation_date, NOW());
  v_reversed_payments integer;
BEGIN
  -- 1. Lock receipt (FOR UPDATE para concurrencia)
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND';
  END IF;

  -- 2. Idempotency: already voided → return success sin efectos
  IF v_receipt.status = 'voided' THEN
    RETURN jsonb_build_object(
      'status', 'idempotent',
      'receipt_id', p_receipt_id,
      'message', 'receipt already voided — no changes applied'
    );
  END IF;

  -- 3. Status guard: only pending can be voided here
  IF v_receipt.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only pending receipts can be voided here (status=%)',
      v_receipt.status;
  END IF;

  -- 4. Authorization (patrón v2.12.12: OR no AND)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 5. Operation date validation (política forward-only)
  PERFORM public.validate_operation_date(p_operation_date, v_receipt.store_id);

  -- 6. Mark payment_transactions as REVERSED (if any exist)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by void_pending_reception ' || p_receipt_id::text || ' at ' || v_eff_date::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- 7. Update receipt: voided + reset payment fields. DO NOT DELETE items.
  UPDATE public.receipts
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_receipt_id;

  -- 8. Audit log (atómico dentro de la transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid,
    v_receipt.store_id,
    'RECEPTION_VOIDED_PENDING',
    'receipts',
    p_receipt_id,
    jsonb_build_object(
      'reason', p_reason,
      'payments_reversed', v_reversed_payments,
      'items_preserved', (SELECT COUNT(*) FROM public.receipt_items WHERE receipt_id = p_receipt_id)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_id', p_receipt_id,
    'payments_reversed', v_reversed_payments
  );
END;
$function$


-- @contract-function name=void_physical_inventory args="p_pi_id uuid, p_reason text, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.void_physical_inventory(p_pi_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pi public.physical_inventories%ROWTYPE;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_VOID_REASON_REQUIRED';
  END IF;
  SELECT * INTO v_pi FROM public.physical_inventories WHERE id = p_pi_id FOR UPDATE;
  IF v_pi IS NULL THEN RAISE EXCEPTION 'ERR_PI_NOT_FOUND'; END IF;
  IF v_pi.status IN ('conciliated','closed','voided') THEN
    RAISE EXCEPTION 'ERR_CANNOT_VOID_STATE: un inventario % no puede anularse; utilice la reversión de los ajustes generados', v_pi.status;
  END IF;
  IF NOT (public.is_admin_check(v_caller_uid)
            OR public.has_store_role(v_caller_uid, v_pi.store_id, ARRAY['admin','manager','encargado']::text[])) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_VOID';
  END IF;

  UPDATE public.physical_inventories
    SET status = 'voided', voided_at = NOW(), voided_by = v_caller_uid, void_reason = p_reason
  WHERE id = p_pi_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
  VALUES (v_caller_uid, 'PHYSICAL_INVENTORY_VOIDED', 'physical_inventories', p_pi_id,
          jsonb_build_object('pi_number', v_pi.pi_number, 'reason', p_reason,
                             'previous_status', v_pi.status), v_pi.store_id);
  RETURN jsonb_build_object('status', 'success', 'pi_id', p_pi_id, 'new_status', 'voided');
END;
$function$


-- @contract-function name=void_received_service_with_reversal args="p_service_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_payment_status text;
  v_paid_amount numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_eff_date timestamp with time zone := COALESCE(p_operation_date, NOW());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, payment_status, paid_amount
  INTO v_store_id, v_status, v_service_number, v_payment_status, v_paid_amount
  FROM received_services
  WHERE id = p_service_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  -- FIX D1: autorización del ACTOR sobre la tienda REAL del servicio.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  PERFORM set_config('app.is_void_rpc', 'true', true);

  DELETE FROM service_reception_links WHERE service_id = p_service_id;
  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;
  DELETE FROM service_production_order_links WHERE service_id = p_service_id;

  UPDATE received_services
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_service_id;

  UPDATE payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by service void ' || p_service_id::text || ' at ' || v_eff_date::text || ']'
  WHERE ref_type = 'service' AND ref_id = p_service_id;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_VOIDED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'reason', p_reason,
      'before_status', v_status,
      'after_status', 'voided',
      'before_payment_status', v_payment_status,
      'before_paid_amount', v_paid_amount,
      'payment_transactions_reversed', (SELECT COUNT(*) FROM payment_transactions WHERE ref_type='service' AND ref_id=p_service_id)
    ));

  PERFORM set_config('app.is_void_rpc', 'false', true);

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'new_status', 'voided'
  );
END;
$function$


-- @contract-function name=void_reception_with_reversal args="p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_old_stock NUMERIC;
  v_new_stock NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status NOT IN ('active') THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: %', v_receipt.status; END IF;

  FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_old_stock FROM products WHERE id = v_item.product_id AND store_id = v_receipt.store_id FOR UPDATE;
    v_new_stock := GREATEST(0, COALESCE(v_old_stock,0) - v_item.quantity);

    IF v_new_stock > 0 THEN
      PERFORM public.fn_recalc_wac(v_receipt.store_id, v_item.product_id, 'reception_void',
                     -v_item.quantity, v_unit_cost_cup,
                     jsonb_build_object('rpc','void_reception_with_reversal','receipt_id',p_receipt_id));
    END IF;

    UPDATE products SET stock_current = v_new_stock, updated_at = v_effective_date
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type, -v_item.quantity, v_unit_cost_cup, 'Void recepción: ' || COALESCE(p_reason,''), v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status='voided', reversed_at=v_effective_date, reversed_by=p_user_id, reversal_reason=p_reason WHERE id=p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (p_user_id, v_receipt.store_id, 'RECEIPT_VOIDED_WITH_REVERSAL', 'receipts', p_receipt_id,
          jsonb_build_object('reason', p_reason));
END $function$


-- @contract-function name=void_transaction args="p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid" owner=postgres proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
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

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): guard de estado explicito
  -- (endurecimiento B-9a: rechaza estados distintos de completed/voided
  -- ANTES de tocar datos; el trigger trg_validate_tx_transition sigue
  -- siendo la segunda barrera).
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: void_transaction (POS undo) solo permite completed (status=%)', v_tx.status;
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): politica normativa UNICA
  -- can_pos_undo_transaction: venta propia + ventana server-side 30s
  -- + estado completed + rol operativo POS (membership por tienda o
  -- admin global). Identidad SIEMPRE auth.uid() para no-service_role;
  -- p_user_id del cliente no puede convertirse en actor.
  IF NOT public.can_pos_undo_transaction(p_transaction_id, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: POS undo requiere venta propia, dentro de la ventana de 30s y rol operativo POS en la tienda';
  END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- FIX C-7: Restaurar stock considerando conversion_factor de variantes.
  -- Si transaction_items.variant_id está poblado, buscar conversion_factor.
  -- Si variant_id es NULL (ventas legacy), usar 1 (sin conversión) para
  -- mantener simetría con create_sale legacy.
  -- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19):
  --   * product_id IS NOT NULL: items sin producto (close_service_order_as_sale)
  --     no tienen existencias que restaurar.
  --   * is_service: los servicios intangibles nunca descontaron stock al
  --     venderse (create_sale_v2 :736-743) → no se les restaura nada.
  FOR v_item IN
    SELECT ti.*
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_transaction_id
      AND ti.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = ti.product_id AND pr.is_service = true)
  LOOP
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
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'POS_UNDO'));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;

$function$


-- @contract-function name=withdraw_production_item_deprecated_6arg args="p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text" owner=postgres proacl={postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.withdraw_production_item_deprecated_6arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_qty_int INTEGER; v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_unit_cost::text || '|' || p_store_id::text || '|' || COALESCE(p_user_id::text, ''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  v_qty_int := GREATEST(p_qty, 0)::integer;
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty, actual_unit_cost = p_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(p_product_id := v_product_id, p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int, p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text, p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost, p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id, p_skip_access_check := TRUE);

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost', p_unit_cost, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$


-- @contract-function name=withdraw_production_item_deprecated_9arg args="p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text, p_server_side_cost boolean" owner=postgres proacl={postgres=X/postgres}
CREATE OR REPLACE FUNCTION public.withdraw_production_item_deprecated_9arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_doc text DEFAULT NULL::text, p_server_side_cost boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,'') || '|' || p_server_side_cost::text);
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  -- V-01: SELECT FOR UPDATE reads AND locks budgeted_qty + actual_qty
  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- V-01: Overconsumption check using locked values
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %',
      v_actual, p_qty, v_budgeted;
  END IF;

  -- C-03 + C-04: Server-side cost without fallback
  IF p_server_side_cost THEN
    SELECT cost_average INTO v_real_unit_cost
    FROM products WHERE id = v_product_id AND store_id = v_order_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;
    IF v_real_unit_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
    END IF;
  ELSE
    v_real_unit_cost := p_unit_cost;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- No integer truncation (fix #3): use p_qty directly
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'server_side_cost', p_server_side_cost,
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$


-- @contract-function name=withdraw_production_item_v3 args="p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text" owner=postgres proacl={postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
CREATE OR REPLACE FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_doc text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
  v_zero_flagged boolean;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw_v3', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- Overconsumption check con valores bloqueados
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %', v_actual, p_qty, v_budgeted;
  END IF;

  -- DF-05: costo SIEMPRE server-side — WAC_prev del material bajo FOR UPDATE, sin fallback a 0
  SELECT cost_average
  INTO v_real_unit_cost
  FROM products WHERE id = v_product_id AND store_id = v_order_store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
  END IF;
  IF v_real_unit_cost IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
  END IF;
  IF v_real_unit_cost = 0 THEN
    SELECT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                   WHERE store_id = v_order_store_id AND product_id = v_product_id
                     AND scope = 'approve_zero_cost_material')
    INTO v_zero_flagged;
    IF NOT v_zero_flagged THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_product_id;
    END IF;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- D-11: qty numérica sin truncamiento
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw_v3', p_item_id, v_param_hash, v_existing_result);
  END IF;

  -- INV-15: audit_logs SIEMPRE (procedencia del costo server-side registrada)
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'cost_authority', 'server_side_wac_v3',
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END $function$

