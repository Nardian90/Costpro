-- ══════════════════════════════════════════════════════════════════════════
-- MISIÓN RECEPCIONES (2026-10-27) — Reparar recepciones, eliminar borradores
-- y alta transaccional de productos desde la recepción.
--
-- Diagnóstico (evidencia en vivo, tienda ENERVIDA-VITALLCONS):
--   D-A. handleAddManualProduct no consultaba el catálogo → el usuario podía
--        agregar un SKU existente como "nuevo" → INSERT products → 23505
--        (products_sku_store_unique) con mensaje genérico engañoso.
--   D-B. TODOS los 23505 se clasificaban como "Uno de los SKU ya existe en
--        esta tienda" — incluido idx_receipts_store_reference_doc (factura
--        duplicada) desde register_reception → el error persistía aunque el
--        usuario quitara el producto.
--   D-C. Sin acción para eliminar el borrador localStorage ni las recepciones
--        pending del historial (solo Anular).
--   D-D. Hueco server-side: RLS receipts_delete_rls permitía DELETE de
--        receipts en CUALQUIER estado (vía PostgREST directa, si no tenían
--        líneas por la FK NO ACTION).
--
-- Cambios (mínimos, firma de register_reception SIN CAMBIOS — los productos
-- nuevos viajan DENTRO de p_items como objeto new_product — sin overloads):
--
--   1. register_reception (mismo cuerpo + extensiones):
--      1a. ERR_INVOICE_DUPLICATE: chequeo explícito de reference_doc duplicado
--          ANTES del INSERT → error accionable en lugar de 23505 crudo.
--      1b. Alta TRANSACCIONAL de productos nuevos: item con product_id NULL +
--          objeto new_product {sku, name, cost_price, price, unit_of_measure,
--          is_complete} → validación (sku/name obligatorios, unicidad contra
--          catálogo y dentro del payload) → INSERT dentro de la MISMA
--          transacción de la recepción. Cualquier fallo posterior revierte
--          TODO (sin huérfanos, sin líneas sin producto). Los productos
--          creados aquí reciben stock mediante el flujo existente (WAC +
--          stock_movements del propio bucle).
--   2. delete_pending_reception (NUEVA): borrado DEFINITIVO del borrador
--      (status='pending') con FOR UPDATE (concurrencia), guard de estado,
--      autorización multitienda has_store_access_as, guard anti-spoofing
--      v2.12.9, rechazo si hay pagos o movimientos ligados, eliminación de
--      líneas + cabecera y evento de auditoría (quién borró qué y cuándo —
--      política de trazabilidad del módulo, paridad con void_pending_reception).
--   3. RLS receipts_delete_rls: DELETE directo solo permitido sobre
--      status='pending' (defense-in-depth; la app usa la RPC; el rollback
--      interno de useSavePendingReception — receipts recién creados pending —
--      sigue funcionando).
--
-- Compatibilidad:
--   · receive_against_po llama con argumentos NOMBRADOS y productos
--     existentes → sin cambios de comportamiento.
--   · Payloads offline encolados (sync) sin new_product → idéntico.
--   · Items sin product_id y sin new_product → ERR_PRODUCT_NOT_IN_STORE
--     (igual que antes).
-- ══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. register_reception — factura duplicada + alta transaccional de productos
-- ───────────────────────────────────────────────────────────────────────────
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
  -- MISIÓN RECEPCIONES (2026-10-27): alta transaccional de productos nuevos
  v_new_product JSONB;
  v_new_sku TEXT;
  v_new_tenant_id UUID;
  v_created_skus TEXT[] := '{}';
  v_new_products_count INTEGER := 0;
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
    po_id
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id
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
      'new_products_created', v_new_products_count
    ));

  RETURN v_receipt_id;
END
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. delete_pending_reception — borrado definitivo del borrador (NUEVA)
-- ───────────────────────────────────────────────────────────────────────────
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
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
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

GRANT EXECUTE ON FUNCTION public.delete_pending_reception(uuid, uuid) TO authenticated, service_role;
-- Patrón sec_definer_hardening (20261020000002): sin EXECUTE para PUBLIC/anon.
REVOKE EXECUTE ON FUNCTION public.delete_pending_reception(uuid, uuid) FROM PUBLIC, anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — DELETE directo solo sobre borradores (defense-in-depth)
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS receipts_delete_rls ON public.receipts;
CREATE POLICY receipts_delete_rls ON public.receipts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.store_id = receipts.store_id
    )
    AND receipts.status = 'pending'
  );
