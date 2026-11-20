-- ============================================================================
-- 20261121120000 — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
-- Borradores, identidad de proveedor y liquidación inmediata multipago
-- ============================================================================
-- Alcance (misión 008 + complemento):
--   1) Borradores de Servicios Recibidos con CERO efecto financiero:
--      · RPC NUEVO create_received_service_draft (proveedor nullable, meta,
--        idempotencia por creation_key). create_received_service_v2 NO se
--        toca (cero riesgo de overloads PGRST203 contra el app vivo).
--      · RPC NUEVO update_received_service_draft (edita SOLO drafts;
--        fail-closed si ya tiene pagos o distribuciones).
--      · set_received_service_status (misma firma): gate draft→active =
--        proveedor no vacío + importe > 0. La confirmación exige proveedor.
--   2) Identidad del proveedor: columnas aditivas NULL-able (patrón snapshot
--      de receipts) + validación de ownership (tienda local / tenant maestro).
--   3) Liquidación inmediata multipago/multimoneda ATÓMICA: RPC NUEVO
--      register_supplier_payment_batch (1..20 componentes; pre-check de la
--      suma contra el saldo pendiente en la MONEDA DEL DOCUMENTO; un INSERT
--      de payment_transactions por componente vía register_supplier_payment
--      — mismo motor, mismas reglas de tasa fail-closed y asientos 'pago').
-- Invariantes financieros:
--   · Un borrador no contabiliza (fin_trg_received_services solo postea con
--     status='active' — verificado 20261113120100 L603; esta migración NO lo
--     toca).
--   · Ninguna obligación ni pago se duplica: advisory locks + transiciones
--     únicas + idempotencia de bloque y por componente.
--   · Las columnas nuevas son NULL-ables: los registros históricos
--     ('No especificado (registro histórico)' incluido) quedan intactos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Identidad de proveedor en received_services (aditivo, NULL-able)
-- ---------------------------------------------------------------------------
ALTER TABLE public.received_services
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_master_party_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_code text,
  ADD COLUMN IF NOT EXISTS supplier_tax_id text,
  ADD COLUMN IF NOT EXISTS supplier_phone text,
  ADD COLUMN IF NOT EXISTS supplier_address text;

COMMENT ON COLUMN public.received_services.supplier_id IS
  'ADN-008: proveedor LOCAL de la tienda (suppliers.id) si la selección proviene del catálogo; NULL para texto libre histórico. Owner validado por RPC.';
COMMENT ON COLUMN public.received_services.supplier_master_party_id IS
  'ADN-008: tercero del Clasificador Maestro (master_parties.id) cuando la identidad viene del maestro compartido; NULL en lo histórico.';
COMMENT ON COLUMN public.received_services.supplier_code IS
  'ADN-008: snapshot del código del proveedor al registrarse (relación histórica no depende de joins vivos).';
COMMENT ON COLUMN public.received_services.supplier_tax_id IS
  'ADN-008: snapshot del NIT/Tax ID al registrarse.';
COMMENT ON COLUMN public.received_services.supplier_phone IS
  'ADN-008: snapshot del teléfono al registrarse.';
COMMENT ON COLUMN public.received_services.supplier_address IS
  'ADN-008: snapshot de la dirección al registrarse.';

