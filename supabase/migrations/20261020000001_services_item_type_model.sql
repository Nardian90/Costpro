-- ============================================================================
-- Migration: 20261020000001_services_item_type_model.sql
-- ============================================================================
-- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): corrección integral del modelo
-- Producto físico / Servicio.
--
-- Causa raíz diagnosticada (SKU 999 «Servicio de cripiar»):
--   * La columna public.products.is_service EXISTE en la BD viva desde
--     20260810000070 (NOT NULL DEFAULT FALSE, con backfill WHERE sku='999').
--   * create_sale_v2 (20261017000000) YA la respeta: salta el check
--     ERR_INSUFFICIENT_STOCK (:321-326) y NO crea stock_movements para
--     servicios (:736-743).
--   * PERO el campo nunca llega al frontend: ni get_products_for_pos ni
--     get_paginated_products_v2 lo retornan → todos los guards de stock del
--     cliente bloquean la venta de servicios con stock 0 (POS, carrito,
--     checkout, venta-por-conteo, import, duplicar venta).
--   * Y el flujo POST-venta tiene 4 huecos: create_devolution_v2,
--     void_transaction, reverse_transaction_v2 y reverse_devolution NO
--     filtran is_service → crearían stock/inventory/kardex FANTASMA para
--     servicios (inflando stock_current de un artículo intangible).
--
-- Alcance de esta migración (mínimo y quirúrgico):
--   PARTE 1-2: exponer is_service en las 2 RPCs de lectura del catálogo/POS.
--   PARTE 3:   create_devolution_v2 — saltar register_stock_movement para
--              servicios (el contra-asiento financiero DF-03 y el tope
--              acumulado DF-07 se conservan intactos: devolver un servicio
--              reembolsa dinero, NO restaura existencias).
--   PARTE 4:   void_transaction — saltar la restauración de stock para
--              servicios Y filtrar product_id IS NOT NULL (bug latente:
--              anular una venta de close_service_order_as_sale — item con
--              product_id NULL — habría rebotado con FK violation).
--   PARTE 5:   reverse_transaction_v2 — mismo guard is_service.
--   PARTE 6:   reverse_devolution — saltar register_stock_movement y
--              fn_recalc_wac para servicios (evento neutro sobre artículo
--              sin existencias).
--   PARTE 7:   create_transfer — rechazo EXPLÍCITO de servicios con error
--              claro (ERR_SERVICE_NOT_TRANSFERABLE) en lugar del bloqueo
--              accidental por ERR_INSUFFICIENT_STOCK; el producto espejo
--              destino copia is_service (defensa en profundidad).
--
-- Lo que NO cambia (invariantes):
--   * Firmas, SECURITY DEFINER, owners, search_path y ACLs de las 7
--     funciones — byte-idénticos a sus últimas definiciones versionadas.
--   * create_sale_v2: YA respeta is_service (20261017000000); intacto.
--   * RLS, grants, triggers y stocks/kardex históricos: intactos.
--   * El campo comercial `category` (texto libre) sigue siendo INDEPENDIENTE
--     del tipo de artículo: «Servicios» puede ser categoría de un producto
--     físico sin que eso altere su control de existencias.
--
-- NOTA DE CONTRATO (Capa C, security-contract-test-static.cjs): las partes
-- 3-7 modifican 5 funciones SECURITY DEFINER de escritura certificadas en
-- contract-surface.sql. Esta migración NO se aplica a la BD viva sin
-- autorización expresa del propietario → el drift replay-vs-surface queda
-- cubierto por entradas `source_of_truth_baseline` en ci-gate-allowlist.json
-- (mismo procedimiento documentado del PR #1422). Tras aplicar la migración:
-- re-exportar el surface (scripts/export-contract-surface.cjs) y ELIMINAR
-- esas entradas. Las partes 1-2 (RPCs de lectura) NO están en el surface
-- (el export solo certifica SECURITY DEFINER que escriben datos).
-- ============================================================================

-- ═══ PARTE 1: get_products_for_pos expone is_service ═══
-- Misma definición que 20260823000002 (última versionada) + columna
-- is_service al final del RETURNS TABLE/SELECT. El frontend del POS la
-- necesita para eximir a los servicios de sus guards de stock (B1-B13).

DROP FUNCTION IF EXISTS public.get_products_for_pos(uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_products_for_pos(
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  sku text,
  price numeric,
  cost_price numeric,
  image_url text,
  category text,
  unit_of_measure text,
  supplier text,
  created_at timestamptz,
  updated_at timestamptz,
  stock_current numeric,
  cost_average numeric,
  min_stock integer,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  product_variants jsonb,
  price_currency text,
  barcode text,
  barcode_type text,
  visible_en_tienda boolean,
  precio_empresa numeric,
  precio_empresa_currency text,
  on_promotion boolean,
  is_service boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    DECLARE
      v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
      v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
      v_search text := trim(coalesce(p_search_term, ''));
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
      END IF;
      IF p_store_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
      END IF;
      IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
      END IF;

      RETURN QUERY
      SELECT
        p.id, p.name, p.description, p.sku, p.price, p.cost_price, p.image_url,
        p.category, p.unit_of_measure, p.supplier, p.created_at, p.updated_at,
        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
        p.cost_average, p.min_stock::integer, p.store_id, p.is_active,
        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price, 'conversion_factor', pv.conversion_factor)) FROM public.product_variants pv WHERE pv.product_id = p.id), '[]'::jsonb),
        COALESCE(p.price_currency, 'CUP'),
        p.barcode,
        p.barcode_type,
        p.visible_en_tienda,
        p.precio_empresa,
        p.precio_empresa_currency,
        COALESCE(p.on_promotion, false),
        COALESCE(p.is_service, false)
      FROM public.products p
      WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
        AND public.has_store_access(p.store_id)
        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
        AND (
          v_search = ''
          OR p.name ILIKE ('%' || v_search || '%')
          OR p.sku ILIKE ('%' || v_search || '%')
          OR COALESCE(p.barcode, '') = v_search
        )
        AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
      ORDER BY p.name
      LIMIT v_limit OFFSET v_offset;
    END;
