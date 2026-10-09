-- ============================================================================
-- Migration: 20261010000002_v2_18_0_servicios_actor_y_caja.sql
-- Misión: FIX-SERVICIOS-ARQUEO-REPORTES (permisos + integración + arqueo + reporte)
-- ============================================================================
-- CONTENIDO (aditivo, no destructivo; sin cambios de datos):
--
--   PARTE A — D1 Autorización de servicios recibidos (causa raíz del
--     «No tienes acceso autorizado»):
--     Los 5 RPCs del módulo validaban con public.has_store_access(), que
--     depende de auth.uid(). La ACL certificada (20260916000002) es
--     service_role-only y las rutas API invocan con el cliente service_role
--     (sin JWT de usuario) → auth.uid() = NULL → ERR_UNAUTHORIZED el 100%
--     de las veces. FIX: doctrina actor-explícito ya establecida
--     (create_sale_v2 20261004130000 §3.1, reutilizada por v2.17.0):
--       v_actor := CASE WHEN auth.role() = 'service_role'
--                       THEN COALESCE(p_user, auth.uid())
--                       ELSE auth.uid() END;
--       + validación del ACTOR con has_store_access_as() (20260726000002:
--         bypass admin/superadmin global + membership activa; no depende de
--         auth.uid(); safe con NULL).
--     Funciones: create_received_service_v2, set_received_service_status,
--     void_received_service_with_reversal, distribute_service_cost_v2,
--     link_receipts_to_service. El actor SIEMPRE llega como parámetro
--     derivado server-side de la sesión verificada (nunca del body).
--
--   PARTE B — D2 Integración Servicios ↔ Órdenes de Trabajo (OT):
--     Tabla nueva service_production_order_links (relación documental,
--     1:N servicio→OT) + parámetro aditivo p_production_order_ids en
--     create_received_service_v2 con validación server-side (misma tienda,
--     OT no anulada/cerrada). La vinculación NO genera movimientos de
--     almacén ni contabilidad: es referencial.
--
--   PARTE C — D3 Arqueo de caja (doble conteo y fórmula):
--     close_cash_shift v2.18.0 (misma firma):
--       · Egresos de efectivo SOLO pagos a proveedores
--         (payment_transactions ref_type IN ('receipt','service'),
--         payment_method='cash'). Antes restaba TODOS los pagos en
--         efectivo: cobros de ventas (ref_type='sale' — doble conteo),
--         anticipos de producción (ref_type IN ('production_order','work')
--         — que son INGRESOS) y comisiones (ya estaban como término
--         aparte — doble conteo).
--       · Ingresos de efectivo por anticipos de órdenes de
--         producción/trabajo se SUMAN (eran omitidos/mentidos).
--       · Comisiones en efectivo: filtradas por payment_method='cash'
--         (antes restaba del efectivo también las pagadas por
--         transferencia/zelle).
--       · Ventas: se usan las columnas de desglose cash_amount /
--         transfer_amount / zelle_amount (soporta pagos 'mixed'; antes
--         payment_method agrupaba y perdía la parte efectivo de las
--         ventas mixtas).
--       · Pagos/anticipos por payment_date y comisiones por paid_at
--         (fecha efectiva del movimiento, coherente con get_cash_report).
--     get_sales_since_last_closure (misma firma): total_cash/total_transfer
--       ahora suman la parte correspondiente de ventas 'mixed'.
--     RPC NUEVO get_cash_shift_expected(p_store_id): desglose completo del
--       turno en curso para el arqueo (fondo, ventas cash, egresos cash,
--       anticipos producción cash, comisiones cash, efectivo esperado,
--       transferencias, zelle, total esperado). Misma ventana que
--       close_cash_shift: desde created_at del turno pendiente (o del
--       último cierre cerrado si no hay turno abierto).
--
--   PARTE D — D4 «Gastos/Costos por Día» incluye Servicios Recibidos:
--     get_daily_expenses_aggregated (misma firma, misma forma jsonb):
--       · SUMA received_services activos por service_date (fecha del
--         documento) junto a recepciones activas por created_at::date.
--       · Filtra status='active' en AMBAS fuentes (antes contaba
--         recepciones anuladas).
--       · Filas con desglose: receipts_cost, services_amount y
--         total_expenses = receipts_cost + services_amount (compatibilidad:
--         la UI/export usan date + total_expenses).
--       · Conversión CUP coherente con payment_transactions.amount_cup:
--         total_amount * CASE WHEN currency='CUP' THEN 1
--                             ELSE COALESCE(exchange_rate,1) END.
--       · NO duplica: receipts.total_cost NO contiene los servicios
--         (la distribución de costos vive en service_cost_distributions y
--         afecta al WAC de productos, no a total_cost del receipt).
--
-- ACL: se re-declaran idénticas a la vigente certificada (service_role-only
--      para los 5 RPCs de servicios; authenticated+service_role para los de
--      caja). Los servicios solo se invocan desde las rutas API server-side;
--      la autorización real la hace el ACTOR explícito dentro del RPC.
-- REVERSIÓN: ver bloque DOWN documentado al final del archivo.
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE B (primero: la tabla que la PARTE A/B referencian)
-- service_production_order_links — vínculo documental servicio ↔ OT
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_production_order_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.received_services(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_spol_service_order UNIQUE (service_id, production_order_id)
);

