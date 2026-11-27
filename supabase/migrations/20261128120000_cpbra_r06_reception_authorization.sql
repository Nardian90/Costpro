-- ============================================================================
-- Migration: 20261128120000_cpbra_r06_reception_authorization.sql
-- Misión:    CP-BRA-R06-FINAL-CERTIFICATION-001 — R-06 / PUR-001
-- Fecha:     2026-11-28
-- ============================================================================
-- DECISIÓN EXPRESA DEL PROPIETARIO (vinculante, §0 del prompt):
--   CREAR recepción: membresía ACTIVA + rol exacto 'encargado' en la tienda,
--   o superadministrador de plataforma. Ningún otro rol (almacenero/warehouse,
--   clerk, usuario, manager, admin de tienda, admin de plataforma) obtiene
--   permiso de creación por el mero hecho de tener acceso a la tienda.
--   CONFIRMAR/ANULAR: el CREADOR ORIGINAL de la recepción con membresía
--   activa en la tienda propietaria, o superadministrador. Los demás no
--   pueden intervenir en recepciones ajenas.
--   SUPERADMIN: acceso global de AUTORIZACIÓN, sujeto a máquina de estados y
--   guards financieros (no elimina invariantes).
--   HISTÓRICOS sin creador verificable (user_id NULL o centinela
--   00000000-0000-0000-0000-000000000000): solo superadministrador.
--
-- VERIFICACIÓN DE ROLES (§0.1 «Comprueba los nombres y valores exactos»):
--   enum user_role VIVO (BD aislada, espejo de producción): admin, superadmin,
--   manager, clerk, warehouse, encargado, usuario, costo, tenant_admin.
--   NO existe un rol 'facturadora' en el sistema: la facturadora operativa es
--   un miembro 'clerk'. No se inventan ni normalizan roles: 'warehouse'
--   (almacenero) y 'clerk' NO quedan tratados como 'encargado'.
--
-- CAMBIO TÉCNICO (auditoría FASE 1):
--   · 9 RPC de recepciones (register_reception, receive_against_po,
--     confirm_pending_reception, void_pending_reception, reverse_receipt_v2,
--     delete_pending_reception, save_pending_reception_changes,
--     add_reception_items, update_reception_items) usaban SOLO
--     has_store_access_as / has_store_access (membresía cualquiera o admin de
--     plataforma) — sin gate de rol para crear y sin propiedad del creador
--     para confirmar/anular. Se sustituye el gate por los helpers canónicos
--     nuevos; TODO lo demás queda byte-idéntico (verificado programáticamente
--     desde pg_get_functiondef de la BD).
--   · RLS: receipts_insert_rls / receipts_update_rls / receipts_delete_rls /
--     receipts_tenant_update / receipt_items_insert_isolated se endurecen a
--     la misma política (creación=encargado|superadmin; mutación=creador|
--     superadmin). SELECT sin cambios (lectura para miembros).
--   · Disparador NUEVO receipts_pin_creator: el creador (user_id) queda
--     asignado por la identidad autenticada del servidor para clientes
--     autenticados (el flujo de borradores insertaba user_id desde el
--     navegador) y user_id pasa a INMUTABLE en UPDATE (§2.1: una edición
--     posterior del borrador no puede cambiar al creador para ganar permisos).
--   · Auditoría transaccional: confirm_pending_reception registra
--     RECEPTION_CONFIRMED_PENDING (antes no auditaba en BD); void/reverse
--     extienden su entrada con fuente de autorización, creador original y
--     bandera de intervención global del superadmin (§FASE 5).
-- ============================================================================

