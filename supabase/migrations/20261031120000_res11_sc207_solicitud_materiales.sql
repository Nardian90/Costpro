-- ============================================================================
-- MISIÓN RESOLUCIÓN 11 — MÓDULO «SOLICITUD DE MATERIALES» (MODELO SC-2-07)
-- ============================================================================
-- Resolución No. 11/2007 del Ministerio de Finanzas y Precios (Gaceta Oficial
-- No. 015 Ordinaria de 12 de febrero de 2007, págs. 246–252, Anexo Único),
-- modelo SC-2-07 «SOLICITUD DE ENTREGA»:
--
--   OBJETIVO: «Formalizar el pedido de productos con destino al consumo de la
--   unidad solicitante.»
--   ALCANCE: uso obligatorio para todas las entidades dentro del territorio
--   nacional.
--   EMISIÓN/DISTRIBUCIÓN/UTILIZACIÓN: cada entidad definirá las áreas emisoras
--   del documento y la distribución de copias, si procede, acorde a sus
--   características organizativas.
--
-- DATOS DE USO OBLIGATORIO (9) → implementación COSTPRO:
--   1. Fecha de emisión del modelo
--        → material_requests.fecha_emision (date, NOT NULL, default hoy;
--          validada servidor: no futura, no anterior a 6 meses).
--   2. Nombre y código de la entidad
--        → Nombre: tienda activa (stores.name, automático bajo RLS).
--          Código: material_requests.entidad_codigo (snapshot; si el cliente
--          no lo indica se toma stores.reeup o stores.nit si existen).
--   3. Nombre y código del almacén al que se efectúa la Solicitud
--        → material_requests.warehouse_id (FK opcional a warehouses; el
--          nombre/código se resuelven SIEMPRE servidor: si hay warehouse_id
--          se toman de warehouses, si no, almacen_nombre textual del
--          solicitante + almacen_codigo opcional).
--   4. Nombre y código del área, del centro de costo y número de la Orden de
--      Producción o de Trabajo a la que se cargarán los productos
--        → material_requests.area_nombre (requerido) + area_codigo (opcional)
--          + centro_costo (opcional) + production_order_id (FK opcional a
--          production_orders — el número se muestra desde order_number).
--   5. Código, descripción, unidad de medida y cantidad de cada producto
--        → material_request_items: product_id (FK) + sku + descripcion +
--          unit_of_measure (snapshots servidor desde products) + quantity
--          (> 0, única por producto).
--   6. Nombre y firma del solicitante y fecha de la Solicitud
--        → material_requests.created_by (auto, JWT) + submitted_at (fecha en
--          que se envía a revisión) + fecha_emision.
--   7. Nombre y firma del funcionario que autoriza la Solicitud y fecha
--        → material_requests.authorized_by + authorized_at (registrados en la
--          CONFIRMACIÓN: el usuario que confirma es el funcionario que
--          autoriza).
--   8. Nombre y firma del empleado que recibe la Solicitud en el almacén y
--      fecha
--        → material_requests.received_by + received_at (registrados en la
--          CONFIRMACIÓN — misma transacción que el dato 7; ver informe:
--          decisión documentada de rol único digital).
--   9. Número consecutivo del modelo
--        → material_requests.request_number (SM-NNNNNN-YYYY vía
--          next_document_number(p_store_id,'material_request')).
--
-- FLUJO DOCUMENTAL (mismo estándar de Ajustes Documentales — pending→confirm/
-- void—, con las dos etapas pre-confirmación exigidas por la misión):
--   draft (Borrador, editable) → in_review (En Revisión, consulta/verificación)
--     → confirmed (Confirmada) | → draft (devolución para corrección)
--   draft|in_review → voided (Anulada, con motivo; jamás se borra).
--
-- SEGURIDAD (patrones certificados del proyecto):
--   - RLS ENABLE+FORCE en las 2 tablas nuevas; aislamiento por tienda con
--     current_user_store_ids() (mismo policy que issue_slips).
--   - Escrituras SOLO vía RPC SECURITY DEFINER con guard anti-spoofing
--     (CASE auth.role() = 'service_role'), has_store_access_as, FOR UPDATE,
--     SET search_path, REVOKE anon/PUBLIC, GRANT authenticated+service_role.
--   - Trust boundary: descripciones/costos/códigos de almacén se resuelven
--     SIEMPRE servidor; el cliente solo envía identificadores y cantidades.
--   - audit_logs en cada transición (CREATE/UPDATE/SUBMIT/CONFIRM/REOPEN/VOID).
--   - Idempotencia en la creación (check_idempotency/register_idempotency).
--
-- Esta migración es 100% ADITIVA: no toca tablas ni datos existentes (salvo
-- extender el CHECK de document_sequences y next_document_number para aceptar
-- el nuevo tipo 'material_request' — supersete estricto del comportamiento
-- previo para los tipos existentes).
-- ============================================================================