CREATE INDEX IF NOT EXISTS idx_spol_service ON public.service_production_order_links(service_id);
CREATE INDEX IF NOT EXISTS idx_spol_order ON public.service_production_order_links(production_order_id);

ALTER TABLE public.service_production_order_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spol_read" ON public.service_production_order_links;
CREATE POLICY "spol_read" ON public.service_production_order_links
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "spol_write" ON public.service_production_order_links;
CREATE POLICY "spol_write" ON public.service_production_order_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.service_production_order_links IS
  'v2.18.0: vínculo documental servicio recibido ↔ orden de trabajo/producción. Referencial: no genera movimientos de almacén ni contabilidad.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE A + B — create_received_service_v2 (firma v2: + p_production_order_ids)
-- ══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_received_service_v2(
  p_store_id uuid,
  p_supplier text,
  p_total_amount numeric,
  p_service_type_id uuid DEFAULT NULL,
  p_service_type_name text DEFAULT 'Otro',
  p_service_date date DEFAULT NULL,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_payment_terms_days integer DEFAULT 30,
  p_distribution_method text DEFAULT 'amount',
  p_reference_doc text DEFAULT NULL,
  p_observations text DEFAULT NULL,
  p_receipt_ids jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_production_order_ids jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
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

  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id AND store_id = p_store_id AND is_active = true;
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
$func$;

-- ACL (re-certificada: service_role-only — único llamador: rutas API)
REVOKE EXECUTE ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.create_received_service_v2(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, uuid, jsonb) IS
  'v2.18.0: actor-explícito (doctrina create_sale_v2) + has_store_access_as del ACTOR; vínculo documental con recepciones y OT (p_production_order_ids). Corrige el ERR_UNAUTHORIZED constante bajo service_role.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE A — set_received_service_status (misma firma; gate actor-explícito)
-- ══════════════════════════════════════════════════════════════════════════

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
$function$;

-- ACL idéntica a la vigente (CREATE OR REPLACE preserva; se re-declara)
REVOKE EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE A — void_received_service_with_reversal (misma firma; gate actor)
-- ══════════════════════════════════════════════════════════════════════════

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
$function$;

-- ACL idéntica a la vigente
REVOKE EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_received_service_with_reversal(uuid, uuid, text, timestamptz) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE A — distribute_service_cost_v2 (misma firma; gate actor)
-- ══════════════════════════════════════════════════════════════════════════

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
$function$;

-- ACL idéntica a la vigente
REVOKE EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_service_cost_v2(uuid, uuid) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE A — link_receipts_to_service (misma firma; gate actor)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.link_receipts_to_service(
  p_service_id uuid,
  p_receipt_ids jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
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
$func$;

-- ACL idéntica a la vigente (service_role-only según contract-surface 20260916)
REVOKE EXECUTE ON FUNCTION public.link_receipts_to_service(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_receipts_to_service(uuid, jsonb, uuid) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE C — close_cash_shift v2.18.0 (misma firma; fórmula sin doble conteo)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_cash_shift(
  p_closure_id uuid,
  p_declared_cash numeric,
  p_declared_vouchers numeric,
  p_notes text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL::uuid
)
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
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
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

  -- 3. Advisory lock por store
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  -- 4. Fórmula v2.18.0 — Efectivo esperado =
  --      Fondo inicial + Entradas de efectivo − Salidas de efectivo
  --    Entradas: ventas cobradas en efectivo (parte cash de ventas mixtas
  --      incluida) + anticipos de órdenes de producción/trabajo en efectivo.
  --    Salidas: pagos a proveedores en efectivo (recepciones + servicios
  --      recibidos) + comisiones pagadas en efectivo.
  --    NO son efectivo: transferencias y zelle (van a su propio lado del
  --      arqueo); pagos pendientes de documentos (no hay salida de dinero);
  --      cobros de ventas (ref_type='sale') — ya están contados como ventas.

  -- Ventas por canal (columnas de desglose: soportan pago 'mixed')
  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales
    FROM public.transactions
    WHERE store_id = v_closure.store_id
      AND status = 'completed'
      AND created_at > v_closure.created_at
      AND created_at <= NOW();

  -- FIX D3: SOLO egresos reales de caja — pagos a proveedores en efectivo
  -- (recepciones y servicios recibidos). Excluye ref_type='sale' (cobros de
  -- ventas — doble conteo), 'production_order'/'work' (anticipos = ingresos)
  -- y 'commission' (término aparte).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- FIX D3: anticipos de producción/trabajo EN EFECTIVO son ENTRADAS de caja.
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = v_closure.store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_closure.created_at
      AND payment_date <= NOW();

  -- FIX D3: comisiones SOLO en efectivo (antes se restaban todas del
  -- efectivo, incluidas las pagadas por transferencia/zelle).
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = v_closure.store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_closure.created_at
      AND paid_at <= NOW();

  -- Calcular totales
  v_system_cash := COALESCE(v_closure.opening_balance, 0)
                 + v_cash_sales + v_cash_production
                 - v_cash_outflows - v_cash_commissions;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0)) - v_system_expected_total;

  -- 5. UPDATE closure con valores recalculados
  UPDATE public.cash_closures SET
    status = 'cerrado',
    closed_at = NOW(),
    declared_cash = p_declared_cash,
    declared_vouchers = p_declared_vouchers,
    declared_total = COALESCE(p_declared_cash, 0) + COALESCE(p_declared_vouchers, 0),
    system_expected_total = v_system_expected_total,
    difference = v_difference,
    notes = p_notes,
    updated_at = NOW()
  WHERE id = p_closure_id;

  -- 6. Audit log atómico
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_closure.store_id, 'CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id,
    jsonb_build_object(
      'system_cash', v_system_cash,
      'expected_total', v_system_expected_total,
      'difference', v_difference,
      'formula', 'v2.18.0',
      'cash_sales', v_cash_sales,
      'cash_production_income', v_cash_production,
      'cash_outflows_suppliers', v_cash_outflows,
      'cash_commissions', v_cash_commissions,
      'transfer_sales', v_transfer_sales,
      'zelle_sales', v_zelle_sales
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'system_cash', v_system_cash,
    'system_expected_total', v_system_expected_total,
    'difference', v_difference,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales
  );
END;
$function$;

-- ACL idéntica a la vigente certificada (service_role-only — único llamador:
-- la ruta /api/cash-closures/close con cliente admin)
REVOKE EXECUTE ON FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid) TO service_role;