-- ─── UP ─────────────────────────────────────────────────────────────────────
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) HELPERS CANÓNICOS DE AUTORIZACIÓN (única fuente de verdad de R-06)
--    is_superadmin_uid: variante por-uid del check canónico is_superadmin()
--    (misma tabla/columna/predicado; para contextos service_role con p_user_id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_superadmin_uid(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND role = 'superadmin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_superadmin_uid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin_uid(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_superadmin_uid(uuid) IS
  'CP-BRA-R06: variante por-uid del check canónico de superadministrador de plataforma (is_superadmin() es auth.uid()-based). Misma fuente de verdad: profiles.role = superadmin.';

-- CREACIÓN (§0.1): membresía activa + rol exacto 'encargado', o superadmin.
-- NO usa has_store_role_as: esa función da bypass a admin de plataforma, y la
-- decisión del propietario NO concede creación por ser admin.
CREATE OR REPLACE FUNCTION public.can_create_reception(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  IF public.is_superadmin_uid(p_user_id) THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role = 'encargado'::user_role
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_create_reception(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_create_reception(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_create_reception(uuid, uuid) IS
  'CP-BRA-R06 §0.1: permiso de CREAR recepciones = membresía activa con rol exacto encargado en la tienda, o superadministrador de plataforma. El acceso a la tienda con cualquier otro rol NO concede creación.';

-- CONFIRMACIÓN/ANULACIÓN (§0.2): creador original + membresía activa, o
-- superadmin. Creador no verificable (NULL/centinela histórico) → solo superadmin.
CREATE OR REPLACE FUNCTION public.can_manage_reception(p_actor uuid, p_creator uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
  IF public.is_superadmin_uid(p_actor) THEN RETURN true; END IF;
  -- §0.5: registros históricos sin creador verificable → solo superadmin.
  IF p_creator IS NULL OR p_creator = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RETURN false;
  END IF;
  -- La autorización de confirmar/anular es del creador original, no del rol.
  IF p_actor <> p_creator THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships m
    WHERE m.user_id = p_actor
      AND m.store_id = p_store_id
      AND m.status = 'active'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_manage_reception(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_reception(uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_reception(uuid, uuid, uuid) IS
  'CP-BRA-R06 §0.2: permiso de CONFIRMAR/ANULAR (y editar borrador) = creador original con membresía activa en la tienda propietaria, o superadministrador. Sin nueva exigencia de rol encargado sobre recepción propia. Creadores no verificables (NULL/centinela) → solo superadmin.';


-- ─── 2) register_reception: gate de creación encargado|superadmin ───

CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_invoice_number text DEFAULT NULL::text, p_items jsonb DEFAULT NULL::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid, p_supplier_code text DEFAULT NULL::text, p_supplier_address text DEFAULT NULL::text, p_supplier_phone text DEFAULT NULL::text, p_supplier_tax_id text DEFAULT NULL::text)
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
  -- MISIÓN RECEPCIONES (2026-10-27): alta transaccional de productos nuevos
  v_new_product JSONB;
  v_new_sku TEXT;
  v_new_tenant_id UUID;
  v_created_skus TEXT[] := '{}';
  -- CP-RECEP-001: conteo de códigos oficiales asignados por el servidor
  v_new_skus_autoassigned int := 0;
  v_new_products_count INTEGER := 0;
  -- CP-CAT-MAESTRO-003: sincronización con el catálogo maestro
  v_store_connected BOOLEAN := FALSE;
  v_master_id UUID;
  v_master_status TEXT;
  v_master_name TEXT;
  v_master_created_count INTEGER := 0;
  v_master_linked_count INTEGER := 0;
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  -- CP-BRA-R06 (§0.1, decisión del propietario): creación de recepciones =
  -- membresía ACTIVA con rol exacto 'encargado' en la tienda, o
  -- superadministrador de plataforma. El acceso a la tienda con cualquier
  -- otro rol (warehouse/almacenero, clerk/facturadora, usuario, manager,
  -- admin de tienda o de plataforma) NO concede permiso de creación.
  IF v_caller_uid IS NULL OR NOT public.can_create_reception(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: la creación de recepciones requiere rol encargado con membresía activa en la tienda (o superadministrador de plataforma)';
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  IF p_invoice_number IS NOT NULL AND btrim(p_invoice_number) <> '' AND EXISTS (
    SELECT 1 FROM public.receipts
    WHERE store_id = p_store_id
      AND reference_doc IS NOT NULL
      AND reference_doc = btrim(p_invoice_number)
  ) THEN
    RAISE EXCEPTION 'ERR_INVOICE_DUPLICATE: el número de factura "%" ya existe en esta tienda. Usa un número distinto.', btrim(p_invoice_number);
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id,
    supplier_code, supplier_address, supplier_phone, supplier_tax_id
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id,
    p_supplier_code, p_supplier_address, p_supplier_phone, p_supplier_tax_id
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;

    IF v_item ? 'new_product' THEN
      IF v_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_AMBIGUOUS_ITEM: el item trae product_id y new_product a la vez';
      END IF;
      v_new_product := v_item->'new_product';
      v_new_sku := btrim(COALESCE(v_new_product->>'sku', ''));
      IF btrim(COALESCE(v_new_product->>'name', '')) = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre', v_new_sku;
      END IF;
      -- CP-RECEP-001: el tenant se resuelve ANTES de la asignación de código.
      IF v_new_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;
      -- CP-RECEP-001: producto nuevo SIN SKU tecleado → el SERVIDOR le asigna
      -- el siguiente código del consecutivo OFICIAL del Catálogo Maestro
      -- (next_master_catalog_sku, advisory xact lock por tenant). Ya no se
      -- exige SKU tecleado ni se depende del generador AUTO-* del cliente
      -- (eliminado del frontend: producía códigos fuera del consecutivo).
      IF v_new_sku = '' THEN
        v_new_sku := public.next_master_catalog_sku(v_new_tenant_id);
        v_new_skus_autoassigned := v_new_skus_autoassigned + 1;
      END IF;
      IF v_new_sku = ANY (v_created_skus) THEN
        RAISE EXCEPTION 'ERR_SKU_DUPLICATE_PAYLOAD: el SKU "%" aparece más de una vez entre los productos nuevos de la recepción', v_new_sku;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE store_id = p_store_id AND sku = v_new_sku
      ) THEN
        RAISE EXCEPTION 'ERR_SKU_EXISTS: el SKU "%" ya existe en el catálogo de esta tienda. Selecciona el producto existente (o actívalo desde el Catálogo Maestro con el asistente de importación) en lugar de crearlo de nuevo.', v_new_sku;
      END IF;
      IF v_new_tenant_id IS NULL THEN
        -- (CP-RECEP-001: ya resuelto antes de asignar código; guard defensivo)
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;

      v_store_connected := public.is_catalog_store_connected(v_new_tenant_id, p_store_id);

      IF v_store_connected THEN
        v_master_id := NULL;
        v_master_status := NULL;
        v_master_name := NULL;
        SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
          FROM public.master_products
         WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
         FOR UPDATE;

        IF v_master_id IS NOT NULL AND v_master_status = 'active' AND EXISTS (
          SELECT 1 FROM public.products
           WHERE master_product_id = v_master_id AND store_id = p_store_id
        ) THEN
          -- CASO A7 · vínculo ya ocupado por otra fila local (inconsistencia
          -- previa tras reetiquetado). Se RECHAZA la escritura con error
          -- accionable — jamás una fila local huérfana en tienda conectada.
          RAISE EXCEPTION 'ERR_MASTER_LINK_CONFLICT: el vínculo del maestro (SKU "%") con esta tienda ya está ocupado por otra fila local. Requiere revisión de gobernanza (reetiquetado/conciliación): no se crea un producto independiente ni se registra la recepción.', v_new_sku;
        ELSIF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
          -- CASO A4 · maestro existente y activo: VINCULAR (reutilizar identidad).
          -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 §5: el nombre de la
          -- fila local es el CANÓNICO del maestro (v_master_name) — NUNCA el
          -- nombre del payload/Excel. La auditoría conserva
          -- 'local_name_requested' para trazabilidad.
          INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, v_master_name,
              COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
              COALESCE((v_new_product->>'price')::NUMERIC, 0),
              COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
              TRUE,
              COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
              0
            ) RETURNING id INTO v_product_id;
          v_master_linked_count := v_master_linked_count + 1;

          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_PRODUCT_LINKED_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
            jsonb_build_object(
              'sku', v_new_sku,
              'master_product_id', v_master_id,
              'master_name', v_master_name,
              'local_name_requested', btrim(v_new_product->>'name'),
              'name_source', 'master_canonical',
              'receipt_id', v_receipt_id,
              'product_id', v_product_id,
              'at', now()));
        ELSE
          IF v_master_id IS NULL THEN
            -- CASO A5 · alta de identidad compartida (SOLO identidad compartida).
            -- La creación de identidad maestra exige autorización (paridad
            -- create_master_product): admin global o rol admin/manager/encargado.
            IF NOT public.is_admin_check(v_caller_uid)
               AND NOT public.has_store_role_as(v_caller_uid, p_store_id, ARRAY['admin','manager','encargado']::text[]) THEN
              RAISE EXCEPTION 'ERR_UNAUTHORIZED_MASTER_CREATE: crear el producto "%" en el Catálogo Maestro requiere rol admin/manager/encargado en la tienda (o administración global). Usa el asistente de importación de recepciones para clasificar y crear con autorización.', v_new_sku;
            END IF;
            BEGIN
              INSERT INTO public.master_products
                (tenant_id, sku, name, image_path, barcode, unit_of_measure, is_service, status, created_by)
              VALUES
                (v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'), NULL, NULL,
                 COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
                 FALSE, 'active', v_user_id)
              RETURNING id INTO v_master_id;

              v_master_created_count := v_master_created_count + 1;
              v_master_status := 'active';
              v_master_name := btrim(v_new_product->>'name');

              INSERT INTO public.master_change_log
                (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
              VALUES
                (v_master_id, v_new_tenant_id, 'sku', NULL, v_new_sku, v_user_id, p_store_id),
                (v_master_id, v_new_tenant_id, 'name', NULL, v_master_name, v_user_id, p_store_id);
            EXCEPTION WHEN unique_violation THEN
              -- Carrera: otra tienda creó el mismo SKU en paralelo. Se reutiliza
              -- el maestro ganador (un solo maestro por organización) y su
              -- NOMBRE canónico — el payload de ESTA llamada no renombra (§9).
              v_master_status := NULL;
              v_master_name := NULL;
              SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
                FROM public.master_products
               WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
               FOR UPDATE;
            END;
          END IF;

          IF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
            -- CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 §5: nombre local =
            -- v_master_name (canónico; el del GANADOR en la carrera §9).
            INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, v_master_name,
              COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
              COALESCE((v_new_product->>'price')::NUMERIC, 0),
              COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
              TRUE,
              COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
              0
            ) RETURNING id INTO v_product_id;
            v_master_linked_count := v_master_linked_count + 1;

            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES ('RECEPTION_PRODUCT_LINKED_MASTER', 'master_products', v_master_id, p_store_id, v_caller_uid,
              jsonb_build_object(
                'sku', v_new_sku,
                'master_product_id', v_master_id,
                'master_name', v_master_name,
                'local_name_requested', btrim(v_new_product->>'name'),
                'name_source', 'master_canonical',
                'receipt_id', v_receipt_id,
                'product_id', v_product_id,
                'at', now()));
          ELSE
            -- CASO A6 · maestro archivado: se RECHAZA (error accionable) —
            -- la reactivación global es decisión de gobernanza explícita.
            RAISE EXCEPTION 'ERR_MASTER_ARCHIVED: el producto maestro del SKU "%" está archivado en el Catálogo Maestro. Requiere reactivación global por un gobernador del catálogo (confirmación explícita desde el asistente de importación) antes de poder recibirlo; no se crea un producto independiente.', v_new_sku;
          END IF;
        END IF;
      ELSE
        -- CASO B · tienda NO conectada: alta local pura, sin maestro ni
        -- relaciones (funcionamiento de la tienda sin cambios).
        INSERT INTO public.products (
            store_id, tenant_id, sku, name, cost_price, price,
            unit_of_measure, is_active, is_complete, stock_current
          ) VALUES (
            p_store_id, v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'),
            COALESCE((v_new_product->>'cost_price')::NUMERIC, 0),
            COALESCE((v_new_product->>'price')::NUMERIC, 0),
            COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
            TRUE,
            COALESCE((v_new_product->>'is_complete')::BOOLEAN, TRUE),
            0
          ) RETURNING id INTO v_product_id;
      END IF;

      v_created_skus := array_append(v_created_skus, v_new_sku);
      v_new_products_count := v_new_products_count + 1;
    END IF;

    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

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

    -- WAC primero → movimiento después (orden doctrina W62-01 §6).
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
      'authorization_source', CASE WHEN public.is_superadmin_uid(v_caller_uid) THEN 'platform_superadmin' ELSE 'encargado_membership' END,
      'superadmin_global', public.is_superadmin_uid(v_caller_uid),
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id,
      'new_products_created', v_new_products_count,
      'new_products_master_created', v_master_created_count,
      'new_products_master_linked', v_master_linked_count,
      'new_products_sku_autoassigned', v_new_skus_autoassigned
    ));

  RETURN v_receipt_id;
END
$function$;


-- ─── 3) receive_against_po: recibir contra OC = creación → mismo gate ───

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

  -- ─── 2. Validar autorización de CREACIÓN de recepción (CP-BRA-R06 §0.1):
  --        recibir contra OC crea una recepción → mismo permiso que
  --        register_reception: encargado con membresía activa o superadmin.
  --        (register_reception re-verifica el gate en su propia barrera.)
  IF NOT public.can_create_reception(auth.uid(), v_store_id) THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: recibir contra una orden de compra requiere rol encargado con membresía activa en la tienda (o superadministrador de plataforma)';
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
$function$;


-- ─── 4) confirm_pending_reception: creador|superadmin + auditoría ───

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
  -- CP-BRA-R06 §FASE 5: fuente de autorización para la auditoría transaccional.
  v_auth_source text;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'pending' THEN RAISE EXCEPTION 'ERR_RECEIPT_ALREADY_CONFIRMED: status=%', v_receipt.status; END IF;

  v_store_id := v_receipt.store_id;
  -- CP-BRA-R06 (§0.2, decisión del propietario): confirmar es derecho del
  -- CREADOR ORIGINAL con membresía activa, o del superadministrador (global).
  -- El acceso a la tienda NO concede confirmar recepciones ajenas; no se
  -- añade exigencia de rol encargado sobre una recepción propia.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede confirmarla';
  END IF;
  v_auth_source := CASE WHEN public.is_superadmin_uid(v_caller_uid) THEN 'platform_superadmin' ELSE 'creator_membership' END;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
    v_units_to_add := v_item.quantity;

    -- Orden doctrina W62-01 §6: WAC primero → movimiento después (kardex ve ca_new)
    PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_in',
                    v_units_to_add, v_unit_cost_cup,
                    jsonb_build_object('rpc','confirm_pending_reception','receipt_id',p_receipt_id));

    UPDATE products SET updated_at = v_effective_date WHERE id = v_item.product_id AND store_id = v_store_id;

    -- CP-RECEP-001: el movimiento de confirmación porta el ENLACE DOCUMENTAL
    -- (notes = receipt.id) exigido por la doctrina del saldo posterior
    -- (lib/inventory/saldo-posterior.ts) — en paridad con register_reception.
    -- Antes quedaba notes=NULL y el SC-2-04 imprimía «s/d» injustificado.
    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, notes, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', p_receipt_id::text, v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'active', reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id), updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';

  -- CP-BRA-R06 §FASE 5: auditoría transaccional de la confirmación (antes la
  -- confirmación no dejaba entrada en BD): actor real, tienda, recepción,
  -- estados previo/nuevo, creador original y fuente de autorización.
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid,
    v_store_id,
    'RECEPTION_CONFIRMED_PENDING',
    'receipts',
    p_receipt_id,
    jsonb_build_object(
      'authorization_source', v_auth_source,
      'superadmin_global', public.is_superadmin_uid(v_caller_uid),
      'creator_id', v_receipt.user_id,
      'old_status', 'pending',
      'new_status', 'active',
      'items_confirmed', (SELECT COUNT(*) FROM public.receipt_items WHERE receipt_id = p_receipt_id),
      'operation_date', v_effective_date
    )
  );
