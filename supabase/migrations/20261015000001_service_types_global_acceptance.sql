-- ============================================================================
-- 20261015000001 — service_types: aceptación del catálogo GLOBAL por el RPC
-- Misión: Servicios Recibidos — tipos de servicio configurables
-- ============================================================================
--
-- PROBLEMA (auditoría 2026-10-15):
--   La tabla service_types existe con 9 tipos GLOBALES (store_id IS NULL,
--   catálogo compartido por diseño multitienda). Pero create_received_service_v2
--   validaba el tipo SOLO contra la tienda activa:
--
--     WHERE id = p_service_type_id AND store_id = p_store_id AND is_active = true
--
--   Un tipo global (store_id NULL) nunca satisface `store_id = p_store_id`
--   (NULL = NULL es NULL en SQL) → ERR_SERVICE_TYPE_NOT_FOUND para TODOS los
--   tipos del catálogo oficial. Consecuencia: el frontend tuvo que recurrir a
--   una lista estática en código y jamás envía service_type_id, dejando la FK
--   received_services.service_type_id huérfana y la integridad tipo↔registro
--   sin poder implementarse (no se puede saber qué tipos están "en uso").
--
-- CAMBIO (mínimo y quirúrgico):
--   La validación acepta el tipo si es de LA TIENDA ACTIVA o GLOBAL:
--     WHERE id = p_service_type_id
--       AND (store_id = p_store_id OR store_id IS NULL)
--       AND is_active = true
--
--   · Solo cambia el predicado de validación del catálogo. Cero toques a
--     tablas de datos, RLS, permisos o al resto de la función.
--   · Compatible con datos existentes: los tipos store-scoped (si algún día
--     se crean) siguen resolviendo igual; los globales pasan a ser válidos.
--   · Reversible: re-aplicar la definición anterior (predicado original
--     documentado más abajo) restaura el comportamiento previo al 100%.
--
-- INTEGRIDAD ADICIONAL (aditiva, sin riesgo de datos):
--   Índice único parcial para el catálogo global: no pueden existir dos tipos
--   globales cuyo nombre coincida ignorando mayúsculas y espacios de sobra.
--   Defensa en profundidad detrás de la validación de la API. Los 9 tipos
--   actuales cumplen el predicado (verificado 2026-10-15) → el índice crea
--   sin conflicto. Reversible con DROP INDEX IF EXISTS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) RPC create_received_service_v2 — única diferencia vs. la versión v2.18.0
--    vigente: el predicado de validación del service type.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_received_service_v2(
  p_store_id uuid,
  p_supplier text,
  p_total_amount numeric,
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
  p_created_by uuid DEFAULT NULL::uuid,
  p_production_order_ids jsonb DEFAULT '[]'::jsonb
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
$function$;

-- ---------------------------------------------------------------------------
-- 2) Índice único parcial (defensa en profundidad contra duplicados globales).
--    Complementa la validación case/space-insensitive de la API.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS service_types_global_name_uniq
  ON public.service_types (lower(btrim(name)))
  WHERE store_id IS NULL;