-- ---------------------------------------------------------------------------
-- 2) Helpers privados de la migración — ownership del proveedor (fail-closed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adn008_supplier_belongs_to_store(
  p_supplier_id uuid, p_store_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = p_supplier_id AND s.store_id = p_store_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.adn008_master_party_valid_for_store(
  p_master_party_id uuid, p_store_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.master_parties mp
    JOIN public.stores st ON st.tenant_id = mp.tenant_id
    WHERE mp.id = p_master_party_id
      AND st.id = p_store_id
      AND mp.status = 'active'
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3) RPC NUEVO — create_received_service_draft
--    Borrador: proveedor OPCIONAL (sin inventar datos), vínculos documentales
--    válidos, CERO efectos financieros (nunca activa, nunca paga).
--    Idempotencia de creación por p_creation_key (anti doble-clic / reintento).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_received_service_draft(
  p_store_id uuid,
  p_supplier text DEFAULT NULL::text,
  p_total_amount numeric DEFAULT NULL::numeric,
  p_service_type_id uuid DEFAULT NULL::uuid,
  p_service_type_name text DEFAULT 'Otro'::text,
  p_service_date date DEFAULT NULL::date,
  p_currency text DEFAULT 'CUP'::text,
  p_exchange_rate numeric DEFAULT 1.0,
  p_payment_terms_days integer DEFAULT 30,
  p_distribution_method text DEFAULT 'amount'::text,
  p_reference_doc text DEFAULT NULL::text,
  p_observations text DEFAULT NULL::text,
  p_receipt_ids jsonb DEFAULT '[]'::jsonb,
  p_production_order_ids jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL::uuid,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_supplier_master_party_id uuid DEFAULT NULL::uuid,
  p_supplier_meta jsonb DEFAULT NULL::jsonb,
  p_creation_key text DEFAULT NULL::text
)
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
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid())
    ELSE auth.uid()
  END;
  v_supplier text := NULLIF(btrim(COALESCE(p_supplier, '')), '');
  v_meta jsonb := COALESCE(p_supplier_meta, '{}'::jsonb);
BEGIN
  -- Idempotencia de creación: si la creation_key ya produjo un borrador en
  -- esta tienda, devolver ese servicio (anti doble-clic / reintento).
  IF p_creation_key IS NOT NULL AND btrim(p_creation_key) <> '' THEN
    SELECT al.record_id INTO v_service_id
    FROM audit_logs al
    WHERE al.action = 'SERVICE_DRAFT_CREATED'
      AND al.store_id = p_store_id
      AND al.table_name = 'received_services'
      AND al.metadata->>'creation_key' = btrim(p_creation_key)
    ORDER BY al.created_at DESC
    LIMIT 1;
    IF v_service_id IS NOT NULL THEN
      SELECT service_number INTO v_service_number
      FROM received_services WHERE id = v_service_id;
      RETURN jsonb_build_object(
        'status', 'success', 'service_id', v_service_id,
        'service_number', v_service_number, 'draft', true, 'duplicate', true
      );
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- Actor-explícito (doctrina create_sale_v2 / create_received_service_v2).
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Borrador: el proveedor es OPCIONAL (se completa antes de confirmar).
  -- La identidad, si llega, se valida fail-closed (sin inventar datos).
  IF p_supplier_id IS NOT NULL AND NOT public.adn008_supplier_belongs_to_store(p_supplier_id, p_store_id) THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_INVALID: % no pertenece a la tienda', p_supplier_id;
  END IF;
  IF p_supplier_master_party_id IS NOT NULL AND NOT public.adn008_master_party_valid_for_store(p_supplier_master_party_id, p_store_id) THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_MASTER_INVALID: % no pertenece al tenant de la tienda o no está activo', p_supplier_master_party_id;
  END IF;

  -- Requisito estructural mínimo del documento (identificable y almacenable).
  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
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
    payment_terms_days, due_date,
    supplier_id, supplier_master_party_id,
    supplier_code, supplier_tax_id, supplier_phone, supplier_address
  ) VALUES (
    p_store_id, v_service_number, COALESCE(p_service_date, CURRENT_DATE),
    p_service_type_id, p_service_type_name, v_supplier, p_reference_doc,
    p_currency, p_exchange_rate, p_total_amount, p_observations,
    'draft', p_distribution_method, v_caller_uid,
    p_payment_terms_days, (COALESCE(p_service_date, CURRENT_DATE) + p_payment_terms_days)::date,
    p_supplier_id, p_supplier_master_party_id,
    NULLIF(btrim(COALESCE(v_meta->>'code', '')), ''),
    NULLIF(btrim(COALESCE(v_meta->>'tax_id', '')), ''),
    NULLIF(btrim(COALESCE(v_meta->>'phone', '')), ''),
    NULLIF(btrim(COALESCE(v_meta->>'address', '')), '')
  ) RETURNING id INTO v_service_id;

  -- Vínculos documentales (misma validación que create_received_service_v2:
  -- misma tienda, recepción activa, OT no anulada/cerrada). NO distribuyen
  -- costos, NO tocan inventario, NO contabilizan.
  v_link_count := jsonb_array_length(COALESCE(p_receipt_ids, '[]'::jsonb));
  IF v_link_count > 0 THEN
    v_allocated_per_receipt := p_total_amount / v_link_count;
    FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_receipt_ids, '[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = p_store_id AND status = 'active') THEN
        RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
      END IF;
      INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
      VALUES (v_service_id, v_receipt_id, 100.0 / v_link_count, v_allocated_per_receipt);
    END LOOP;
  END IF;

  IF jsonb_array_length(COALESCE(p_production_order_ids, '[]'::jsonb)) > 0 THEN
    FOR v_order_id IN SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_production_order_ids, '[]'::jsonb)) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM production_orders
        WHERE id = v_order_id AND store_id = p_store_id
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
  VALUES (v_caller_uid, p_store_id, 'SERVICE_DRAFT_CREATED', 'received_services', v_service_id,
    jsonb_build_object(
      'service_number', v_service_number, 'supplier', v_supplier,
      'supplier_id', p_supplier_id, 'supplier_master_party_id', p_supplier_master_party_id,
      'total_amount', p_total_amount, 'currency', p_currency,
      'receipt_ids_linked', v_link_count, 'production_order_ids_linked', v_ot_count,
      'creation_key', NULLIF(btrim(COALESCE(p_creation_key, '')), '')
    ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', v_service_id,
    'service_number', v_service_number, 'link_count', v_link_count,
    'production_order_link_count', v_ot_count, 'draft', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_received_service_draft(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, jsonb, uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_received_service_draft(uuid, text, numeric, uuid, text, date, text, numeric, integer, text, text, text, jsonb, jsonb, uuid, uuid, uuid, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) RPC NUEVO — update_received_service_draft
--    Edita SOLO borradores. Fail-closed si ya tiene pagos o distribuciones.
--    Campos NULL = no cambiar; los arrays de vínculos NULL = no cambiar,
--    array = REEMPLAZAR el conjunto completo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_received_service_draft(
  p_service_id uuid,
  p_user_id uuid DEFAULT NULL::uuid,
  p_supplier text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_supplier_master_party_id uuid DEFAULT NULL::uuid,
  p_supplier_meta jsonb DEFAULT NULL::jsonb,
  p_service_type_id uuid DEFAULT NULL::uuid,
  p_service_type_name text DEFAULT NULL::text,
  p_total_amount numeric DEFAULT NULL::numeric,
  p_service_date date DEFAULT NULL::date,
  p_reference_doc text DEFAULT NULL::text,
  p_observations text DEFAULT NULL::text,
  p_distribution_method text DEFAULT NULL::text,
  p_receipt_ids jsonb DEFAULT NULL::jsonb,
  p_production_order_ids jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_supplier text;
  v_meta jsonb := p_supplier_meta; -- REEMPLAZO COMPLETO del snapshot (NULL limpia)
  v_receipt_id uuid;
  v_order_id uuid;
  v_count integer;
  v_link_count integer := 0;
  v_ot_count integer := 0;
  v_alloc numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, supplier
  INTO v_store_id, v_status, v_service_number, v_supplier
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo los borradores pueden editarse aquí (estado actual: %)', v_status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Fail-closed: un borrador con pagos o distribuciones ya no es editable
  -- por este canal (integridad — nada debería existir, pero se verifica).
  IF EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.ref_type = 'service' AND pt.ref_id = p_service_id) THEN
    RAISE EXCEPTION 'ERR_HAS_PAYMENTS: el borrador tiene pagos registrados';
  END IF;
  IF EXISTS (SELECT 1 FROM service_cost_distributions scd WHERE scd.service_id = p_service_id) THEN
    RAISE EXCEPTION 'ERR_HAS_DISTRIBUTIONS: el borrador tiene distribuciones de costo';
  END IF;

  -- Identidad de proveedor: REEMPLAZO COMPLETO (el cliente envía el estado
  -- completo deseado; NULL/ausente limpia). Validación fail-closed.
  IF p_supplier_id IS NOT NULL AND NOT public.adn008_supplier_belongs_to_store(p_supplier_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_INVALID: % no pertenece a la tienda', p_supplier_id;
  END IF;
  IF p_supplier_master_party_id IS NOT NULL AND NOT public.adn008_master_party_valid_for_store(p_supplier_master_party_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_MASTER_INVALID: % no pertenece al tenant de la tienda o no está activo', p_supplier_master_party_id;
  END IF;

  IF p_supplier IS NOT NULL THEN
    v_supplier := NULLIF(btrim(p_supplier), '');
  END IF;
  IF p_total_amount IS NOT NULL AND p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
  END IF;
  IF p_distribution_method IS NOT NULL AND p_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
    RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
  END IF;
  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id
      AND (store_id = v_store_id OR store_id IS NULL)
      AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
    END IF;
  END IF;
  IF p_service_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_service_date::timestamp with time zone, v_store_id);
  END IF;

  UPDATE received_services SET
    -- p_supplier NULL = no cambiar el nombre; '' = limpiarlo (NULL).
    -- La identidad (supplier_id / master / snapshot) es REEMPLAZO COMPLETO.
    supplier = CASE WHEN p_supplier IS NULL THEN supplier ELSE v_supplier END,
    supplier_id = p_supplier_id,
    supplier_master_party_id = p_supplier_master_party_id,
    supplier_code = CASE WHEN v_meta IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(v_meta->>'code', '')), '') END,
    supplier_tax_id = CASE WHEN v_meta IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(v_meta->>'tax_id', '')), '') END,
    supplier_phone = CASE WHEN v_meta IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(v_meta->>'phone', '')), '') END,
    supplier_address = CASE WHEN v_meta IS NULL THEN NULL ELSE NULLIF(btrim(COALESCE(v_meta->>'address', '')), '') END,
    service_type_id = COALESCE(p_service_type_id, service_type_id),
    service_type_name = COALESCE(p_service_type_name, service_type_name),
    total_amount = COALESCE(p_total_amount, total_amount),
    service_date = COALESCE(p_service_date, service_date),
    reference_doc = COALESCE(p_reference_doc, reference_doc),
    observations = COALESCE(p_observations, observations),
    distribution_method = COALESCE(p_distribution_method, distribution_method),
    due_date = CASE
      WHEN p_service_date IS NOT NULL THEN (p_service_date + payment_terms_days)::date
      ELSE due_date
    END,
    updated_at = NOW()
  WHERE id = p_service_id;

  -- Vínculos: NULL = no cambiar; array = reemplazar el conjunto completo.
  IF p_receipt_ids IS NOT NULL THEN
    DELETE FROM service_reception_links WHERE service_id = p_service_id;
    v_link_count := jsonb_array_length(p_receipt_ids);
    IF v_link_count > 0 THEN
      SELECT COALESCE(p_total_amount, total_amount) / v_link_count INTO v_alloc
      FROM received_services WHERE id = p_service_id;
      FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
        IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = v_store_id AND status = 'active') THEN
          RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
        END IF;
        INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
        VALUES (p_service_id, v_receipt_id, 100.0 / v_link_count, v_alloc);
      END LOOP;
    END IF;
  END IF;

  IF p_production_order_ids IS NOT NULL THEN
    DELETE FROM service_production_order_links WHERE service_id = p_service_id;
    IF jsonb_array_length(p_production_order_ids) > 0 THEN
      FOR v_order_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_production_order_ids) LOOP
        IF NOT EXISTS (
          SELECT 1 FROM production_orders
          WHERE id = v_order_id AND store_id = v_store_id
            AND status NOT IN ('voided', 'closed')
        ) THEN
          RAISE EXCEPTION 'ERR_PRODUCTION_ORDER_INVALID: % no pertenece a la tienda o su estado no admite vinculación', v_order_id;
        END IF;
        INSERT INTO service_production_order_links (service_id, production_order_id)
        VALUES (p_service_id, v_order_id)
        ON CONFLICT (service_id, production_order_id) DO NOTHING;
        v_ot_count := v_ot_count + 1;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO service_audit_log (service_id, user_id, action, details)
  VALUES (p_service_id, v_caller_uid, 'draft_updated', jsonb_build_object(
    'by_rpc', 'update_received_service_draft',
    'supplier', v_supplier, 'supplier_id', p_supplier_id,
    'supplier_master_party_id', p_supplier_master_party_id,
    'receipt_ids_replaced', (p_receipt_ids IS NOT NULL),
    'production_order_ids_replaced', (p_production_order_ids IS NOT NULL)
  ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'draft', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_received_service_draft(uuid, uuid, text, uuid, uuid, jsonb, uuid, text, numeric, date, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_received_service_draft(uuid, uuid, text, uuid, uuid, jsonb, uuid, text, numeric, date, text, text, text, jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) set_received_service_status — MISMA FIRMA; gate de confirmación
--    draft→active: proveedor no vacío + importe > 0 (la confirmación exige
--    los datos obligatorios; el borrador pudo guardarlos incompletos).
-- ---------------------------------------------------------------------------
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
  v_allowed text[];
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, supplier, total_amount
  INTO v_store_id, v_current, v_service_number, v_supplier, v_total
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

  -- ADN-008: la CONFIRMACIÓN (draft→active) exige los datos obligatorios del
  -- documento operativo. El borrador pudo guardarse incompleto a propósito.
  IF v_current = 'draft' AND p_new_status = 'active' THEN
    IF COALESCE(btrim(COALESCE(v_supplier, '')), '') = '' THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: completa el proveedor antes de confirmar el servicio';
    END IF;
    IF v_total IS NULL OR v_total <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_AMOUNT: el importe del servicio debe ser > 0 para confirmar';
    END IF;
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

-- ACL idéntica a la vigente (patrón repo: se re-declara).
REVOKE EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_received_service_status(uuid, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) RPC NUEVO — register_supplier_payment_batch
--    Liquidación inmediata multipago/multimoneda ATÓMICA (misma transacción).
--    · Pre-check: la suma de los componentes (en la MONEDA DEL DOCUMENTO,
--      misma aritmética que register_supplier_payment) no puede exceder el
--      saldo pendiente.
--    · Idempotencia de bloque: componente i ⇒ clave '<p_idempotency_key>:<i>'
--      (mismo formato que /api/payments usaba en el loop). Re-ejecutar el
--      lote completo converge: componentes existentes devuelven su id sin
--      insertar nada (register_supplier_payment es idempotente).
--    · Un INSERT de payment_transactions por componente ⇒ un asiento 'pago'
--      por componente vía fin_trg_payment_transactions (motor CP-FIN, sin
--      cambios) con cuenta canónica fin_resolve_financial_account(medio,moneda).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_supplier_payment_batch(
  p_store_id uuid,
  p_ref_type text,
  p_ref_id uuid,
  p_payments jsonb,
  p_paid_by uuid,
  p_payment_date timestamptz DEFAULT NULL::timestamptz,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_comp jsonb;
  v_comp_count integer;
  v_idx integer := 0;
  v_method text;
  v_currency text;
  v_amount numeric;
  v_rate numeric;
  v_amount_cup numeric;
  v_amount_in_doc numeric;
  v_sum_in_doc numeric := 0;
  v_doc_store_id uuid;
  v_doc_total numeric;
  v_doc_currency text;
  v_doc_rate numeric;
  v_paid numeric;
  v_balance numeric;
  v_payment_id uuid;
  v_block_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_ids jsonb := '[]'::jsonb;
  v_replay_complete boolean := true;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_store_rate numeric;
BEGIN
  -- Documento y ownership (misma resolución que register_supplier_payment).
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1)
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate
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

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  v_comp_count := jsonb_array_length(COALESCE(p_payments, '[]'::jsonb));
  IF v_comp_count < 1 OR v_comp_count > 20 THEN
    RAISE EXCEPTION 'ERR_BATCH_SIZE: el lote debe tener entre 1 y 20 componentes (recibidos: %)', v_comp_count;
  END IF;

  -- ── Pre-validación de TODOS los componentes (misma aritmética del motor) ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_method := btrim(COALESCE(v_comp->>'payment_method', ''));
    v_currency := btrim(COALESCE(v_comp->>'currency', 'CUP'));
    v_amount := NULLIF(v_comp->>'amount', '')::numeric;
    v_rate := COALESCE(NULLIF(v_comp->>'exchange_rate', '')::numeric, 0);

    IF v_method NOT IN ('cash', 'transfer', 'zelle') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: medio de pago no soportado (%) en componente %', v_method, v_idx + 1;
    END IF;
    IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: moneda no soportada (%) en componente %', v_currency, v_idx + 1;
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: importe debe ser > 0 en componente %', v_idx + 1;
    END IF;

    -- Tasa efectiva (misma lógica fail-closed de register_supplier_payment).
    IF v_currency = 'CUP' THEN
      v_rate := 1;
    ELSE
      IF COALESCE(v_rate, 0) <= 1 THEN
        SELECT rate INTO v_store_rate
        FROM public.store_exchange_rates
        WHERE store_id = p_store_id AND currency = v_currency
        ORDER BY updated_at DESC LIMIT 1;
        IF COALESCE(v_store_rate, 0) > 1 THEN
          v_rate := v_store_rate;
        ELSE
          RAISE EXCEPTION 'ERR_TASA_NO_DISPONIBLE: el componente % en % requiere tasa de conversión (> 1).', v_idx + 1, v_currency;
        END IF;
      END IF;
    END IF;

    v_amount_cup := CASE WHEN v_currency = 'CUP' THEN v_amount ELSE round(v_amount * v_rate, 2) END;
    v_amount_in_doc := CASE
      WHEN v_currency = v_doc_currency THEN v_amount
      ELSE v_amount_cup / v_doc_rate
    END;
    v_sum_in_doc := v_sum_in_doc + v_amount_in_doc;
  END LOOP;

  -- Saldo pendiente en la moneda del documento (igual que el motor).
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_balance := v_doc_total - v_paid;

  -- Fast path de replay: si TODOS los componentes del bloque ya existen,
  -- devolver sus ids sin escribir nada (reintento idempotente). DEBE preceder
  -- al pre-check de overpay: un lote ya aplicado deja saldo 0 y el reenvío
  -- idéntico no es un overpay — es un replay (lección E2E ADN-008/P1).
  IF v_block_key IS NOT NULL THEN
    FOR v_idx IN 0 .. v_comp_count - 1 LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.payment_transactions
        WHERE idempotency_key = v_block_key || ':' || v_idx
      ) THEN
        v_replay_complete := false;
        EXIT;
      END IF;
    END LOOP;
    IF v_replay_complete THEN
      FOR v_idx IN 0 .. v_comp_count - 1 LOOP
        SELECT id INTO v_payment_id
        FROM public.payment_transactions
        WHERE idempotency_key = v_block_key || ':' || v_idx
        LIMIT 1;
        v_ids := v_ids || jsonb_build_object(
          'id', v_payment_id, 'index', v_idx,
          'payment_method', p_payments -> v_idx ->> 'payment_method',
          'currency', COALESCE(p_payments -> v_idx ->> 'currency', 'CUP'),
          'amount', (p_payments -> v_idx ->> 'amount')::numeric,
          'replayed', true
        );
      END LOOP;
      RETURN jsonb_build_object('payments', v_ids, 'count', v_comp_count, 'replayed', true);
    END IF;
  END IF;

  -- Pre-check de overpay (SOLO tras descartar replay completo).
  IF v_sum_in_doc > v_balance THEN
    RAISE EXCEPTION 'ERR_BATCH_OVERPAY: el lote (%) excede el saldo pendiente (%). Overpay no permitido.', v_sum_in_doc, v_balance;
  END IF;

  -- ── Inserción por componente (misma transacción ⇒ ATÓMICO) ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_payment_id := public.register_supplier_payment(
      p_store_id => p_store_id,
      p_ref_type => p_ref_type,
      p_ref_id => p_ref_id,
      p_amount => (v_comp->>'amount')::numeric,
      p_payment_method => btrim(v_comp->>'payment_method'),
      p_paid_by => p_paid_by,
      p_currency => COALESCE(btrim(v_comp->>'currency'), 'CUP'),
      p_exchange_rate => COALESCE(NULLIF(v_comp->>'exchange_rate', '')::numeric, 1.0),
      p_reference => v_comp->>'reference',
      p_notes => v_comp->>'notes',
      p_idempotency_key => CASE WHEN v_block_key IS NOT NULL THEN v_block_key || ':' || v_idx ELSE NULL END,
      p_payment_date => p_payment_date
    );
    v_ids := v_ids || jsonb_build_object(
      'id', v_payment_id, 'index', v_idx,
      'payment_method', v_comp->>'payment_method',
      'currency', COALESCE(v_comp->>'currency', 'CUP'),
      'amount', (v_comp->>'amount')::numeric
    );
  END LOOP;

  RETURN jsonb_build_object('payments', v_ids, 'count', v_comp_count, 'replayed', false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment_batch(uuid, text, uuid, jsonb, uuid, timestamptz, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Limpieza de helpers (solo se usaron dentro de esta migración… no: son
--    STABLE y los invocan los RPC nuevos en runtime — se conservan).
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.adn008_supplier_belongs_to_store(uuid, uuid) IS
  'ADN-008: ownership fail-closed del proveedor local (suppliers.store_id).';
COMMENT ON FUNCTION public.adn008_master_party_valid_for_store(uuid, uuid) IS
  'ADN-008: ownership fail-closed del tercero maestro (tenant de la tienda + status active).';

-- ---------------------------------------------------------------------------
-- 8) Proveedor opcional EN BORRADOR (misión §3.2): el CHECK vigente
--    (20260809000001, recibido de la sync de esquema) exige supplier NOT NULL
--    y no vacío para TODO documento. El borrador puede guardarse incompleto
--    a propósito (sin inventar datos); la obligación estructural se conserva
--    para TODO documento no-borrador (activo/anulado) — defensa en profundidad
--    detrás del gate de confirmación de set_received_service_status.
--    Pre-verificado en aislado (2026-11-20): 0 filas no-draft con supplier
--    NULL/vacío → la nueva constraint valida sin conflicto.
-- ---------------------------------------------------------------------------
ALTER TABLE public.received_services DROP CONSTRAINT IF EXISTS received_services_supplier_not_null;
ALTER TABLE public.received_services ADD CONSTRAINT received_services_supplier_not_null
  CHECK ((status = 'draft') OR (supplier IS NOT NULL AND btrim(supplier) <> ''));

COMMENT ON CONSTRAINT received_services_supplier_not_null ON public.received_services IS
  'ADN-008: proveedor obligatorio en documentos operativos (active/voided); opcional en borrador — la confirmación lo exige vía set_received_service_status.';