END $function$;


-- ─── 5) void_pending_reception: creador|superadmin + auditoría ───

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
  -- CP-BRA-R06 (§0.2): anular es derecho del CREADOR ORIGINAL con membresía
  -- activa, o del superadministrador. Guardas de estado/pagos intactas.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede anularla';
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
      'authorization_source', CASE WHEN public.is_superadmin_uid(v_caller_uid) THEN 'platform_superadmin' ELSE 'creator_membership' END,
      'superadmin_global', public.is_superadmin_uid(v_caller_uid),
      'creator_id', v_receipt.user_id,
      'old_status', 'pending',
      'new_status', 'voided',
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


-- ─── 6) reverse_receipt_v2: creador|superadmin + auditoría ───

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
  -- CP-BRA-R06 (§0.2): la reversión ES la anulación de una recepción
  -- confirmada → derecho del CREADOR ORIGINAL con membresía activa, o del
  -- superadministrador global. Sustituye el par has_store_access_as +
  -- can_reverse_document (rol admin/manager/encargado/warehouse) que
  -- permitía intervenir recepciones ajenas. Guardas financieras intactas.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede revertirla';
  END IF;

  -- W9.5 B-10: capa normativa de rol (fuente unica can_reverse_document).
  -- Politica congelada: operadores de recepciones (membership admin/manager/
  -- encargado/warehouse en la tienda del receipt) o admin global transversal.

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
                        'authorization_source', CASE WHEN public.is_superadmin_uid(v_caller_uid) THEN 'platform_superadmin' ELSE 'creator_membership' END,
                        'superadmin_global', public.is_superadmin_uid(v_caller_uid),
                        'creator_id', v_receipt.user_id,
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
$function$;