-- ============================================================================
-- 1. TABLAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.material_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  tenant_id uuid,
  -- Dato 9: número consecutivo del modelo
  request_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  -- Dato 1 / fecha de la Solicitud (dato 6)
  fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
  -- Dato 2: código de la entidad (nombre = tienda activa, automático)
  entidad_codigo text,
  -- Dato 3: almacén al que se efectúa la Solicitud
  warehouse_id uuid,
  almacen_nombre text NOT NULL,
  almacen_codigo text,
  -- Dato 4: área solicitante / centro de costo / OP-OT
  area_nombre text NOT NULL,
  area_codigo text,
  centro_costo text,
  production_order_id uuid,
  -- Notas de negocio de COSTPRO (dato adicional, no exigido por el modelo)
  notes text NOT NULL DEFAULT ''::text,
  -- Dato 6: solicitante (created_by) + fecha de envío a revisión
  submitted_at timestamptz,
  -- Dato 7: funcionario que autoriza + fecha (registrados al confirmar)
  authorized_by uuid,
  authorized_at timestamptz,
  -- Dato 8: empleado del almacén que recibe + fecha (registrados al confirmar)
  received_by uuid,
  received_at timestamptz,
  -- Anulación (trazabilidad: jamás borrado físico)
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  -- Devoluciones a borrador desde revisión (trazabilidad)
  reopen_count integer NOT NULL DEFAULT 0,
  last_reopen_reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_requests_pkey PRIMARY KEY (id),
  CONSTRAINT material_requests_status_check
    CHECK (status = ANY (ARRAY['draft'::text, 'in_review'::text, 'confirmed'::text, 'voided'::text])),
  CONSTRAINT material_requests_store_fkey FOREIGN KEY (store_id)
    REFERENCES public.stores (id) ON DELETE CASCADE,
  CONSTRAINT material_requests_warehouse_fkey FOREIGN KEY (warehouse_id)
    REFERENCES public.warehouses (id) ON DELETE SET NULL,
  CONSTRAINT material_requests_production_order_fkey FOREIGN KEY (production_order_id)
    REFERENCES public.production_orders (id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_created_by FOREIGN KEY (created_by) REFERENCES public.profiles (id),
  CONSTRAINT fk_mr_authorized_by FOREIGN KEY (authorized_by) REFERENCES public.profiles (id),
  CONSTRAINT fk_mr_received_by FOREIGN KEY (received_by) REFERENCES public.profiles (id),
  CONSTRAINT fk_mr_voided_by FOREIGN KEY (voided_by) REFERENCES public.profiles (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_material_requests_store_number
  ON public.material_requests (store_id, request_number);
CREATE INDEX IF NOT EXISTS idx_material_requests_store_created
  ON public.material_requests (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_requests_status
  ON public.material_requests (store_id, status);

-- Dato 5: líneas de la solicitud (snapshots servidor de código/descripción/UM)
CREATE TABLE IF NOT EXISTS public.material_request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  product_id uuid NOT NULL,
  sku text NOT NULL DEFAULT ''::text,
  descripcion text NOT NULL DEFAULT ''::text,
  unit_of_measure text NOT NULL DEFAULT ''::text,
  quantity numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_request_items_pkey PRIMARY KEY (id),
  CONSTRAINT material_request_items_quantity_check CHECK (quantity > (0)::numeric),
  CONSTRAINT material_request_items_request_fkey FOREIGN KEY (request_id)
    REFERENCES public.material_requests (id) ON DELETE CASCADE,
  CONSTRAINT material_request_items_product_fkey FOREIGN KEY (product_id)
    REFERENCES public.products (id) ON DELETE RESTRICT,
  CONSTRAINT material_request_items_unique_product UNIQUE (request_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_material_request_items_request
  ON public.material_request_items (request_id);

-- ============================================================================
-- 2. RLS — aislamiento multitienda (patrón issue_slips)
-- ============================================================================

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.material_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_request_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_requests_store_isolation ON public.material_requests;
CREATE POLICY material_requests_store_isolation ON public.material_requests
  FOR ALL TO authenticated
  USING (store_id = ANY (public.current_user_store_ids()))
  WITH CHECK (store_id = ANY (public.current_user_store_ids()));

DROP POLICY IF EXISTS material_request_items_store_isolation ON public.material_request_items;
CREATE POLICY material_request_items_store_isolation ON public.material_request_items
  FOR ALL TO authenticated
  USING (request_id IN (SELECT id FROM public.material_requests
        WHERE store_id = ANY (public.current_user_store_ids())))
  WITH CHECK (request_id IN (SELECT id FROM public.material_requests
        WHERE store_id = ANY (public.current_user_store_ids())));

-- Grants: lectura para authenticated; escritura SOLO vía RPC SECURITY DEFINER
REVOKE ALL ON public.material_requests FROM anon, authenticated;
GRANT SELECT ON public.material_requests TO authenticated;
GRANT ALL ON public.material_requests TO service_role;

REVOKE ALL ON public.material_request_items FROM anon, authenticated;
GRANT SELECT ON public.material_request_items TO authenticated;
GRANT ALL ON public.material_request_items TO service_role;

-- ============================================================================
-- 3. NUMERACIÓN — extender document_sequences + next_document_number con
--    'material_request' (prefijo SM). Supersete estricto: los tipos
--    existentes mantienen prefijos y semántica idénticos.
-- ============================================================================

ALTER TABLE public.document_sequences DROP CONSTRAINT document_sequences_document_type_check;
ALTER TABLE public.document_sequences ADD CONSTRAINT document_sequences_document_type_check
  CHECK (document_type = ANY (ARRAY['invoice'::text, 'credit_note'::text, 'quotation'::text,
    'z_report'::text, 'vale_salida'::text, 'cash_flow'::text, 'material_request'::text]));

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_store_id uuid,
  p_document_type text,
  p_user_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida', 'cash_flow', 'material_request') THEN
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
    WHEN 'material_request' THEN 'SM'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$;

-- ============================================================================
-- 4. RPC create_material_request — crea la Solicitud en estado BORRADOR
--    (dato 9: número consecutivo; snapshots servidor de datos 2/3/5)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_material_request(
  p_store_id uuid,
  p_fecha_emision date DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_almacen_nombre text DEFAULT NULL,
  p_almacen_codigo text DEFAULT NULL,
  p_entidad_codigo text DEFAULT NULL,
  p_area_nombre text DEFAULT NULL,
  p_area_codigo text DEFAULT NULL,
  p_centro_costo text DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_request_id uuid := gen_random_uuid();
  v_request_number text;
  v_fecha_emision date := COALESCE(p_fecha_emision, CURRENT_DATE);
  v_almacen_nombre text;
  v_almacen_codigo text;
  v_entidad_codigo text;
  v_reeup text;
  v_nit text;
  v_tenant uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_sku text;
  v_descripcion text;
  v_um text;
  v_seen_products uuid[] := ARRAY[]::uuid[];
  v_items_count integer := 0;
  v_param_hash text;
  v_existing jsonb;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- Dato 1: fecha de emisión — no futura, no anterior a 6 meses (mismo límite
  -- histórico que validate_operation_date aplica a vales/ventas).
  IF v_fecha_emision > CURRENT_DATE THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT';
  END IF;
  IF v_fecha_emision < (CURRENT_DATE - INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT';
  END IF;

  -- Dato 4: el área solicitante es obligatoria.
  IF p_area_nombre IS NULL OR btrim(p_area_nombre) = '' THEN
    RAISE EXCEPTION 'ERR_AREA_REQUIRED';
  END IF;

  -- Dato 3: almacén resuelto SIEMPRE servidor (trust boundary).
  IF p_warehouse_id IS NOT NULL THEN
    SELECT w.name, w.code INTO v_almacen_nombre, v_almacen_codigo
    FROM public.warehouses w
    WHERE w.id = p_warehouse_id AND w.store_id = p_store_id AND w.is_active = true;
    IF v_almacen_nombre IS NULL THEN
      RAISE EXCEPTION 'ERR_WAREHOUSE_NOT_FOUND';
    END IF;
  ELSE
    v_almacen_nombre := btrim(COALESCE(p_almacen_nombre, ''));
    IF v_almacen_nombre = '' THEN
      RAISE EXCEPTION 'ERR_WAREHOUSE_NAME_REQUIRED';
    END IF;
    v_almacen_codigo := NULLIF(btrim(COALESCE(p_almacen_codigo, '')), '');
  END IF;

  -- Dato 2: código de entidad — snapshot (cliente → reeup → nit; puede quedar
  -- en blanco si la entidad no lo ha registrado: el modelo se cumple con el
  -- nombre automático y el código se completa en el documento impreso).
  SELECT s.reeup, s.nit, s.tenant_id INTO v_reeup, v_nit, v_tenant
    FROM public.stores s WHERE s.id = p_store_id;
  v_entidad_codigo := COALESCE(
    NULLIF(btrim(COALESCE(p_entidad_codigo, '')), ''),
    NULLIF(btrim(COALESCE(v_reeup, '')), ''),
    NULLIF(btrim(COALESCE(v_nit, '')), ''));

  -- Dato 4: OP/OT asociada (opcional) — debe pertenecer a la tienda.
  IF p_production_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_orders po
    WHERE po.id = p_production_order_id AND po.store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  -- Idempotencia (misma infraestructura que create_vale_salida).
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    v_param_hash := md5(p_store_id::text || '|' || v_fecha_emision::text || '|' ||
      COALESCE(p_warehouse_id::text, '') || '|' || v_almacen_nombre || '|' ||
      COALESCE(p_area_nombre, '') || '|' || COALESCE(p_production_order_id::text, '') ||
      '|' || COALESCE(p_items::text, ''));
    v_existing := public.check_idempotency(p_idempotency_key, 'material_request', v_request_id, v_param_hash);
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
  v_request_number := public.next_document_number(p_store_id, 'material_request', v_caller_uid);

  INSERT INTO public.material_requests (
    id, store_id, tenant_id, request_number, status, fecha_emision,
    entidad_codigo, warehouse_id, almacen_nombre, almacen_codigo,
    area_nombre, area_codigo, centro_costo, production_order_id,
    notes, created_by, created_at
  ) VALUES (
    v_request_id, p_store_id, v_tenant, v_request_number, 'draft', v_fecha_emision,
    v_entidad_codigo, p_warehouse_id, v_almacen_nombre, v_almacen_codigo,
    btrim(p_area_nombre), NULLIF(btrim(COALESCE(p_area_codigo, '')), ''),
    NULLIF(btrim(COALESCE(p_centro_costo, '')), ''), p_production_order_id,
    COALESCE(btrim(p_notes), ''), v_caller_uid, now()
  );

  -- Dato 5: líneas con snapshots servidor (código, descripción, UM, cantidad).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY';
    END IF;
    IF v_product_id = ANY(v_seen_products) THEN
      RAISE EXCEPTION 'ERR_DUPLICATE_PRODUCT: %', v_product_id;
    END IF;
    v_seen_products := v_seen_products || v_product_id;

    SELECT p.sku, p.name, p.unit_of_measure INTO v_sku, v_descripcion, v_um
    FROM public.products p
    WHERE p.id = v_product_id AND p.store_id = p_store_id;
    IF v_descripcion IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;

    INSERT INTO public.material_request_items (
      request_id, product_id, sku, descripcion, unit_of_measure, quantity
    ) VALUES (
      v_request_id, v_product_id, COALESCE(v_sku, ''), v_descripcion,
      COALESCE(v_um, ''), v_quantity
    );
    v_items_count := v_items_count + 1;
  END LOOP;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'material_request', v_request_id, v_param_hash,
      jsonb_build_object('status', 'success', 'request_id', v_request_id,
        'request_number', v_request_number, 'items_count', v_items_count));
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_MATERIAL_REQUEST', 'material_requests', v_request_id, p_store_id, v_caller_uid,
    jsonb_build_object('request_number', v_request_number, 'status', 'draft',
      'fecha_emision', v_fecha_emision, 'items_count', v_items_count,
      'area_nombre', btrim(p_area_nombre), 'almacen_nombre', v_almacen_nombre,
      'production_order_id', p_production_order_id,
      'normativa', 'Res. 11/2007 MFP — Modelo SC-2-07 Solicitud de Entrega'));

  RETURN jsonb_build_object('status', 'success', 'request_id', v_request_id,
    'request_number', v_request_number, 'items_count', v_items_count);
END;
$function$;

-- ============================================================================
-- 5. RPC update_material_request — SOLO borrador (reemplaza cabecera+líneas)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_material_request(
  p_request_id uuid,
  p_fecha_emision date DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_almacen_nombre text DEFAULT NULL,
  p_almacen_codigo text DEFAULT NULL,
  p_entidad_codigo text DEFAULT NULL,
  p_area_nombre text DEFAULT NULL,
  p_area_codigo text DEFAULT NULL,
  p_centro_costo text DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_req public.material_requests%ROWTYPE;
  v_fecha_emision date := COALESCE(p_fecha_emision, CURRENT_DATE);
  v_almacen_nombre text;
  v_almacen_codigo text;
  v_entidad_codigo text;
  v_reeup text;
  v_nit text;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
  v_sku text;
  v_descripcion text;
  v_um text;
  v_seen_products uuid[] := ARRAY[]::uuid[];
  v_items_count integer := 0;
BEGIN
  -- Lock de fila: editar/anular/enviar concurrentes → exactamente uno gana.
  SELECT * INTO v_req FROM public.material_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_REQUEST_NOT_FOUND';
  END IF;
  IF v_req.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo se pueden editar solicitudes en borrador (estado actual: %)', v_req.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_req.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;
  IF v_fecha_emision > CURRENT_DATE THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT';
  END IF;
  IF v_fecha_emision < (CURRENT_DATE - INTERVAL '6 months')::date THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT';
  END IF;
  IF p_area_nombre IS NULL OR btrim(p_area_nombre) = '' THEN
    RAISE EXCEPTION 'ERR_AREA_REQUIRED';
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT w.name, w.code INTO v_almacen_nombre, v_almacen_codigo
    FROM public.warehouses w
    WHERE w.id = p_warehouse_id AND w.store_id = v_req.store_id AND w.is_active = true;
    IF v_almacen_nombre IS NULL THEN
      RAISE EXCEPTION 'ERR_WAREHOUSE_NOT_FOUND';
    END IF;
  ELSE
    v_almacen_nombre := btrim(COALESCE(p_almacen_nombre, ''));
    IF v_almacen_nombre = '' THEN
      RAISE EXCEPTION 'ERR_WAREHOUSE_NAME_REQUIRED';
    END IF;
    v_almacen_codigo := NULLIF(btrim(COALESCE(p_almacen_codigo, '')), '');
  END IF;

  SELECT s.reeup, s.nit INTO v_reeup, v_nit FROM public.stores s WHERE s.id = v_req.store_id;
  v_entidad_codigo := COALESCE(
    NULLIF(btrim(COALESCE(p_entidad_codigo, '')), ''),
    NULLIF(btrim(COALESCE(v_reeup, '')), ''),
    NULLIF(btrim(COALESCE(v_nit, '')), ''));

  IF p_production_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.production_orders po
    WHERE po.id = p_production_order_id AND po.store_id = v_req.store_id
  ) THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND';
  END IF;

  -- Reemplazo transaccional de líneas: validar TODO antes de mutar.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY';
    END IF;
    IF v_product_id = ANY(v_seen_products) THEN
      RAISE EXCEPTION 'ERR_DUPLICATE_PRODUCT: %', v_product_id;
    END IF;
    v_seen_products := v_seen_products || v_product_id;
    SELECT p.name INTO v_descripcion FROM public.products p
    WHERE p.id = v_product_id AND p.store_id = v_req.store_id;
    IF v_descripcion IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;
    v_items_count := v_items_count + 1;
  END LOOP;

  UPDATE public.material_requests SET
    fecha_emision = v_fecha_emision,
    entidad_codigo = v_entidad_codigo,
    warehouse_id = p_warehouse_id,
    almacen_nombre = v_almacen_nombre,
    almacen_codigo = v_almacen_codigo,
    area_nombre = btrim(p_area_nombre),
    area_codigo = NULLIF(btrim(COALESCE(p_area_codigo, '')), ''),
    centro_costo = NULLIF(btrim(COALESCE(p_centro_costo, '')), ''),
    production_order_id = p_production_order_id,
    notes = COALESCE(btrim(p_notes), ''),
    updated_at = now()
  WHERE id = p_request_id;

  DELETE FROM public.material_request_items WHERE request_id = p_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    SELECT p.sku, p.name, p.unit_of_measure INTO v_sku, v_descripcion, v_um
    FROM public.products p WHERE p.id = v_product_id;
    INSERT INTO public.material_request_items (
      request_id, product_id, sku, descripcion, unit_of_measure, quantity
    ) VALUES (
      p_request_id, v_product_id, COALESCE(v_sku, ''), v_descripcion,
      COALESCE(v_um, ''), v_quantity
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('UPDATE_MATERIAL_REQUEST', 'material_requests', p_request_id, v_req.store_id, v_caller_uid,
    jsonb_build_object('request_number', v_req.request_number, 'status', 'draft',
      'items_count', v_items_count));

  RETURN jsonb_build_object('status', 'success', 'request_id', p_request_id,
    'request_number', v_req.request_number, 'items_count', v_items_count);
END;
$function$;

-- ============================================================================
-- 6. RPC submit_material_request — borrador → EN REVISIÓN (emisión formal;
--    dato 6: fecha de la Solicitud = submitted_at)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_material_request(
  p_request_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_req public.material_requests%ROWTYPE;
  v_items_count integer;
BEGIN
  SELECT * INTO v_req FROM public.material_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_REQUEST_NOT_FOUND';
  END IF;
  IF v_req.status <> 'draft' THEN
    RAISE EXCEPTION 'ERR_NOT_DRAFT: solo se pueden enviar a revisión solicitudes en borrador (estado actual: %)', v_req.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_req.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT count(*) INTO v_items_count FROM public.material_request_items WHERE request_id = p_request_id;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  UPDATE public.material_requests
  SET status = 'in_review', submitted_at = now(), updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SUBMIT_MATERIAL_REQUEST', 'material_requests', p_request_id, v_req.store_id, v_caller_uid,
    jsonb_build_object('request_number', v_req.request_number, 'from', 'draft', 'to', 'in_review',
      'items_count', v_items_count, 'solicitante', v_req.created_by));

  RETURN jsonb_build_object('status', 'success', 'request_id', p_request_id,
    'request_number', v_req.request_number, 'to', 'in_review');
END;
$function$;

-- ============================================================================
-- 7. RPC confirm_material_request — EN REVISIÓN → CONFIRMADA
--    Registra los datos 7 y 8 del modelo (funcionario que autoriza y
--    empleado del almacén que recibe, con sus fechas) en la misma transacción.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_material_request(
  p_request_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_req public.material_requests%ROWTYPE;
  v_items_count integer;
BEGIN
  SELECT * INTO v_req FROM public.material_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_REQUEST_NOT_FOUND';
  END IF;
  IF v_req.status <> 'in_review' THEN
    RAISE EXCEPTION 'ERR_NOT_IN_REVIEW: solo se pueden confirmar solicitudes en revisión (estado actual: %)', v_req.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_req.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT count(*) INTO v_items_count FROM public.material_request_items WHERE request_id = p_request_id;
  IF v_items_count = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  UPDATE public.material_requests
  SET status = 'confirmed',
      authorized_by = v_caller_uid,
      authorized_at = now(),
      received_by = v_caller_uid,
      received_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CONFIRM_MATERIAL_REQUEST', 'material_requests', p_request_id, v_req.store_id, v_caller_uid,
    jsonb_build_object('request_number', v_req.request_number, 'from', 'in_review', 'to', 'confirmed',
      'items_count', v_items_count,
      'authorized_by', v_caller_uid,
      'nota_modelo', 'Datos 7 y 8 del SC-2-07 registrados en la confirmación'));

  RETURN jsonb_build_object('status', 'success', 'request_id', p_request_id,
    'request_number', v_req.request_number, 'to', 'confirmed',
    'authorized_by', v_caller_uid);
END;
$function$;

-- ============================================================================
-- 8. RPC reopen_material_request — EN REVISIÓN → BORRADOR (devolución para
--    corrección; trazabilidad con motivo y contador)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reopen_material_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_req public.material_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.material_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_REQUEST_NOT_FOUND';
  END IF;
  IF v_req.status <> 'in_review' THEN
    RAISE EXCEPTION 'ERR_NOT_IN_REVIEW: solo se pueden devolver a borrador las solicitudes en revisión (estado actual: %)', v_req.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_req.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;

  UPDATE public.material_requests
  SET status = 'draft',
      submitted_at = NULL,
      reopen_count = reopen_count + 1,
      last_reopen_reason = btrim(p_reason),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REOPEN_MATERIAL_REQUEST', 'material_requests', p_request_id, v_req.store_id, v_caller_uid,
    jsonb_build_object('request_number', v_req.request_number, 'from', 'in_review', 'to', 'draft',
      'reason', btrim(p_reason), 'reopen_count', v_req.reopen_count + 1));

  RETURN jsonb_build_object('status', 'success', 'request_id', p_request_id,
    'request_number', v_req.request_number, 'to', 'draft');
END;
$function$;

-- ============================================================================
-- 9. RPC void_material_request — BORRADOR|EN REVISIÓN → ANULADA
--    Trazabilidad total: motivo obligatorio, jamás borrado físico.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.void_material_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_req public.material_requests%ROWTYPE;
  v_items_count integer;
BEGIN
  SELECT * INTO v_req FROM public.material_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_REQUEST_NOT_FOUND';
  END IF;
  IF v_req.status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'ERR_NOT_VOIDABLE: solo se pueden anular solicitudes en borrador o en revisión (estado actual: %)', v_req.status;
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_req.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED';
  END IF;

  SELECT count(*) INTO v_items_count FROM public.material_request_items WHERE request_id = p_request_id;

  UPDATE public.material_requests
  SET status = 'voided',
      voided_at = now(),
      voided_by = v_caller_uid,
      void_reason = btrim(p_reason),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_MATERIAL_REQUEST', 'material_requests', p_request_id, v_req.store_id, v_caller_uid,
    jsonb_build_object('request_number', v_req.request_number, 'from', v_req.status, 'to', 'voided',
      'reason', btrim(p_reason), 'items_count', v_items_count));

  RETURN jsonb_build_object('status', 'success', 'request_id', p_request_id,
    'request_number', v_req.request_number, 'to', 'voided');
END;
$function$;

-- ============================================================================
-- 10. ACL de las RPC (patrón sec_definer_hardening: sin EXECUTE para PUBLIC/anon)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.create_material_request(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_material_request(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_material_request(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_material_request(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_material_request(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_material_request(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.confirm_material_request(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_material_request(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reopen_material_request(uuid, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reopen_material_request(uuid, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.void_material_request(uuid, text, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.void_material_request(uuid, text, uuid) FROM PUBLIC, anon;

-- ============================================================================
-- 11. Comentarios de trust boundary (documentación viva)
-- ============================================================================
COMMENT ON FUNCTION public.create_material_request(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, text, uuid) IS
'TRUST BOUNDARY: p_user_id DEBE venir del JWT (session.user.id), NUNCA del body del request. El cliente SOLO envía identificadores (product_id, warehouse_id, production_order_id) y cantidades; descripciones, códigos de producto, UM, nombre/código del almacén y código de entidad se resuelven SIEMPRE servidor. Modelo SC-2-07 «Solicitud de Entrega» (Res. 11/2007 MFP): datos de uso obligatorio 1–9 cubiertos; crear → estado draft.';
COMMENT ON FUNCTION public.confirm_material_request(uuid, uuid) IS
'SC-2-07 datos 7–8: el usuario que confirma queda registrado como funcionario que autoriza (authorized_by/at) y como empleado del almacén que recibe (received_by/at) — decisión documentada de rol único digital. In_review → confirmed, transaccional con lock FOR UPDATE.';
