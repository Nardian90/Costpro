-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-CAT-MAESTRO-003 — SINCRONIZACIÓN DEL CATÁLOGO MAESTRO DESDE
-- RECEPCIONES (corrección de causa raíz, problema 2 de la misión)
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEMA: register_reception (definición vigente en 20261105140000) crea los
--   productos nuevos de una Recepción con un INSERT directo en products, sin
--   consultar is_catalog_store_connected ni master_products. En una tienda
--   conectada al catálogo maestro, el producto nuevo quedaba SOLO local
--   (products.master_product_id NULL): el usuario tenía que ir después al
--   Catálogo Maestro a crear/importar/vincular manualmente (desfase detectado
--   en Enervida: 10 productos, SKUs 187-196, creados desde recepciones).
--
-- CORRECCIÓN (mismo contrato, misma firma, RETURNS uuid — cero cambios de API):
--   En el bloque new_product, tras validar unicidad local del SKU y resolver el
--   tenant, la RPC sincroniza el catálogo maestro DENTRO de su transacción:
--     · CASO A · tienda CONECTADA (is_catalog_store_connected):
--         A4 · maestro activo con ese SKU → INSERT local con master_product_id
--              (el trigger trg_products_master_identity_guard coerciona
--              sku/name al maestro; jamás un segundo maestro).
--         A5 · maestro inexistente → INSERT en master_products (SOLO identidad:
--              sku, nombre, unidad; sin precio/costo/existencias/imagen),
--              auditoría master_change_log + audit_logs, vínculo local. Carrera
--              entre tiendas: unique_violation → reutiliza el maestro ganador
--              (mismo patrón que create_master_product).
--         A6 · maestro archivado → fila local SIN vínculo + auditoría
--              RECEPTION_MASTER_CONFLICT (la recepción jamás se bloquea por un
--              error secundario de sincronización; reactivar la identidad es
--              decisión de gobernanza).
--         A7 · vínculo (maestro, tienda) ya ocupado → fila local sin vínculo +
--              auditoría RECEPTION_MASTER_CONFLICT (respeta el índice único
--              parcial products_master_store_unique).
--     · CASO B · tienda NO conectada → comportamiento histórico exacto.
--   El resultado de la sincronía queda en audit_logs (REGISTER_RECEPTION):
--   new_products_master_created / new_products_master_linked.
--
-- SEGURIDAD (misión §5): firma, RETURNS, LANGUAGE, SECURITY DEFINER y
--   search_path intactos. La sincronía usa is_catalog_store_connected (helper
--   certificado); la identidad del maestro pertenece SIEMPRE al tenant de la
--   tienda (WHERE tenant_id = v_new_tenant_id resuelto del servidor); el
--   trigger de identidad coerciona sku/name; los datos comerciales locales
--   (precio, costo, existencias) NO se propagan al maestro ni a otras tiendas.
-- AUDITORÍA: master_change_log (creación de identidad) + audit_logs
--   (RECEPTION_PRODUCT_LINKED_MASTER / RECEPTION_MASTER_CONFLICT /
--   REGISTER_RECEPTION con contadores de sincronía).
-- IDEMPOTENCIA/CONSISTENCIA: la sincronía es atómica con la recepción (una sola
--   transacción). Reintentos tras error no duplican (unicidad tenant+sku en el
--   maestro, store+sku en products, master+store en el vínculo).
-- REVERSIBILIDAD: re-aplicar la definición de 20261105140000 restaura el
--   comportamiento previo. Ninguna estructura de datos cambia (la migración es
--   solo CREATE OR REPLACE FUNCTION + ACL explícita).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid, p_supplier_code text DEFAULT NULL::text, p_supplier_address text DEFAULT NULL::text, p_supplier_phone text DEFAULT NULL::text, p_supplier_tax_id text DEFAULT NULL::text)
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

  -- D1 (misión recepciones 2026-10-27): factura duplicada → error accionable.
  -- Antes este caso reventaba como 23505 crudo (idx_receipts_store_reference_doc)
  -- y el frontend lo clasificaba erróneamente como "SKU ya existe".
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
    -- CLASIFICATOR-PARTIES (2026-11-04): snapshot identificativo del proveedor
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

    -- B4 (v2.23.0): Reject items with unit_cost <= 0
    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;

    -- D2 (misión recepciones 2026-10-27): alta transaccional del producto
    -- nuevo. Un item SIN product_id pero CON objeto new_product crea el
    -- producto DENTRO de esta transacción: si cualquier paso posterior de la
    -- recepción falla, el producto se revierte con todo lo demás (sin
    -- huérfanos). La ambigüedad product_id + new_product se rechaza.
    IF v_item ? 'new_product' THEN
      IF v_product_id IS NOT NULL THEN
        RAISE EXCEPTION 'ERR_AMBIGUOUS_ITEM: el item trae product_id y new_product a la vez';
      END IF;
      v_new_product := v_item->'new_product';
      v_new_sku := btrim(COALESCE(v_new_product->>'sku', ''));
      IF v_new_sku = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo requiere sku';
      END IF;
      IF btrim(COALESCE(v_new_product->>'name', '')) = '' THEN
        RAISE EXCEPTION 'ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre', v_new_sku;
      END IF;
      IF v_new_sku = ANY (v_created_skus) THEN
        RAISE EXCEPTION 'ERR_SKU_DUPLICATE_PAYLOAD: el SKU "%" aparece más de una vez entre los productos nuevos de la recepción', v_new_sku;
      END IF;
      -- Unicidad REAL contra el catálogo de la tienda (mismo modelo que
      -- products_sku_store_unique). Mensión misión: si ya existe, el usuario
      -- debe SELECCIONARLO como existente, no crearlo de nuevo.
      IF EXISTS (
        SELECT 1 FROM public.products
        WHERE store_id = p_store_id AND sku = v_new_sku
      ) THEN
        RAISE EXCEPTION 'ERR_SKU_EXISTS: el SKU "%" ya existe en el catálogo de esta tienda. Selecciona el producto existente en lugar de crearlo de nuevo.', v_new_sku;
      END IF;
      -- tenant fail-closed (paridad products_tenant_insert / RLS-FIX cliente)
      IF v_new_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_new_tenant_id FROM public.stores WHERE id = p_store_id;
        IF v_new_tenant_id IS NULL THEN
          RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %', p_store_id;
        END IF;
      END IF;

      -- ═════════════════════════════════════════════════════════════════════
      -- CP-CAT-MAESTRO-003 (2026-11-07): SINCRONIZACIÓN CON EL CATÁLOGO MAESTRO.
      -- Causa raíz corregida: hasta ahora el producto nuevo creado desde una
      -- Recepción se guardaba SOLO en el catálogo local; en una tienda conectada
      -- al catálogo maestro quedaba fuera de la identidad compartida de la
      -- organización (desfase detectado en Enervida: 10 productos, SKUs 187-196).
      -- La operación (producto local + identidad compartida + vínculo) es UNA
      -- transacción: si algo falla, la recepción completa se revierte — jamás
      -- quedan huérfanos ni confirmación de éxito sin persistencia real.
      -- Reglas (misión CP-CAT-MAESTRO-003 §4):
      --   CASO B · Tienda NO conectada → alta local pura (comportamiento exacto
      --            anterior; sin maestro, sin relaciones).
      --   CASO A4 · Maestro ACTIVO con ese SKU → se VINCULA vía
      --            products.master_product_id; el trigger
      --            trg_products_master_identity_guard coerciona sku/name al
      --            maestro. Jamás un segundo registro maestro. Precio, costo,
      --            existencias y demás datos comerciales siguen siendo locales.
      --   CASO A5 · Maestro inexistente → se CREA (SOLO identidad: sku, nombre,
      --            unidad; imagen/código NULL; jamás precio/costo/existencias),
      --            con auditoría en master_change_log + audit_logs. Carrera
      --            entre tiendas: unique_violation → reutiliza el maestro
      --            ganador (un solo maestro por organización).
      --   CASO A6 · Maestro ARCHIVADO → fila local SIN vínculo + conflicto
      --            auditado para revisión de gobernanza. La recepción JAMÁS se
      --            bloquea por un error secundario de sincronización.
      -- ═════════════════════════════════════════════════════════════════════
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
          -- previa tras reetiquetado): NO se duplica el vínculo (índice único
          -- parcial products_master_store_unique); fila local sin vínculo y
          -- conflicto documentado para revisión.
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

          INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
          VALUES ('RECEPTION_MASTER_CONFLICT', 'master_products', v_master_id, p_store_id, v_caller_uid,
            jsonb_build_object(
              'reason', 'ERR_MASTER_LINK_ALREADY_EXISTS',
              'sku', v_new_sku,
              'receipt_id', v_receipt_id,
              'product_id', v_product_id,
              'at', now()));
        ELSIF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
          -- CASO A4 · maestro existente y activo: VINCULAR (reutilizar identidad).
          INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, btrim(v_new_product->>'name'),
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
              'receipt_id', v_receipt_id,
              'product_id', v_product_id,
              'at', now()));
        ELSE
          IF v_master_id IS NULL THEN
            -- CASO A5 · alta de identidad compartida (SOLO identidad compartida).
            BEGIN
              INSERT INTO public.master_products
                (tenant_id, sku, name, image_path, barcode, unit_of_measure, is_service, status, created_by)
              VALUES
                (v_new_tenant_id, v_new_sku, btrim(v_new_product->>'name'), NULL, NULL,
                 COALESCE(NULLIF(btrim(COALESCE(v_new_product->>'unit_of_measure', '')), ''), 'unidad'),
                 FALSE, 'active', v_user_id)
              RETURNING id INTO v_master_id;

              v_master_created_count := v_master_created_count + 1;

              -- Auditoría de identidad (mismo registro que create_master_product)
              INSERT INTO public.master_change_log
                (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id)
              VALUES
                (v_master_id, v_new_tenant_id, 'sku', NULL, v_new_sku, v_user_id, p_store_id),
                (v_master_id, v_new_tenant_id, 'name', NULL, btrim(v_new_product->>'name'), v_user_id, p_store_id);
            EXCEPTION WHEN unique_violation THEN
              -- Carrera: otra tienda creó el mismo SKU en paralelo. Se reutiliza
              -- el maestro ganador (un solo maestro por organización, misión §4.1;
              -- mismo patrón que create_master_product traduce 23505).
              v_master_status := NULL;
              v_master_name := NULL;
              SELECT id, status, name INTO v_master_id, v_master_status, v_master_name
                FROM public.master_products
               WHERE tenant_id = v_new_tenant_id AND sku = v_new_sku
               FOR UPDATE;
            END;
          END IF;

          IF v_master_id IS NOT NULL AND v_master_status = 'active' THEN
            INSERT INTO public.products (
              store_id, tenant_id, master_product_id, sku, name, cost_price, price,
              unit_of_measure, is_active, is_complete, stock_current
            ) VALUES (
              p_store_id, v_new_tenant_id, v_master_id, v_new_sku, btrim(v_new_product->>'name'),
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
                'receipt_id', v_receipt_id,
                'product_id', v_product_id,
                'at', now()));
          ELSE
            -- CASO A6 · maestro archivado: sin vínculo + conflicto documentado.
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

            INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
            VALUES ('RECEPTION_MASTER_CONFLICT', 'master_products', v_master_id, p_store_id, v_caller_uid,
              jsonb_build_object(
                'reason', 'ERR_MASTER_ARCHIVED',
                'sku', v_new_sku,
                'receipt_id', v_receipt_id,
                'product_id', v_product_id,
                'at', now()));
          END IF;
        END IF;
      ELSE
        -- CASO B · tienda NO conectada: alta local pura, sin maestro ni
        -- relaciones (funcionamiento de la tienda sin cambios, misión CASO B).
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
      'po_id', p_po_id,
      'new_products_created', v_new_products_count,
      -- CP-CAT-MAESTRO-003: resultado de la sincronía con el catálogo maestro
      'new_products_master_created', v_master_created_count,
      'new_products_master_linked', v_master_linked_count
    ));

  RETURN v_receipt_id;