-- ─── 7) delete_pending_reception: creador|superadmin ───

CREATE OR REPLACE FUNCTION public.delete_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_store_id uuid;
  v_items_deleted integer := 0;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  -- 1. Lock de la fila (concurrencia: confirmar/anular/eliminar a la vez →
  --    exactamente una operación gana; el resto ve el estado ya avanzado).
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND';
  END IF;

  -- 2. Guard de estado: SOLO borradores (pending). Una recepción confirmada
  --    (active), anulada (voided) o revertida (reversed) NO se elimina —
  --    su rectificación es Anular/Revertir con trazabilidad.
  IF v_receipt.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: solo se pueden eliminar recepciones en estado pendiente/borrador (estado actual: %). Para descartar una recepción confirmada usa Revertir; para una anulada no hay acción.', v_receipt.status;
  END IF;

  v_store_id := v_receipt.store_id;

  -- 3. Autorización multitienda (mismo guard que void_pending_reception).
  -- CP-BRA-R06 (§0.2): eliminar un borrador es intervenir la recepción →
  -- creador original con membresía activa, o superadministrador.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede eliminar el borrador';
  END IF;

  -- 4. Defense-in-depth: un borrador nunca tocó inventario ni pagos, pero si
  --    por cualquier vía existen efectos ligados, se rechaza el borrado.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE store_id = v_store_id AND notes = p_receipt_id::text
  ) THEN
    RAISE EXCEPTION 'ERR_RECEIPT_HAS_MOVEMENTS: la recepción tiene movimientos de inventario asociados; usa Revertir';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_transactions
    WHERE ref_type = 'receipt' AND ref_id = p_receipt_id
  ) THEN
    RAISE EXCEPTION 'ERR_RECEIPT_HAS_PAYMENTS: la recepción tiene pagos asociados; usa Anular';
  END IF;

  -- 5. Eliminar líneas (SECURITY DEFINER pasa receipt_items_delete_denied;
  --    service_reception_links / commission_reception_links /
  --    service_cost_distributions tienen ON DELETE CASCADE).
  DELETE FROM public.receipt_items WHERE receipt_id = p_receipt_id;
  GET DIAGNOSTICS v_items_deleted = ROW_COUNT;

  -- 6. Eliminar cabecera
  DELETE FROM public.receipts WHERE id = p_receipt_id;

  -- 7. Trazabilidad de la eliminación (política de auditoría del módulo:
  --    paridad con void_pending_reception — quién, qué, cuándo y contenido).
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'DELETE_PENDING_RECEPTION', 'receipts', p_receipt_id,
    jsonb_build_object(
      'status', 'success',
      'supplier', v_receipt.supplier,
      'reference_doc', v_receipt.reference_doc,
      'reception_date', v_receipt.reception_date,
      'total_cost', v_receipt.total_cost,
      'items_deleted', v_items_deleted,
      'deleted_at', now()
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_receipt_id,
    'items_deleted', v_items_deleted
  );