COMMENT ON FUNCTION public.close_cash_shift(uuid, numeric, numeric, text, uuid) IS
  'v2.18.0: fórmula de arqueo sin doble conteo. Egresos de efectivo = pagos a proveedores cash (receipt/service); ingresos = ventas cash (columnas split, soporta mixed) + anticipos producción/work cash; comisiones solo cash. Transfer/Zelle NO son efectivo.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE C — get_sales_since_last_closure (misma firma; soporta 'mixed')
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_since_last_closure(p_store_id uuid)
RETURNS TABLE(
    total_sales numeric,
    total_cash numeric,
    total_transfer numeric,
    last_closure_at timestamptz
) AS $$
DECLARE
    v_last_closure_at timestamptz;
BEGIN
  -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on the requested store.
  -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
  -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
  -- (Guard preservado de 20260916000006 — no se revierte el hardening.)
  IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;

    SELECT closed_at INTO v_last_closure_at
    FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'cerrado'
    ORDER BY closed_at DESC
    LIMIT 1;

    IF v_last_closure_at IS NULL THEN
        v_last_closure_at := '1970-01-01 00:00:00+00'::timestamptz;
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
        COALESCE(SUM(
            CASE
                WHEN payment_method = 'cash' THEN total_amount
                -- FIX D3: la parte en efectivo de ventas mixtas ya no se pierde
                WHEN payment_method = 'mixed' THEN COALESCE(cash_amount, 0)
                ELSE 0
            END
        ), 0)::numeric AS total_cash,
        COALESCE(SUM(
            CASE
                WHEN payment_method = 'transfer' THEN total_amount
                WHEN payment_method = 'mixed' THEN COALESCE(transfer_amount, 0)
                ELSE 0
            END
        ), 0)::numeric AS total_transfer,
        v_last_closure_at AS last_closure_at
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_last_closure_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions';