END
$function$;

-- ─── ACL explícita (paridad con la superficie certificada del catálogo) ─────
REVOKE EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_reception(uuid, text, timestamp with time zone, text, jsonb, uuid, uuid, text, text, text, text) TO authenticated, service_role;

-- ─── Guard fail-closed post-migración ───────────────────────────────────────
DO $CP_CAT_M003_GUARD$
DECLARE
  v_sig text;
  v_body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'register_reception';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: register_reception no existe';
  END IF;
  IF v_sig NOT LIKE '%RETURNS uuid%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: el contrato RETURNS uuid cambió';
  END IF;
  IF v_sig NOT LIKE '%SECURITY DEFINER%' OR v_sig NOT LIKE '%search_path%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: SECURITY DEFINER / search_path ausentes';
  END IF;
  IF v_sig NOT LIKE '%is_catalog_store_connected(v_new_tenant_id, p_store_id)%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: la sincronía maestro (estado de conexión) ausente';
  END IF;
  IF v_sig NOT LIKE '%master_product_id, sku, name, cost_price, price%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: el vínculo products.master_product_id ausente';
  END IF;
  IF v_sig NOT LIKE '%master_change_log%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: auditoría de identidad (master_change_log) ausente';
  END IF;
  IF v_sig NOT LIKE '%unique_violation%' OR v_sig NOT LIKE '%RECEPTION_PRODUCT_LINKED_MASTER%'
     OR v_sig NOT LIKE '%RECEPTION_MASTER_CONFLICT%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: manejo de carrera / auditoría de sincronía ausentes';
  END IF;
  -- El INSERT en master_products porta SOLO identidad (sin precio/costo/stock):
  v_body := substring(v_sig from 'INSERT INTO public\.master_products[\s\S]{0,250}');
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: alta de maestro ausente';
  END IF;
  IF v_body LIKE '%price%' OR v_body LIKE '%cost%' OR v_body LIKE '%stock%' THEN
    RAISE EXCEPTION 'CP-CAT-M003-GUARD: el maestro no debe recibir datos comerciales';
  END IF;
  RAISE NOTICE 'CP-CAT-M003-GUARD OK: register_reception sincroniza el catálogo maestro (A4/A5/A6/A7/B) sin tocar datos comerciales compartidos';
END
$CP_CAT_M003_GUARD$;