END
$function$;


-- ─── 8) save_pending_reception_changes: creador|superadmin ───

CREATE OR REPLACE FUNCTION public.save_pending_reception_changes(p_receipt_id uuid, p_header jsonb DEFAULT '{}'::jsonb, p_item_updates jsonb DEFAULT '[]'::jsonb, p_new_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_supplier text;
  v_reference_doc text;
  v_notes text;
  v_has_economic boolean := FALSE;
  v_header_update jsonb := '{}'::jsonb;
  v_update_res jsonb := NULL;
  v_add_res jsonb := NULL;
  v_new_total numeric;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
    FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- CP-BRA-R06 (§0.2): editar un borrador es intervenir la recepción →
  -- creador original con membresía activa, o superadministrador.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede editar el borrador';
  END IF;

  v_supplier := NULLIF(btrim(COALESCE(p_header->>'supplier', '')), '');
  v_reference_doc := NULLIF(btrim(COALESCE(p_header->>'reference_doc', '')), '');
  v_notes := p_header->>'notes';

  IF (p_item_updates IS NOT NULL AND jsonb_typeof(p_item_updates) = 'array' AND jsonb_array_length(p_item_updates) > 0)
     OR (p_new_items IS NOT NULL AND jsonb_typeof(p_new_items) = 'array' AND jsonb_array_length(p_new_items) > 0)
     OR v_supplier IS NOT NULL OR v_reference_doc IS NOT NULL THEN
    v_has_economic := TRUE;
  END IF;
  IF v_has_economic AND v_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: los datos económicos/documentales solo son editables en recepciones pendientes (estado actual: %)', v_status;
  END IF;

  -- 1. Cabecera.
  IF v_supplier IS NOT NULL THEN v_header_update := v_header_update || jsonb_build_object('supplier', v_supplier); END IF;
  IF v_reference_doc IS NOT NULL THEN v_header_update := v_header_update || jsonb_build_object('reference_doc', v_reference_doc); END IF;
  IF v_notes IS NOT NULL THEN v_header_update := v_header_update || jsonb_build_object('notes', v_notes); END IF;
  IF v_header_update <> '{}'::jsonb THEN
    UPDATE public.receipts SET
      supplier = COALESCE(v_header_update->>'supplier', supplier),
      reference_doc = COALESCE(v_header_update->>'reference_doc', reference_doc),
      notes = COALESCE(v_header_update->>'notes', notes),
      updated_at = now()
    WHERE id = p_receipt_id;
  END IF;

  -- 2. Actualizaciones de líneas existentes (RPC canónica, misma transacción).
  IF p_item_updates IS NOT NULL AND jsonb_typeof(p_item_updates) = 'array' AND jsonb_array_length(p_item_updates) > 0 THEN
    v_update_res := public.update_reception_items(p_receipt_id, p_item_updates, v_caller_uid);
  END IF;

  -- 3. Líneas nuevas (RPC canónica, misma transacción).
  IF p_new_items IS NOT NULL AND jsonb_typeof(p_new_items) = 'array' AND jsonb_array_length(p_new_items) > 0 THEN
    v_add_res := public.add_reception_items(p_receipt_id, p_new_items, v_caller_uid);
  END IF;

  SELECT total_cost INTO v_new_total FROM public.receipts WHERE id = p_receipt_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', COALESCE(v_update_res->>'updated_count', '0'),
    'failed_count', COALESCE(v_update_res->>'failed_count', '0'),
    'added_count', COALESCE(v_add_res->>'added_count', '0'),
    'idempotent_skipped', COALESCE(v_add_res->>'idempotent_skipped', '0'),
    'new_total', v_new_total,
    'added', COALESCE(v_add_res->'items', '[]'::jsonb)
  );
END
$function$;


-- ─── 9) add_reception_items: creador|superadmin ───