-- ACL: authenticated (llamada client-side del widget POS) + service_role
REVOKE EXECUTE ON FUNCTION public.get_sales_since_last_closure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_since_last_closure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_since_last_closure(uuid) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE C — RPC NUEVO get_cash_shift_expected(p_store_id)
-- Desglose del turno EN CURSO para el arqueo (misma ventana/fórmula que
-- close_cash_shift v2.18.0 → la UI muestra SIEMPRE lo que el cierre calculará).
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_cash_shift_expected(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_window_start timestamptz;
  v_pending RECORD;
  v_opening numeric := 0;
  v_total_sales numeric := 0;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_outflows numeric := 0;
  v_cash_production numeric := 0;
  v_cash_commissions numeric := 0;
  v_expected_cash numeric := 0;
  v_expected_total numeric := 0;
BEGIN
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_REQUIRED';
  END IF;

  -- Ventana del turno: si hay turno PENDIENTE (abierto), desde su created_at
  -- (idéntico a close_cash_shift); si no, desde el último cierre cerrado
  -- (fallback histórico: epoch).
  SELECT * INTO v_pending FROM public.cash_closures
    WHERE store_id = p_store_id AND status = 'pendiente'
    ORDER BY created_at DESC LIMIT 1;

  IF v_pending IS NOT NULL THEN
    v_window_start := v_pending.created_at;
    v_opening := COALESCE(v_pending.opening_balance, 0);
  ELSE
    SELECT closed_at INTO v_window_start FROM public.cash_closures
      WHERE store_id = p_store_id AND status = 'cerrado'
      ORDER BY closed_at DESC LIMIT 1;
    v_window_start := COALESCE(v_window_start, '1970-01-01 00:00:00+00'::timestamptz);
  END IF;

  SELECT COALESCE(SUM(total_amount), 0),
         COALESCE(SUM(cash_amount), 0), COALESCE(SUM(transfer_amount), 0), COALESCE(SUM(zelle_amount), 0)
    INTO v_total_sales, v_cash_sales, v_transfer_sales, v_zelle_sales
    FROM public.transactions
    WHERE store_id = p_store_id
      AND status = 'completed'
      AND created_at > v_window_start
      AND created_at <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_outflows
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('receipt', 'service')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_production
    FROM public.payment_transactions
    WHERE store_id = p_store_id
      AND payment_method = 'cash'
      AND ref_type IN ('production_order', 'work')
      AND payment_date > v_window_start
      AND payment_date <= NOW();

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions
    FROM public.commission_payments
    WHERE store_id = p_store_id
      AND status = 'paid'
      AND payment_method = 'cash'
      AND paid_at > v_window_start
      AND paid_at <= NOW();

  v_expected_cash := v_opening + v_cash_sales + v_cash_production - v_cash_outflows - v_cash_commissions;
  v_expected_total := v_expected_cash + v_transfer_sales + v_zelle_sales;

  v_result := jsonb_build_object(
    'window_start', v_window_start,
    'has_pending_shift', (v_pending IS NOT NULL),
    'opening_balance', v_opening,
    'total_sales', v_total_sales,
    'cash_sales', v_cash_sales,
    'cash_outflows', v_cash_outflows,
    'cash_production', v_cash_production,
    'cash_commissions', v_cash_commissions,
    'expected_cash', v_expected_cash,
    'transfer_sales', v_transfer_sales,
    'zelle_sales', v_zelle_sales,
    'expected_total', v_expected_total
  );
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_cash_shift_expected(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_expected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_expected(uuid) TO service_role;

COMMENT ON FUNCTION public.get_cash_shift_expected(uuid) IS
  'v2.18.0: desglose del turno en curso para el arqueo (fondo, ventas cash, egresos proveedores cash, anticipos producción cash, comisiones cash, efectivo esperado, transferencias, zelle). Misma ventana y fórmula que close_cash_shift v2.18.0.';

-- ══════════════════════════════════════════════════════════════════════════
-- PARTE D — get_daily_expenses_aggregated v2 (misma firma; incluye servicios)
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_daily_expenses_aggregated(p_store_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  -- REM-R2-READ: authorization barrier (RLS is bypassed by SECURITY DEFINER).
  -- service_role keeps its trusted internal capability; human callers must
  -- hold active access (membership or global admin) on the requested store.
  -- NULL p_store_id is rejected: the legacy NULL=ALL-STORES path is not a
  -- legitimate capability (REM-R2-READ-PREP FASE 4, decision A).
  IF auth.role() <> 'service_role' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: NULL' USING ERRCODE = '42501';
    END IF;
    IF NOT public.has_store_access(p_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_STORE: %', p_store_id USING ERRCODE = '42501';
    END IF;
  END IF;

  -- v2.18.0: Gastos/Costos RECONOCIDOS por fecha del documento.
  --   · Costo de mercancía: receipts activos, fecha = created_at::date
  --     (regla de reconocimiento existente del reporte).
  --   · Servicios recibidos: activos, fecha = service_date (fecha del
  --     documento del servicio). La SALIDA DE EFECTIVO del pago es otro
  --     indicador (pago fecha payment_date — ver get_cash_report): un
  --     servicio recibido hoy y pagado mañana se reconoce hoy y la salida
  --     de dinero aparece mañana.
  --   · NO duplica: receipts.total_cost no incluye los servicios
  --     distribuidos (la distribución vive en service_cost_distributions /
  --     WAC de productos).
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      u.date,
      (COALESCE(SUM(u.receipts_cost), 0) + COALESCE(SUM(u.services_amount), 0))::numeric(18,2) AS total_expenses,
      COALESCE(SUM(u.receipts_cost), 0)::numeric(18,2) AS receipts_cost,
      COALESCE(SUM(u.services_amount), 0)::numeric(18,2) AS services_amount
    FROM (
      SELECT
        r.created_at::date AS date,
        SUM(r.total_cost) AS receipts_cost,
        NULL::numeric AS services_amount
      FROM receipts r
      WHERE r.store_id = p_store_id
        AND r.status = 'active'
        AND (p_date_from IS NULL OR r.created_at::date >= p_date_from)
        AND (p_date_to IS NULL OR r.created_at::date <= p_date_to)
      GROUP BY r.created_at::date

      UNION ALL

      SELECT
        rs.service_date AS date,
        NULL::numeric AS receipts_cost,
        SUM(rs.total_amount * CASE WHEN rs.currency = 'CUP' THEN 1 ELSE COALESCE(rs.exchange_rate, 1) END) AS services_amount
      FROM received_services rs
      WHERE rs.store_id = p_store_id
        AND rs.status = 'active'
        AND (p_date_from IS NULL OR rs.service_date >= p_date_from)
        AND (p_date_to IS NULL OR rs.service_date <= p_date_to)
      GROUP BY rs.service_date
    ) u
    GROUP BY u.date
    ORDER BY u.date DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$;

-- ACL idéntica a la vigente
REVOKE EXECUTE ON FUNCTION public.get_daily_expenses_aggregated(uuid, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_expenses_aggregated(uuid, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_expenses_aggregated(uuid, date, date, integer) TO service_role;

COMMENT ON FUNCTION public.get_daily_expenses_aggregated(uuid, date, date, integer) IS
  'v2.18.0: incluye Servicios Recibidos activos (fecha service_date, conversión CUP por exchange_rate) junto al costo de mercancía (recepciones activas, fecha created_at). Filas: date, total_expenses, receipts_cost, services_amount. No confundir con salidas de efectivo por fecha de pago.';

-- ══════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
-- ══════════════════════════════════════════════════════════════════════════
-- DOWN (reversión documentada — NO ejecutar salvo rollback):
--   1. DROP TABLE IF EXISTS public.service_production_order_links;
--   2. Recrear create_received_service_v2 (14 args) con cuerpo de
--      supabase/migrations/20260809000005 + GRANT service_role.
--   3. Recrear set_received_service_status / void_received_service_with_reversal /
--      distribute_service_cost_v2 con cuerpos del contract-surface previo
--      (gate has_store_access) — o desde 20260809000007/08 + G9.
--   4. Recrear close_cash_shift con cuerpo de 20260809000002 (v2.18.2).
--   5. Recrear get_sales_since_last_closure con cuerpo de 20260228.
--   6. Recrear get_daily_expenses_aggregated con cuerpo de
--      20260916000007 (REM-R2-C).
-- ══════════════════════════════════════════════════════════════════════════