$function$;

-- ═══ PARTE 2: get_paginated_products_v2 expone is_service ═══
-- Misma definición que 20260823000002 + is_service junto a is_complete.
-- El filtro numérico de stock (p_stock_filter) NO se altera: clasifica por
-- existencias calculadas y los servicios (stock 0) siguen las reglas
-- numéricas vigentes. La naturaleza del artículo es una dimensión nueva e
-- independiente que el frontend usa para badges/exenciones.

DROP FUNCTION IF EXISTS public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_paginated_products_v2(
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_sort_key text DEFAULT 'name'::text,
  p_sort_dir text DEFAULT 'asc'::text,
  p_stock_filter text DEFAULT 'all'::text,
  p_active_filter text DEFAULT 'all'::text
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  barcode text,
  barcode_type text,
  category text,
  price numeric,
  precio_empresa numeric,
  precio_empresa_currency text,
  price_currency text,
  cost_price numeric,
  min_stock numeric,
  image_url text,
  description text,
  unit_of_measure text,
  supplier text,
  stock_current numeric,
  cost_average numeric,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  visible_en_tienda boolean,
  price_visible boolean,
  stock_visible boolean,
  on_promotion boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_complete boolean,
  is_service boolean,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Auth checks
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
  END IF;
  IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.name, p.sku, p.barcode, p.barcode_type,
    p.category, p.price, p.precio_empresa, p.precio_empresa_currency, COALESCE(p.price_currency, 'CUP'),
    p.cost_price, p.min_stock, p.image_url, p.description,
    p.unit_of_measure, p.supplier,
    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
              WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric AS stock_current,
    p.cost_average,
    p.store_id, p.is_active,
    EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
            UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
            UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
    p.visible_en_tienda,
    COALESCE(p.price_visible, true),
    COALESCE(p.stock_visible, true),
    COALESCE(p.on_promotion, false),
    p.created_at, p.updated_at,
    -- is_complete: True si tiene name, sku, price, cost_price, category, unit_of_measure
    (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
     AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
     AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
    COALESCE(p.is_service, false) AS is_service,
    COUNT(*) OVER()::bigint AS total_count
  FROM public.products p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND public.has_store_access(p.store_id)
    AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
         (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
    AND (p_search_term IS NULL OR p_search_term = '' OR
         p.name ILIKE ('%' || p_search_term || '%') OR
         p.sku ILIKE ('%' || p_search_term || '%') OR
         COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%'))
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
    AND (p_active_filter = 'all' OR
         (p_active_filter = 'active' AND p.is_active = true) OR
         (p_active_filter = 'inactive' AND p.is_active = false))
    AND (p_stock_filter = 'all' OR
         (p_stock_filter = 'out' AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= 0) OR
         (p_stock_filter = 'low' AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > 0 AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= COALESCE(p.min_stock, 0)) OR
         (p_stock_filter = 'ok' AND
          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > COALESCE(p.min_stock, 0)))
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_key
        WHEN 'name' THEN p.name
        WHEN 'sku' THEN COALESCE(p.sku, '')
        WHEN 'price' THEN LPAD(p.price::text, 20, '0')
        WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
        WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
        ELSE p.name
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_key
        WHEN 'name' THEN p.name
        WHEN 'sku' THEN COALESCE(p.sku, '')
        WHEN 'price' THEN LPAD(p.price::text, 20, '0')
        WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
        WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
        ELSE p.name
      END
    END DESC NULLS LAST,
    p.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ═══ PARTE 3: create_devolution_v2 — no restaurar stock de servicios ═══
-- Cuerpo base: 20261004120001 (última versionada, firma /12). ÚNICO cambio:
-- el PERFORM register_stock_movement queda dentro de un guard is_service.
-- La devolución de un servicio reembolsa dinero (DF-03 contra-asiento) y
-- documenta el ítem (devolution_items + tope DF-07), pero NO restaura
-- existencias de un artículo intangible que nunca las descontó.

CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamptz DEFAULT NULL::timestamptz)
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
BEGIN
  v_eff := COALESCE(p_operation_date, NOW());
  PERFORM public.validate_operation_date(v_eff, p_store_id);

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
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
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

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

    -- asiento financiero trazable: venta → devolución → reversión
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, direction, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
      v_total, p_payment_method, 'CUP', 1.0,
      v_eff, 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
    ) RETURNING id INTO v_pt_id;

  ELSIF p_payment_method = 'store_credit' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
    END IF;
    -- pasivo visible y auditable; la caja NO se toca (el dinero ya no sale)
    INSERT INTO public.store_credit_ledger
      (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
    VALUES
      (p_store_id, v_caller_uid, v_total, v_devolution_id, p_original_transaction_id,
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
    'financial_effect', CASE WHEN p_payment_method = 'store_credit' THEN 'store_credit_ledger' ELSE 'cash_out_and_refund' END
  );
END $function$
;

-- ═══ PARTE 4: void_transaction — no restaurar stock de servicios ═══
-- Cuerpo base: 20260905000001 (última versionada, firma /4). DOS cambios:
--   (a) el loop de items filtra product_id IS NOT NULL (bug latente: items
--       de close_service_order_as_sale tienen product_id NULL y el
--       register_stock_movement habría rebotado con FK violation);
--   (b) guard is_service alrededor del register_stock_movement: anular la
--       venta de un servicio NO restaura existencias que nunca se
--       descontaron (create_sale_v2 ya salta el movimiento para servicios).

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
;

-- ═══ PARTE 5: reverse_transaction_v2 — no restaurar stock de servicios ═══
-- Cuerpo base: 20260905000001 (última versionada, firma /3). ÚNICO cambio:
-- el loop de items excluye además los servicios (guard is_service). El
-- filtro product_id IS NOT NULL ya existía en la base.

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
;

-- ═══ PARTE 6: reverse_devolution — no mover stock de servicios ═══
-- Cuerpo base: 20260905120000 (última versionada, firma /3). Cambios:
--   * guard is_service alrededor de fn_recalc_wac + register_stock_movement:
--     revertir la devolución de un servicio no toca existencias ni WAC de
--     un artículo intangible (la devolución original tampoco lo hizo tras
--     la PARTE 3). v_count sigue contando los ítems revertidos para el
--     metadata de auditoría.

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
  v_uc_dev NUMERIC;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  -- W9.5 B-10: guard de estado explicito (GATE G) — solo completed reversible.
  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa (fuente unica). Politica congelada (C conservar):
  -- cualquier membresia ACTIVA en la tienda, simetrica a la creacion de
  -- devoluciones (modulo dormant, sin puerta de navegacion).
  -- W9.5 B-10b: la autorizacion NO cambia; solo la mutacion.
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  -- ── W9.5 B-10b: mutacion EXCLUSIVAMENTE via pipeline canonico ──
  -- register_stock_movement -> stock_movements -> triggers (fn_sync_inventory_
  -- on_movement / auto_kardex / sync_product_stock) -> inventory + products.
  -- Quedan PROHIBIDOS (divergencia corregida):
  --   * UPDATE directo de products.stock_current (antes: GREATEST(0, stock-qty))
  --   * INSERT directo en kardex_entries (antes: 'out' con unit_cost=0)
  -- MISIÓN TIPO-DE-ARTÍCULO (2026-10-19): los ítems de servicio (is_service)
  -- no pasan por fn_recalc_wac ni por register_stock_movement — no hay
  -- existencias ni WAC de inventario que tocar en un artículo intangible.
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.products pr WHERE pr.id = v_item.product_id AND pr.is_service = true) THEN
      -- (a) Costo complementario del kardex: del movimiento 'return' original
      --     (promedio ponderado si hay varios). Si no existe (devoluciones
      --     pre-pipeline — 13/13 en datos reales), cadena canonica de
      --     create_devolution_v2: cost_at_sale -> cost_average -> 0.
      --     Solo atribucion contable: el WAC real NO se toca (ver (b)).
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

      -- (b) WAC: la devolucion original NO altera cost_average (hotfix A2 v2.22.0,
      --     "for other paths (transfers, devolutions, etc.), cost_average stays
      --     as-is"). El reverse conserva esa invariancia via la rama q=0 de
      --     fn_recalc_wac ("Salida pura / devolucion A1 / evento neutro: WAC
      --     INVARIANTE"): lock del producto + wac_change_log (before==after).
      --     Permite llevar el stock a 0 sin division por cero ni WAC corrupto.
      PERFORM public.fn_recalc_wac(
        v_dev.store_id, v_item.product_id, 'devolution_reverse',
        0, 0,
        jsonb_build_object('rpc', 'reverse_devolution', 'devolution_id', p_devolution_id,
          'qty_reversed', v_item.quantity));

      -- (c) Mutacion de stock SOLO via pipeline canonico. Signo (GATE 3): la
      --     devolucion original sumo (+q, 'return') -> el reverse resta (-q).
      --     Sin clamp: si el stock ya no alcanza, fn_sync_inventory_on_movement
      --     falla con ERR_INSUFFICIENT_STOCK (deteccion sobre silencio, W7 D-01).
      --     reference_id = devolutions.id (trazabilidad estructurada, GATE 8).
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
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  -- W9.5 B-10 (GATE J): la operacion deja audit explicito. B-10b mantiene
  -- action/operation congelados y enriquece metadata (aditivo).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION',
      'pipeline', 'register_stock_movement',
      'movement_type', 'devolution_reverse'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$
;

-- ═══ PARTE 7: create_transfer — servicios no transferibles ═══
-- Cuerpo base: 20261018000000 (última versionada, firma /7). TRES cambios:
--   (a) el SELECT del producto origen lee p.is_service;
--   (b) rechazo EXPLÍCITO de servicios con error semántico claro
--       (ERR_SERVICE_NOT_TRANSFERABLE) en lugar del bloqueo accidental por
--       ERR_INSUFFICIENT_STOCK con stock 0 — transferir existencias de un
--       artículo intangible no tiene sentido operativo;
--   (c) el producto espejo destino copia is_service (defensa en profundidad
--       para SKUs espejo preexistentes creados sin la bandera).

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
$function$;

-- ═══ PARTE 8: comentarios de doctrina ═══
COMMENT ON COLUMN public.products.is_service IS
  'Tipo de artículo: TRUE = servicio intangible (sin existencias propias: create_sale_v2 no valida stock ni descuenta; devoluciones/voids/reversas no crean movimientos; no transferible). FALSE = producto físico (sujeto a las validaciones de stock vigentes). Independiente de la categoría comercial (category). Doctrina: 20260810000070 + 20261020000001.';

COMMENT ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) IS
  'RPC de lectura del POS. Retorna is_service para que el frontend exima a los servicios de los guards de stock del cliente.';

COMMENT ON FUNCTION public.get_paginated_products_v2(integer, integer, uuid, text, text, text, text, text, text) IS
  'Paginated products query with sort + filter. Now includes barcode, barcode_type, precio_empresa, precio_empresa_currency, price_currency, unit_of_measure, supplier, visible_en_tienda, price_visible, stock_visible, on_promotion, created_at, updated_at, cost_average, is_complete, is_service.';