CREATE OR REPLACE FUNCTION public.add_reception_items(p_receipt_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_tenant uuid;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_res jsonb;
  v_product_id uuid;
  v_sku text;
  v_name text;
  v_qty numeric;
  v_cost numeric;
  v_uom text;
  v_moneda text;
  v_tasa numeric;
  v_resolve_rows jsonb := '[]'::jsonb;
  v_resolve_res jsonb;
  v_pos_map jsonb := '[]'::jsonb;
  v_map_entry jsonb;
  v_resolve_cursor int := 0;
  v_added jsonb := '[]'::jsonb;
  v_added_count int := 0;
  v_idem_count int := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_blocked_list text[] := ARRAY[]::text[];
  v_new_total numeric;
  v_row jsonb;
  v_local_sku text;
  v_local_id uuid;
  v_dup record;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
    FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- CP-BRA-R06 (§0.2): agregar líneas a un borrador es intervenir la
  -- recepción → creador original con membresía activa, o superadministrador.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede modificar el borrador';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo se pueden agregar productos a recepciones pendientes (estado actual: %)', v_status;
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: se requiere al menos una línea';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'ERR_BULK_LIMIT: máximo 200 líneas por lote';
  END IF;

  -- Fase A: validar forma de cada línea y clasificar (directas vs a resolver).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_moneda := COALESCE(NULLIF(btrim(COALESCE(v_item->>'moneda_recepcion', '')), ''), 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::numeric, 1);
    v_uom := NULLIF(btrim(COALESCE(v_item->>'unit_of_measure', '')), '');

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: la cantidad debe ser > 0 (recibido %)', v_qty;
    END IF;
    IF v_cost IS NULL OR v_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: el costo unitario debe ser > 0 (recibido %)', v_cost;
    END IF;
    IF v_moneda NOT IN ('CUP','USD','EUR','MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: moneda % no soportada', v_moneda;
    END IF;
    IF v_moneda = 'CUP' AND v_tasa <> 1 THEN
      RAISE EXCEPTION 'ERR_INVALID_TASA: la tasa de CUP debe ser 1 (recibido %)', v_tasa;
    END IF;
    IF v_moneda <> 'CUP' AND (v_tasa IS NULL OR v_tasa <= 1.5) THEN
      RAISE EXCEPTION 'ERR_INVALID_TASA: la tasa de % debe ser > 1.5 (recibido %)', v_moneda, v_tasa;
    END IF;

    IF (v_item->>'product_id') IS NULL OR btrim(COALESCE(v_item->>'product_id', '')) = '' THEN
      v_name := NULLIF(btrim(COALESCE(v_item->>'name', '')), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'ERR_PRODUCT_WITHOUT_NAME: la línea sin product_id exige nombre';
      END IF;
      v_resolve_rows := v_resolve_rows || jsonb_build_object(
        'sku', COALESCE(NULLIF(btrim(COALESCE(v_item->>'sku', '')), ''), ''),
        'name', v_name,
        'barcode', COALESCE(NULLIF(btrim(COALESCE(v_item->>'barcode', '')), ''), ''),
        'quantity', v_qty,
        'unit_cost', v_cost,
        'unit_of_measure', COALESCE(v_uom, 'unidad'),
        'sale_price', v_item->>'sale_price'
      );
    ELSE
      v_product_id := (v_item->>'product_id')::uuid;
      IF v_product_id = ANY(v_seen) THEN
        RAISE EXCEPTION 'ERR_DUPLICATE_IN_BATCH: el producto % aparece dos veces en el lote', v_product_id;
      END IF;
      v_seen := array_append(v_seen, v_product_id);
    END IF;
  END LOOP;

  -- Fase B: resolver las líneas sin product_id con el ESCRITOR CANÓNICO
  -- (misma transacción: si algo posterior falla, todo se revierte y no
  -- quedan maestros/filas locales huérfanas — misión §4).
  IF jsonb_array_length(v_resolve_rows) > 0 THEN
    v_resolve_res := public.resolve_reception_import_rows(
      p_store_id := v_store_id,
      p_rows := v_resolve_rows,
      p_confirm_reactivation := '[]'::jsonb,
      p_user_id := v_caller_uid
    );
    -- Mapa POSICIONAL resultado⇄fila (results[i] ↔ v_resolve_rows[i]).
    FOR v_res IN SELECT * FROM jsonb_array_elements(COALESCE(v_resolve_res->'results', '[]'::jsonb)) LOOP
      IF (v_res->>'action') = 'blocked' THEN
        v_blocked_list := array_append(v_blocked_list,
          COALESCE(NULLIF(v_res->>'sku', ''), '(sin código)') || ': ' ||
          COALESCE(v_res->'reasons'->>0, 'requiere revisión'));
        v_pos_map := v_pos_map || 'null'::jsonb;
      ELSIF (v_res->>'product_id') IS NOT NULL AND btrim(COALESCE(v_res->>'product_id', '')) <> '' THEN
        v_pos_map := v_pos_map || jsonb_build_object(
          'product_id', v_res->>'product_id', 'sku', v_res->>'sku');
      ELSE
        -- new_local (tienda NO conectada): se resuelve en Fase C.
        v_pos_map := v_pos_map || 'null'::jsonb;
        v_blocked_list := array_append(v_blocked_list, '__NEW_LOCAL__');
      END IF;
    END LOOP;
    -- Ninguna fila puede quedar bloqueada (fail-closed, misión §10).
    IF EXISTS (SELECT 1 FROM unnest(v_blocked_list) b WHERE b <> '__NEW_LOCAL__') THEN
      RAISE EXCEPTION 'ERR_ROWS_BLOCKED: no se agregó nada (transacción revertida): %',
        array_to_string(ARRAY(SELECT b FROM unnest(v_blocked_list) b WHERE b <> '__NEW_LOCAL__'), ' | ');
    END IF;
  END IF;

  -- Fase C: tienda NO conectada — filas new_local crean su fila local con
  -- el código canónico del tenant (paridad del flujo de borradores nuevo).
  IF jsonb_array_length(v_resolve_rows) > 0
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_pos_map) m WHERE jsonb_typeof(m) = 'null') THEN
    SELECT tenant_id INTO v_tenant FROM public.stores WHERE id = v_store_id;
    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_WITHOUT_TENANT';
    END IF;
    FOR v_i IN 1..jsonb_array_length(v_resolve_rows) LOOP
      IF (v_pos_map->(v_i - 1)) IS NULL THEN
        v_row := v_resolve_rows->(v_i - 1);
        v_local_sku := NULLIF(btrim(COALESCE(v_row->>'sku', '')), '');
        IF v_local_sku IS NULL THEN
          v_local_sku := public.next_master_catalog_sku(v_tenant);
        END IF;
        INSERT INTO public.products (
          store_id, tenant_id, sku, name, price, cost_price, cost_average,
          unit_of_measure, is_active, is_complete, stock_current, min_stock
        ) VALUES (
          v_store_id, v_tenant, v_local_sku,
          COALESCE(NULLIF(btrim(COALESCE(v_row->>'name', '')), ''), v_local_sku),
          COALESCE(NULLIF(v_row->>'sale_price', '')::numeric, 0),
          COALESCE((v_row->>'unit_cost')::numeric, 0), 1,
          COALESCE(NULLIF(btrim(COALESCE(v_row->>'unit_of_measure', '')), ''), 'unidad'),
          true, false, 0, 1
        ) RETURNING id INTO v_local_id;
        v_pos_map := jsonb_set(v_pos_map, ARRAY[(v_i - 1)::text],
          jsonb_build_object('product_id', v_local_id, 'sku', v_local_sku));
        INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
        VALUES (v_caller_uid, v_store_id, 'RECEPTION_ADD_ITEM_LOCAL_CREATED', 'products', v_local_id,
          jsonb_build_object('sku', v_local_sku, 'origin', 'add_reception_items',
            'receipt_id', p_receipt_id, 'store_connected', false,
            'sku_assigned_by_server', (v_row->>'sku') IS NULL));
      END IF;
    END LOOP;
  END IF;

  -- Fase D: insertar TODAS las líneas (orden original del lote; el mapa
  -- posicional avanza SOLO en las líneas que fueron a resolución).
  v_resolve_cursor := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_cost := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_moneda := COALESCE(NULLIF(btrim(COALESCE(v_item->>'moneda_recepcion', '')), ''), 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::numeric, 1);

    IF (v_item->>'product_id') IS NOT NULL AND btrim(COALESCE(v_item->>'product_id', '')) <> '' THEN
      v_product_id := (v_item->>'product_id')::uuid;
    ELSE
      v_resolve_cursor := v_resolve_cursor + 1;
      v_map_entry := v_pos_map->(v_resolve_cursor - 1);
      IF v_map_entry IS NULL OR (v_map_entry->>'product_id') IS NULL THEN
        RAISE EXCEPTION 'ERR_RESOLUTION_MISMATCH: la línea "%" no pudo resolverse con el escritor canónico', COALESCE(v_item->>'name', '(sin nombre)');
      END IF;
      v_product_id := (v_map_entry->>'product_id')::uuid;
    END IF;

    -- El producto debe existir y pertenecer a ESTA tienda (re-verificación
    -- en runtime — también cubre las filas creadas por la resolución).
    SELECT p.sku, p.name INTO v_sku, v_name
      FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = v_store_id;
    IF v_sku IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: el producto % no pertenece a la tienda de la recepción', v_product_id;
    END IF;

    -- Duplicados: línea idéntica ya presente → salto idempotente; distinta
    -- → error con remedio (misión §4: reintentos sin duplicar).
    SELECT ri.quantity, ri.unit_cost, ri.moneda_recepcion, ri.tasa_cambio_recepcion
      INTO v_dup
      FROM public.receipt_items ri
      WHERE ri.receipt_id = p_receipt_id AND ri.product_id = v_product_id
      LIMIT 1;
    IF FOUND THEN
      IF v_dup.quantity = v_qty AND v_dup.unit_cost = v_cost
         AND COALESCE(v_dup.moneda_recepcion, 'CUP') = v_moneda
         AND COALESCE(v_dup.tasa_cambio_recepcion, 1) = v_tasa THEN
        v_idem_count := v_idem_count + 1;
        v_added := v_added || jsonb_build_object('product_id', v_product_id, 'sku', v_sku,
          'name', v_name, 'state', 'already_present_idempotent');
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'ERR_PRODUCT_ALREADY_IN_RECEIPT: "%" (producto %) ya está en la recepción con otros datos — edite su cantidad/costo en la tabla en lugar de agregarlo de nuevo', v_name, v_sku;
    END IF;

    INSERT INTO public.receipt_items
      (receipt_id, product_id, quantity, unit_cost, moneda_recepcion, tasa_cambio_recepcion)
    VALUES
      (p_receipt_id, v_product_id, v_qty, v_cost, v_moneda, v_tasa);

    v_added_count := v_added_count + 1;
    v_added := v_added || jsonb_build_object(
      'product_id', v_product_id, 'sku', v_sku, 'name', v_name,
      'quantity', v_qty, 'unit_cost', v_cost, 'moneda', v_moneda,
      'sku_assigned_by_server', COALESCE(NULLIF(btrim(COALESCE(v_item->>'sku', '')), ''), '') = '');
  END LOOP;

  -- Total recalculado con la doctrina del módulo (valida coherencia global).
  v_new_total := public.calculate_receipt_total_cup(p_receipt_id);
  UPDATE public.receipts SET total_cost = v_new_total, updated_at = now()
    WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'reception_items_added', 'receipts', p_receipt_id,
    jsonb_build_object(
      'added', v_added_count, 'idempotent_skipped', v_idem_count,
      'new_total', v_new_total,
      'origin', 'cp_recepciones_catalogo_maestro_001_fase3',
      'items', v_added));

  RETURN jsonb_build_object(
    'status', 'success',
    'added_count', v_added_count,
    'idempotent_skipped', v_idem_count,
    'new_total', v_new_total,
    'items', v_added
  );
