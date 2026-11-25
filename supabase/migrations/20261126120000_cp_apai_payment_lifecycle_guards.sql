-- ============================================================================
-- CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — Migración 1/2 (20261126120000).
--
-- FASE 2/4 — Regla empresarial (misión §2):
--   «Un documento con pagos confirmados o liquidados no puede devolverse ni
--    anularse ignorando sus pagos. Primero debe resolverse la aplicación y el
--    estado financiero del pago mediante el procedimiento oficial de
--    reversión (reverse_supplier_payment). Después podrá ejecutarse la
--    devolución o cancelación del documento.»
--
-- Antes de esta migración NO existía ningún guard de pagos en las cuatro
-- vías de anulación/devolución de documentos CxP:
--   · reverse_receipt_v2 (recepción active → reversed): reseteaba
--     paid_amount=0 y solo appendl una nota a los pagos — el dinero quedaba
--     como salida elegible sin contra-fila (asimetría con servicios).
--   · void_pending_reception (recepción pending → voided): mismo patrón.
--   · void_received_service_with_reversal (servicio active → voided):
--     auto-revertía los pagos dentro de la propia anulación — la resolución
--     financiera quedaba OCULTA en la operación administrativa.
--   · set_received_service_status (draft→cancelled / active→voided): mismo
--     patrón de auto-reversión.
--
-- Con esta migración, TODAS las vías exigen que el documento llegue SIN
-- pagos vivos (filas direction='in' sin contra-fila reversal). El flujo
-- operativo pasa a ser explícito en dos pasos:
--   1) El usuario resuelve cada pago con el procedimiento oficial
--      (POST /api/payments/[id] → reverse_supplier_payment: contra-fila +
--      asiento compensatorio + audit; el trigger update_payment_status
--      netea y restablece el saldo de la obligación).
--   2) Con el documento ya sin pagos vivos, la anulación/reversión procede
--      con su flujo habitual (stock/WAC/kardex en recepciones, asiento de
--      anulacion integral del documento en servicios).
--
-- El error expone los datos que la UI necesita para guiar al usuario:
--   ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS / ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS
--   con pagos_vivos=, importe_vivo=, total_documento=, saldo_actual=.
--
-- Los bucles de auto-reversión de los RPC de servicios se CONSERVAN como
-- defensa en profundidad (con el guard activo son inalcanzables para pagos
-- vivos; para pagos ya revertidos son no-ops idempotentes). No se crea un
-- segundo mecanismo paralelo de reversión (misión §4.1).
--
-- Idempotente: solo CREATE OR REPLACE de funciones (sin DDL de tablas).
-- Las ACL vigentes se preservan (CREATE OR REPLACE no las toca):
--   reverse_receipt_v2 → PUBLIC (con guard interno has_store_access_as,
--   allowlist vigente) · void_pending_reception → authenticated+service_role
--   · void/set_received_service_status → service_role.
-- REVERSIBILIDAD: reemitir los cuerpos previos (git history) restaura el
--   comportamiento anterior.
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- §1 reverse_receipt_v2 — cuerpo vigente (20260905000002: reconciliado
--     W9.4.5-H4 + capa de autorización W9-B10) + GUARD de pagos vivos.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_live_payments bigint := 0;
  v_live_paid_cup numeric := 0;
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

  -- CP-AP-ACCOUNTING-INTEGRITY-001 §FASE2/4: GUARD de pagos vivos. Una
  -- recepción con pagos confirmados/aplicados (filas 'in' sin contra-fila)
  -- NO se revierte ignorando sus pagos: primero se resuelve cada pago con el
  -- procedimiento oficial (reverse_supplier_payment) y después se revierte.
  SELECT count(*), COALESCE(sum(t.amount_cup), 0)
    INTO v_live_payments, v_live_paid_cup
    FROM public.payment_transactions t
   WHERE t.ref_type = 'receipt' AND t.ref_id = p_receipt_id
     AND COALESCE(t.direction, 'in') = 'in'
     AND NOT EXISTS (SELECT 1 FROM public.payment_transactions c
                      WHERE c.reverses_payment_id = t.id);
  IF v_live_payments > 0 THEN
    RAISE EXCEPTION 'ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=% importe_vivo=% total_documento=% saldo_actual=% — anule primero los pagos desde el historial de pagos del documento y luego revierta la recepción',
      v_live_payments, v_live_paid_cup, v_receipt.total_cost,
      COALESCE(v_receipt.total_cost, 0) - COALESCE(v_receipt.paid_amount, 0);
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

  -- R3: mark related payment transactions (notes marker, canonical pattern).
  -- Con el guard activo aquí solo llegan filas ya revertidas (trazabilidad).
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
;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2 void_pending_reception — cuerpo vigente (20260810000030) + GUARD.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.void_pending_reception(
  p_receipt_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Anulación de recepción pendiente',
  p_operation_date timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_receipt RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  v_eff_date timestamptz := COALESCE(p_operation_date, NOW());
  v_reversed_payments integer;
  v_live_payments bigint := 0;
  v_live_paid_cup numeric := 0;
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

  -- 5b. CP-AP-ACCOUNTING-INTEGRITY-001 §FASE2/4: GUARD de pagos vivos (las
  -- recepciones pending sí pueden pagarse — register_supplier_payment solo
  -- bloquea voided/reversed — así que el guard es operativo aquí también).
  SELECT count(*), COALESCE(sum(t.amount_cup), 0)
    INTO v_live_payments, v_live_paid_cup
    FROM public.payment_transactions t
   WHERE t.ref_type = 'receipt' AND t.ref_id = p_receipt_id
     AND COALESCE(t.direction, 'in') = 'in'
     AND NOT EXISTS (SELECT 1 FROM public.payment_transactions c
                      WHERE c.reverses_payment_id = t.id);
  IF v_live_payments > 0 THEN
    RAISE EXCEPTION 'ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=% importe_vivo=% total_documento=% saldo_actual=% — anule primero los pagos desde el historial de pagos del documento y luego anule la recepción',
      v_live_payments, v_live_paid_cup, v_receipt.total_cost,
      COALESCE(v_receipt.total_cost, 0) - COALESCE(v_receipt.paid_amount, 0);
  END IF;

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
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3 void_received_service_with_reversal — cuerpo vigente (20261124120100 §1)
--     + GUARD de pagos vivos. El bucle de contra-filas se conserva como
--     defensa en profundidad (inalcanzable para pagos vivos con el guard).
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_total numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_eff_date timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_pay record;
  v_reversed_count integer := 0;
  v_live_payments bigint := 0;
  v_live_paid_cup numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT rs.store_id, rs.status, rs.service_number, rs.payment_status, rs.paid_amount, rs.total_amount
  INTO v_store_id, v_status, v_service_number, v_payment_status, v_paid_amount, v_total
  FROM received_services rs
  WHERE rs.id = p_service_id AND rs.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  -- CP-AP-ACCOUNTING-INTEGRITY-001 §FASE2/4: GUARD de pagos vivos. La
  -- anulación de un servicio con pagos confirmados/aplicados exige resolver
  -- PRIMERO cada pago con el procedimiento oficial (reverse_supplier_payment:
  -- contra-fila + asiento compensatorio + audit) — la resolución financiera
  -- no puede quedar oculta dentro de la operación administrativa.
  SELECT count(*), COALESCE(sum(t.amount_cup), 0)
    INTO v_live_payments, v_live_paid_cup
    FROM payment_transactions t
   WHERE t.ref_type = 'service' AND t.ref_id = p_service_id
     AND COALESCE(t.direction, 'in') = 'in'
     AND NOT EXISTS (SELECT 1 FROM payment_transactions c
                      WHERE c.reverses_payment_id = t.id);
  IF v_live_payments > 0 THEN
    RAISE EXCEPTION 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=% importe_vivo=% total_documento=% saldo_actual=% — anule primero los pagos desde el historial de pagos del servicio y luego anúlelo',
      v_live_payments, v_live_paid_cup, v_total,
      COALESCE(v_total, 0) - COALESCE(v_paid_amount, 0);
  END IF;

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

  -- CP-OPS-ENERVIDA (P0, defensa en profundidad): contra-filas por pago.
  -- Con el guard activo solo llegan aquí pagos ya revertidos (no-op
  -- idempotente por uq_payment_reversal_origin / idempotency_key).
  FOR v_pay IN
    SELECT * FROM payment_transactions
    WHERE ref_type = 'service' AND ref_id = p_service_id
      AND COALESCE(direction, 'in') = 'in'
    ORDER BY payment_date, id
  LOOP
    UPDATE payment_transactions
    SET notes = COALESCE(notes, '') || ' [REVERSED by service void ' || p_service_id::text || ' at ' || v_eff_date::text || ']'
    WHERE id = v_pay.id;

    IF NOT EXISTS (SELECT 1 FROM payment_transactions WHERE reverses_payment_id = v_pay.id) THEN
      INSERT INTO payment_transactions (
        store_id, ref_type, ref_id, amount, payment_method,
        currency, exchange_rate, reference, notes, paid_by, idempotency_key,
        payment_date, direction, reverses_payment_id
      ) VALUES (
        v_store_id, 'service', p_service_id, v_pay.amount, v_pay.payment_method,
        v_pay.currency, v_pay.exchange_rate,
        'Reversión (anulación de servicio ' || v_service_number || ')',
        'Reversión automática por anulación del servicio ' || v_service_number ||
          ' — pago ' || v_pay.id::text ||
          CASE WHEN COALESCE(btrim(p_reason), '') <> '' THEN ' — ' || btrim(p_reason) ELSE '' END,
        v_caller_uid,
        'reversal:' || v_pay.id::text,
        v_eff_date,
        'reversal',
        v_pay.id
      );
      v_reversed_count := v_reversed_count + 1;
    END IF;

    -- Asiento compensatorio del 'pago' (idempotente; el annulment integral
    -- del trigger del documento suele llegar primero — belt and suspenders).
    PERFORM public.fin_post_payment_annulment('SERVICIO_RECIBIDO', p_service_id, v_pay.id);
  END LOOP;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_VOIDED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'reason', p_reason,
      'before_status', v_status,
      'after_status', 'voided',
      'before_payment_status', v_payment_status,
      'before_paid_amount', v_paid_amount,
      'payment_transactions_reversed', v_reversed_count,
      'operation_date', v_eff_date
    ));

  PERFORM set_config('app.is_void_rpc', 'false', true);

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'new_status', 'voided',
    'payments_reversed', v_reversed_count
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4 set_received_service_status — cuerpo vigente (20261124120100 §2) +
--     GUARD de pagos vivos en transiciones a estado terminal.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_supplier text;
  v_total numeric;
  v_paid_amount numeric;
  v_allowed text[];
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_pay record;
  v_reversed_count integer := 0;
  v_live_payments bigint := 0;
  v_live_paid_cup numeric := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT rs.store_id, rs.status, rs.service_number, rs.supplier, rs.total_amount, rs.paid_amount
  INTO v_store_id, v_current, v_service_number, v_supplier, v_total, v_paid_amount
  FROM received_services rs WHERE rs.id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

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

  IF v_current = 'draft' AND p_new_status = 'active' THEN
    IF COALESCE(btrim(COALESCE(v_supplier, '')), '') = '' THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: completa el proveedor antes de confirmar el servicio';
    END IF;
    IF v_total IS NULL OR v_total <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_AMOUNT: el importe del servicio debe ser > 0 para confirmar';
    END IF;
  END IF;

  -- CP-AP-ACCOUNTING-INTEGRITY-001 §FASE2/4: GUARD de pagos vivos antes de
  -- cualquier transición a estado terminal (cancelled/voided). Cubre también
  -- los borradores con pagos por caminos históricos.
  IF p_new_status IN ('cancelled', 'voided') THEN
    SELECT count(*), COALESCE(sum(t.amount_cup), 0)
      INTO v_live_payments, v_live_paid_cup
      FROM payment_transactions t
     WHERE t.ref_type = 'service' AND t.ref_id = p_service_id
       AND COALESCE(t.direction, 'in') = 'in'
       AND NOT EXISTS (SELECT 1 FROM payment_transactions c
                        WHERE c.reverses_payment_id = t.id);
    IF v_live_payments > 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=% importe_vivo=% total_documento=% saldo_actual=% — anule primero los pagos desde el historial de pagos del servicio y luego cancele/anule',
        v_live_payments, v_live_paid_cup, v_total,
        COALESCE(v_total, 0) - COALESCE(v_paid_amount, 0);
    END IF;
  END IF;

  PERFORM set_config('app.is_status_change_rpc', 'true', true);

  UPDATE received_services SET status = p_new_status, updated_at = NOW()
  WHERE id = p_service_id;

  PERFORM set_config('app.is_status_change_rpc', 'false', true);

  -- CP-OPS-ENERVIDA (defensa en profundidad): reversión explícita de pagos
  -- en transiciones terminales. Con el guard activo es inalcanzable para
  -- pagos vivos; para pagos ya revertidos es un no-op idempotente.
  IF p_new_status IN ('cancelled', 'voided') THEN
    FOR v_pay IN
      SELECT * FROM payment_transactions
      WHERE ref_type = 'service' AND ref_id = p_service_id
        AND COALESCE(direction, 'in') = 'in'
      ORDER BY payment_date, id
    LOOP
      IF NOT EXISTS (SELECT 1 FROM payment_transactions WHERE reverses_payment_id = v_pay.id) THEN
        INSERT INTO payment_transactions (
          store_id, ref_type, ref_id, amount, payment_method,
          currency, exchange_rate, reference, notes, paid_by, idempotency_key,
          payment_date, direction, reverses_payment_id
        ) VALUES (
          v_store_id, 'service', p_service_id, v_pay.amount, v_pay.payment_method,
          v_pay.currency, v_pay.exchange_rate,
          'Reversión (' || CASE WHEN p_new_status = 'cancelled' THEN 'cancelación' ELSE 'anulación' END || ' de servicio ' || v_service_number || ')',
          'Reversión automática por ' ||
            CASE WHEN p_new_status = 'cancelled' THEN 'cancelación' ELSE 'anulación' END ||
            ' del servicio ' || v_service_number || ' — pago ' || v_pay.id::text,
          v_caller_uid,
          'reversal:' || v_pay.id::text,
          now(),
          'reversal',
          v_pay.id
        );
        v_reversed_count := v_reversed_count + 1;
      END IF;
      PERFORM public.fin_post_payment_annulment('SERVICIO_RECIBIDO', p_service_id, v_pay.id);
    END LOOP;

    UPDATE received_services
    SET payment_status = 'unpaid', paid_amount = 0, paid_at = NULL
    WHERE id = p_service_id;
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_STATUS_CHANGED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'from_status', v_current, 'to_status', p_new_status, 'reason', p_reason,
      'payments_reversed', v_reversed_count
    ));

  RETURN jsonb_build_object('status', 'success', 'service_status', p_new_status, 'previous_status', v_current, 'payments_reversed', v_reversed_count);
END;
$function$;

COMMIT;