END
$function$;


-- ─── 10) update_reception_items: creador|superadmin ───

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

  -- CP-BRA-R06: gate reescrito (antes patrón v2.12.12 has_store_access_as)
  -- CP-BRA-R06 (§0.2): actualizar líneas de un borrador es intervenir la
  -- recepción → creador original con membresía activa, o superadministrador.
  IF v_caller_uid IS NULL OR NOT public.can_manage_reception(v_caller_uid, v_receipt.user_id, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: solo el creador original de la recepción (con membresía activa) o el superadministrador puede modificar el borrador';
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
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11) DISPARADOR — identidad del creador desde el servidor (§2.1)
--     · INSERT (cliente autenticado): user_id := auth.uid() — el flujo de
--       borradores del navegador (useSavePendingReception) mandaba user_id
--       libremente; ahora el creador SIEMPRE es la identidad autenticada.
--     · service_role: conserva el user_id provisto (flujos de servidor).
--     · UPDATE: user_id INMUTABLE (§0.5: no reasignar creadores; §2.1: la
--       edición de un borrador no puede cambiar al creador para ganar
--       permisos de confirmación/anulación).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.receipts_pin_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'service_role' THEN
      -- Flujos de servidor: creador provisto (o identidad del servicio).
      NEW.user_id := COALESCE(NEW.user_id, auth.uid());
    ELSIF auth.role() = 'authenticated' THEN
      -- Cliente autenticado: la identidad la fija el servidor, NUNCA el body.
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'ERR_CREATOR_REQUIRED: recepción sin identidad autenticada';
      END IF;
      NEW.user_id := auth.uid();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'ERR_CREATOR_IMMUTABLE: el creador de una recepción no puede reasignarse (CP-BRA-R06 §0.5/§2.1)';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.receipts_pin_creator() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_receipts_pin_creator ON public.receipts;
CREATE TRIGGER trg_receipts_pin_creator
  BEFORE INSERT OR UPDATE OF user_id ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.receipts_pin_creator();

COMMENT ON FUNCTION public.receipts_pin_creator() IS
  'CP-BRA-R06 §2.1: el creador (receipts.user_id) se asigna desde la identidad autenticada del servidor y es inmutable en UPDATE.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 12) RLS — la matriz de autorización también en la barrera de tabla
--     (§FASE 3: «una llamada directa al RPC debe producir el mismo resultado
--      que una llamada desde la interfaz»; un permiso de lectura no debe
--      convertirse en permiso de creación/confirmación/anulación).
--     SELECT queda como estaba: la lectura sigue disponible para miembros.
-- ─────────────────────────────────────────────────────────────────────────────

-- CREACIÓN por INSERT directo (flujo de borradores del navegador):
-- solo encargado (membresía activa) o superadmin.
DROP POLICY IF EXISTS receipts_insert_rls ON public.receipts;
CREATE POLICY receipts_insert_rls ON public.receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid()
        AND m.store_id = receipts.store_id
        AND m.status = 'active'
        AND m.role = 'encargado'::user_role
    )
  );

-- MUTACIÓN por UPDATE directo: creador o superadmin. Reemplaza
-- receipts_update_rls (membresía cualquiera) y receipts_tenant_update
-- (is_admin|has_store_access): un admin de tienda/plataforma o un miembro
-- cualquiera ya NO puede tocar (ni virar status) recepciones ajenas — la
-- confirmación/anulación pasa EXCLUSIVAMENTE por los RPC con gate.
DROP POLICY IF EXISTS receipts_update_rls ON public.receipts;
DROP POLICY IF EXISTS receipts_tenant_update ON public.receipts;
CREATE POLICY receipts_update_rls ON public.receipts
  FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR receipts.user_id = auth.uid())
  WITH CHECK (public.is_superadmin() OR receipts.user_id = auth.uid());

-- BORRADO directo: creador (o superadmin) y solo borradores pendientes
-- (rollback de creación fallida del flujo de borradores).
DROP POLICY IF EXISTS receipts_delete_rls ON public.receipts;
CREATE POLICY receipts_delete_rls ON public.receipts
  FOR DELETE TO authenticated
  USING (
    (public.is_superadmin() OR receipts.user_id = auth.uid())
    AND receipts.status = 'pending'
  );

-- Líneas de recepción: INSERT directo solo para el mismo permiso de creación
-- (el borrador del navegador inserta receipt_items tras la cabecera).
DROP POLICY IF EXISTS receipt_items_insert_isolated ON public.receipt_items;
CREATE POLICY receipt_items_insert_isolated ON public.receipt_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.receipts r
      JOIN public.user_store_memberships m ON m.store_id = r.store_id
      WHERE r.id = receipt_items.receipt_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role = 'encargado'::user_role
    )
  );

COMMENT ON POLICY receipts_insert_rls ON public.receipts IS
  'CP-BRA-R06: creación por INSERT directo = encargado con membresía activa o superadmin.';
COMMENT ON POLICY receipts_update_rls ON public.receipts IS
  'CP-BRA-R06: mutación directa = creador original o superadmin; confirmación/anulación solo vía RPC con gate.';
COMMENT ON POLICY receipts_delete_rls ON public.receipts IS
  'CP-BRA-R06: borrado directo = creador o superadmin, solo borradores pendientes.';
COMMENT ON POLICY receipt_items_insert_isolated ON public.receipt_items IS
  'CP-BRA-R06: INSERT de líneas = mismo permiso de creación (encargado|superadmin).';


COMMIT;

-- ─── DOWN (reversión de la política; no se aplica en productivo) ────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_receipts_pin_creator ON public.receipts;
-- DROP FUNCTION IF EXISTS public.receipts_pin_creator();
-- DROP FUNCTION IF EXISTS public.can_manage_reception(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.can_create_reception(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.is_superadmin_uid(uuid);
-- (restaurar los 9 RPC desde el expediente y las políticas previas)
-- COMMIT;
-- ============================================================================
