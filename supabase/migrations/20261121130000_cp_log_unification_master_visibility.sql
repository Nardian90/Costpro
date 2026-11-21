-- ============================================================================
-- 20261121130000 — CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001
-- Visibilidad del catálogo maestro en POS y Recepciones (mismo modelo que
-- get_paginated_products_v2 desde CATALOG-MASTER-002) + gate de estado de
-- receipts en el motor de pagos a proveedor.
-- ============================================================================
-- MISIÓN: CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 (§2.1 prioridad,
--   §3 liquidación de recepciones, §6 integridad).
--
-- CAUSA RAÍZ (verificada LIVE 2026-11-21, scripts/test-rpc-as-user.mjs):
--   get_products_for_pos y get_products_for_reception pagan FROM products
--   WHERE store_id = $1 — una tienda CONECTADA al catálogo maestro
--   (catalog_store_links.status='connected') sin filas locales ve 0
--   productos en POS (Vender) y en Recepción Express. Caso real:
--   FERROCARRIL VITALLCONS y SHADDAI: 0 products, 260 maestros activos del
--   tenant → 0 productos en ambos módulos. El Catálogo (vista) no sufre esto
--   desde 20261101130000 (unión maestra en get_paginated_products_v2,
--   commit 7d349e860); esa unión nunca llegó a las RPC de POS/Recepciones.
--
-- MODELO (idéntico al establecido por CATALOG-MASTER-002):
--   - Tienda NO conectada: comportamiento EXACTAMENTE igual al anterior
--     (regresión cero).
--   - Tienda conectada: la rama local permanece byte-idéntica (identidad y
--     operativos de la fila local, stock = inventario de ESA tienda) y se
--     AÑADE (UNION ALL) una rama solo-maestro: maestros activos del tenant
--     SIN fila local en esta tienda (cualquier estado), con operativos en
--     cero (sin datos comerciales a nivel maestro: price/cost_price 0,
--     stock 0) y marcados source='master' + master_product_id. La fila
--     solo-maestro es un VISTAZO del catálogo de la organización: el
--     frontend NO puede venderla ni recibirla directamente — debe activarse
--     primero (resolve_reception_import_rows en recepciones, mismo camino
--     del importador Excel, o activate_master_product en Catálogo).
--   - Sin mezcla de inventarios: la rama local sigue leyendo SOLO el
--     inventario de la tienda (SUM inventory por product_id local); la rama
--     maestra reporta stock 0.
--
-- GATE DE PAGOS (§3/§6): register_supplier_payment_batch y
--   register_supplier_payment incorporan el estado de la RECEIPT al lock del
--   documento y rechazan liquidar receipts voided/reversed
--   (ERR_RECEIPT_NOT_PAYABLE). Paridad con el gate de servicios de ADN-009
--   (F12). Hoy el motor no comprueba estado alguno para receipts: pagar una
--   recepción anulada/revertida es posible y es un defecto (la reversión ya
--   revierte los pagos; uno nuevo sobre documento muerto rompe la
--   trazabilidad). Pending/confirmed/active/partial siguen admitidos
--   (comportamiento actual intacto).
--
-- COMPATIBILIDAD: CREATE OR REPLACE puro (sin cambios de firma existente;
--   columnas nuevas SOLO al final de las tablas de retorno → consumidores
--   posicionales intactos). Re-aplicable.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) get_products_for_reception — unión maestra + category/source/master_id
--    (aditivo al final). Firma de parámetros INTACTA.
--    Consumidores: useReceptionProductSearch (Recepción Express) y, desde
--    esta misión, también el modal «Agregar Producto» de la recepción manual
--    (una sola RPC de búsqueda de productos para todo el flujo de recepción).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_products_for_reception(p_store_id uuid, p_search_term text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, sku text, barcode text, cost_price numeric, price numeric, unit_of_measure text, stock_current numeric, min_stock numeric, is_active boolean, total_count bigint, category text, source text, master_product_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_offset INT;
  v_search TEXT;
  v_tenant uuid;
  v_connected BOOLEAN;
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
  v_offset := (p_page - 1) * p_page_size;
  v_search := LOWER(TRIM(COALESCE(p_search_term, '')));

  -- CP-LOG-UNIFICATION-001: tienda conectada al catálogo de su organización.
  SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
  v_connected := v_tenant IS NOT NULL
    AND public.is_catalog_store_connected(v_tenant, p_store_id);

  RETURN QUERY
  WITH base AS (
    -- (a) Filas locales activas de la tienda (comportamiento histórico).
    SELECT
      p.id,
      p.name,
      p.sku,
      p.barcode,
      p.cost_price,
      p.price,
      p.unit_of_measure,
      p.stock_current,
      p.min_stock,
      p.is_active,
      NULLIF(p.category, '') AS category,
      'local'::text AS source,
      p.master_product_id
    FROM public.products p
    WHERE p.store_id = p_store_id
      AND p.is_active = true
    UNION ALL
    -- (b) CP-LOG-UNIFICATION-001: catálogo maestro de la organización para
    --     tiendas CONECTADAS — SOLO maestros SIN fila local en esta tienda
    --     (cualquier estado: si existe fila local, la identidad y los
    --     operativos son los de ESA tienda). Operativos en cero: el maestro
    --     no porta datos comerciales; el precio/costo real nace de la primera
    --     recepción (resolve_reception_import_rows, mismo camino del
    --     importador Excel). is_active = true (el maestro está activo).
    SELECT
      m.id,
      m.name,
      m.sku,
      m.barcode,
      0::numeric,
      0::numeric,
      m.unit_of_measure,
      0::numeric,
      1::numeric,
      true,
      NULL::text,
      'master'::text,
      m.id
    FROM public.master_products m
    WHERE v_connected
      AND m.tenant_id = v_tenant
      AND m.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.products p2
        WHERE p2.master_product_id = m.id
          AND p2.store_id = p_store_id
      )
  )
  SELECT
    b.id,
    b.name,
    b.sku,
    b.barcode,
    b.cost_price,
    b.price,
    b.unit_of_measure,
    b.stock_current,
    b.min_stock,
    b.is_active,
    COUNT(*) OVER() AS total_count,
    b.category,
    b.source,
    b.master_product_id
  FROM base b
  WHERE (
    v_search = ''
    OR LOWER(b.name) LIKE '%' || v_search || '%'
    OR LOWER(COALESCE(b.sku, '')) LIKE '%' || v_search || '%'
    OR LOWER(COALESCE(b.barcode, '')) LIKE '%' || v_search || '%'
  )
  ORDER BY
    CASE WHEN v_search != '' AND LOWER(b.name) LIKE v_search || '%' THEN 0 ELSE 1 END,
    CASE WHEN v_search != '' AND LOWER(COALESCE(b.sku, '')) = v_search THEN 0 ELSE 1 END,
    b.name ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$function$;

COMMENT ON FUNCTION public.get_products_for_reception(uuid, text, integer, integer) IS
  'Búsqueda paginada de productos para recepciones. Tiendas conectadas al catálogo maestro: filas locales activas ∪ maestros activos del tenant sin fila local (source=''master'', operativos en cero, requieren activación antes de registrar).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) get_products_for_pos — unión maestra + source/master_product_id
--    (aditivo al final). Firma de parámetros INTACTA (uuid, text, text,
--    integer, integer — la misma que asegura el test de contrato de
--    CP-OPERATIONAL-CLASS-002 en 20261108150000).
--    La rama local es byte-idéntica a la vigente; la rama solo-maestro añade
--    el vistazo del catálogo de la organización (no vendible: price 0,
--    stock 0 — el frontend bloquea el add-to-cart y ofrece activar/recibir).
-- ═══════════════════════════════════════════════════════════════════════════
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
  is_service boolean,
  operational_class public.product_operational_class,
  -- CP-LOG-UNIFICATION-001 (aditivo al final): procedencia de la fila.
  source text,
  master_product_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
    DECLARE
      v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
      v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
      v_search text := trim(coalesce(p_search_term, ''));
      v_tenant uuid;
      v_connected boolean;
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

      -- CP-LOG-UNIFICATION-001: tienda conectada al catálogo de su organización.
      IF p_store_id IS NOT NULL THEN
        SELECT s.tenant_id INTO v_tenant FROM public.stores s WHERE s.id = p_store_id;
        v_connected := v_tenant IS NOT NULL
          AND public.is_catalog_store_connected(v_tenant, p_store_id);
      END IF;

      RETURN QUERY
      SELECT
        p.id, p.name, p.description, p.sku, p.price, p.cost_price,
        -- MISIÓN 002: imagen master-first para filas vinculadas (una sola
        -- fuente; el cambio del maestro se refleja sin copias por tienda)
        COALESCE(
          NULLIF((SELECT mm.image_path FROM public.master_products mm WHERE mm.id = p.master_product_id), ''),
          p.image_url
        ) AS image_url,
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
        COALESCE(p.is_service, false),
        -- CP-OPERATIONAL-CLASS-002: clasificación operativa de la fila local
        -- (NULL = Sin clasificar; nunca se comparte entre tiendas).
        p.operational_class AS operational_class,
        'local'::text AS source,
        p.master_product_id
      FROM public.products p
      WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
        AND public.has_store_access(p.store_id)
        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
        AND (
          v_search = ''
          OR p.name ILIKE ('%' || v_search || '%')
          OR p.sku ILIKE ('%' || v_search || '%')
          OR COALESCE(p.barcode, '') = v_search
          OR (
            p.master_product_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.master_products m
               WHERE m.id = p.master_product_id
                 AND m.barcode = v_search
                 AND m.tenant_id = (SELECT s2.tenant_id FROM public.stores s2 WHERE s2.id = p.store_id)
            )
          )
        )
        AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
      UNION ALL
      -- CP-LOG-UNIFICATION-001: catálogo maestro de la organización para
      -- tiendas CONECTADAS — SOLO maestros SIN fila local en esta tienda.
      -- Operativos en cero (el maestro no porta datos comerciales): NO
      -- vendible hasta activar (Catálogo) o recibir (Recepciones). La fila
      -- es un vistazo honesto del catálogo: price 0, stock 0, sin variantes,
      -- sin movimientos. is_service del maestro se respeta (catálogo).
      SELECT
        m.id,
        m.name,
        m.description,
        m.sku,
        0::numeric,
        0::numeric,
        m.image_path,
        NULL::text,
        m.unit_of_measure,
        NULL::text,
        m.created_at,
        m.updated_at,
        0::numeric,
        NULL::numeric,
        NULL::integer,
        p_store_id,
        true,
        false,
        '[]'::jsonb,
        'CUP',
        m.barcode,
        m.barcode_type,
        NULL::boolean,
        NULL::numeric,
        NULL::text,
        false,
        m.is_service,
        NULL::public.product_operational_class,
        'master'::text,
        m.id
      FROM public.master_products m
      WHERE v_connected
        AND m.tenant_id = v_tenant
        AND m.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.products p2
          WHERE p2.master_product_id = m.id
            AND p2.store_id = p_store_id
        )
        AND (
          v_search = ''
          OR m.name ILIKE ('%' || v_search || '%')
          OR m.sku ILIKE ('%' || v_search || '%')
          OR COALESCE(m.barcode, '') = v_search
        )
        AND (p_category IS NULL OR p_category = '')
      ORDER BY 2
      LIMIT v_limit OFFSET v_offset;
    END;
$function$;

COMMENT ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) IS
  'Catálogo del POS. Tiendas conectadas al catálogo maestro: filas locales ∪ maestros activos del tenant sin fila local (source=''master'' — vistazo del catálogo organizacional, no vendible sin activación local).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) register_supplier_payment_batch — estado de la receipt tras el lock.
--    Reemisión íntegra de la versión ADN-009 (20261121190000) con DOS
--    cambios quirúrgicos, señalizados con CP-LOG-UNIFICATION-001:
--      a) rama receipt: SELECT ... status → v_doc_status.
--      b) gate: receipts voided/reversed → ERR_RECEIPT_NOT_PAYABLE.
--    Todo lo demás es byte-idéntico a ADN-009.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_doc_status text;
  v_paid numeric;
  v_balance numeric;
  v_payment_id uuid;
  v_block_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_ids jsonb := '[]'::jsonb;
  v_replay_complete boolean := true;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_store_rate numeric;
BEGIN
  -- ── ADN-009 (F2/§4): BLOQUEO COMPARTIDO del documento PRIMERO. Dos
  --    gestores que liquidan el mismo servicio simultáneamente quedan
  --    serializados: el segundo lee el saldo ya actualizado y su pre-check de
  --    overpay ve los pagos confirmados del primero. Mismo mecanismo que el
  --    camino individual (register_supplier_payment FOR UPDATE).
  IF p_ref_type = 'receipt' THEN
    -- CP-LOG-UNIFICATION-001 (§3): el estado de la recepción entra al lock.
    SELECT store_id, total_cost, 'CUP', 1, status
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.receipts WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1), status
      INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.received_services WHERE id = p_ref_id FOR UPDATE;
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

  -- ADN-009 (F12/§4): estado tras el lock (solo servicios ACTIVOS).
  IF p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active' THEN
    RAISE EXCEPTION
      'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: %)',
      v_doc_status;
  END IF;

  -- CP-LOG-UNIFICATION-001 (§3): gate análogo para recepciones — una
  -- recepción ANULADA o REVERTIDA no admite pagos nuevos (la reversión ya
  -- revirtió sus pagos; liquidar un documento muerto rompe la trazabilidad).
  -- Pending/confirmed/active/partial siguen admitidos (comportamiento
  -- histórico intacto).
  IF p_ref_type = 'receipt' AND COALESCE(v_doc_status, 'active') IN ('voided', 'reversed') THEN
    RAISE EXCEPTION
      'ERR_RECEIPT_NOT_PAYABLE: la recepción está % y no admite pagos nuevos',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  v_comp_count := jsonb_array_length(COALESCE(p_payments, '[]'::jsonb));
  IF v_comp_count < 1 OR v_comp_count > 20 THEN
    RAISE EXCEPTION 'ERR_BATCH_SIZE: el lote debe tener entre 1 y 20 componentes (recibidos: %)', v_comp_count;
  END IF;

  -- ── Pre-validación de TODOS los componentes (misma aritmética del motor;
  --    ADN-009 F1/§3: contrato canónico CP-FIN-004) ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_method := btrim(COALESCE(v_comp->>'payment_method', ''));
    v_currency := btrim(COALESCE(v_comp->>'currency', 'CUP'));
    v_amount := NULLIF(v_comp->>'amount', '')::numeric;
    v_rate := COALESCE(NULLIF(v_comp->>'exchange_rate', '')::numeric, 0);

    -- CP-FIN-004 (M2): el heredado 'zelle' se NORMALIZA al canónico. JAMÁS se
    -- persiste 'zelle' como valor nuevo de medio de pago (compatibilidad de
    -- lectura de registros históricos intacta).
    IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;
    IF v_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: medio de pago no soportado (%) en componente %', v_method, v_idx + 1;
    END IF;
    IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: moneda no soportada (%) en componente %', v_currency, v_idx + 1;
    END IF;
    -- ADN-009 (F11/§3): restricción de moneda de Transferencia Exterior —
    -- riel de divisa (USD/EUR), espejo POS + mapping activo. Rechazo temprano
    -- y accionable (el resolver fail-closed queda como backstop).
    IF v_method = 'external_transfer' AND v_currency NOT IN ('USD', 'EUR') THEN
      RAISE EXCEPTION 'ERR_COMPONENT_INVALID: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada en componente %', v_currency, v_idx + 1;
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

  -- ── Saldo pendiente en la moneda del documento (DESPUÉS del lock) ──
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

  -- Pre-check de overpay (SOLO tras descartar replay completo; saldo leído
  -- bajo lock).
  IF v_sum_in_doc > v_balance THEN
    RAISE EXCEPTION 'ERR_BATCH_OVERPAY: el lote (%) excede el saldo pendiente (%). Overpay no permitido.', v_sum_in_doc, v_balance;
  END IF;

  -- ── Inserción por componente (misma transacción ⇒ ATÓMICO). El motor
  --    re-valida estado/tasa/overpay por componente con la fila ya bloqueada
  --    (re-bloqueo no-op dentro de la misma transacción). ──
  FOR v_idx IN 0 .. v_comp_count - 1 LOOP
    v_comp := p_payments -> v_idx;
    v_method := btrim(COALESCE(v_comp->>'payment_method', ''));
    IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;
    v_payment_id := public.register_supplier_payment(
      p_store_id => p_store_id,
      p_ref_type => p_ref_type,
      p_ref_id => p_ref_id,
      p_amount => (v_comp->>'amount')::numeric,
      p_payment_method => v_method,
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
      'payment_method', v_method,
      'currency', COALESCE(v_comp->>'currency', 'CUP'),
      'amount', (v_comp->>'amount')::numeric
    );
  END LOOP;

  RETURN jsonb_build_object('payments', v_ids, 'count', v_comp_count, 'replayed', false);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) register_supplier_payment (motor individual) — mismo gate de receipts.
--    Reemisión íntegra de la versión ADN-009 con los DOS cambios señalizados
--    CP-LOG-UNIFICATION-001 (estado en el SELECT del lock + gate).
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_doc_currency text;
  v_doc_rate numeric;
  v_doc_status text;
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_rate numeric := p_exchange_rate;
  v_store_rate numeric;
BEGIN
  -- ── ADN-009 (F2/§4): BLOQUEO COMPARTIDO — la fila del documento se bloquea
  --    SIEMPRE antes de consultar saldo o idempotencia. Mismo mecanismo que
  --    register_supplier_payment_batch (que además invoca esta función dentro
  --    de su propia transacción: el re-bloqueo es un no-op). Orden de
  --    adquisición documentado: UNA sola fila de documento por transacción
  --    (receipts | received_services | production_orders); el camino de pagos
  --    NO toma advisory locks → sin ciclos advisory↔row ni deadlocks entre
  --    caminos. Las liquidaciones concurrentes del mismo documento quedan
  --    SERIALIZADAS: la segunda lee el saldo ya actualizado.
  IF p_ref_type = 'receipt' THEN
    -- CP-LOG-UNIFICATION-001 (§3): el estado de la recepción entra al lock.
    SELECT store_id, total_cost, 'CUP', 1, status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.receipts WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1), status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.received_services WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
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

  -- CP-LOG-UNIFICATION-001 (§3): gate de estado de recepciones (espejo del
  -- batch): una recepción ANULADA o REVERTIDA no admite pagos nuevos (la
  -- reversión ya revirtió sus pagos). Pending/confirmed/active/partial
  -- siguen admitidos — comportamiento histórico intacto.
  IF p_ref_type = 'receipt' AND COALESCE(v_doc_status, 'active') IN ('voided', 'reversed') THEN
    RAISE EXCEPTION
      'ERR_RECEIPT_NOT_PAYABLE: la recepción está % y no admite pagos nuevos',
      v_doc_status;
  END IF;

  -- Idempotencia (DESPUÉS del lock: dos envíos con la misma clave quedan
  -- serializados y el segundo encuentra el pago del primero).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- CP-FIN-003: monedas y medios del catálogo canónico solamente.
  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'Moneda de pago no soportada: %', p_currency;
  END IF;
  -- CP-FIN-004: normalización del heredado 'zelle' al canónico
  IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'Medio de pago no soportado: %', p_payment_method;
  END IF;

  -- ADN-009 (F11/§3): restricción de moneda de Transferencia Exterior, en
  -- espejo del POS (create_sale_v2: riel de divisa) y de fin_account_mapping
  -- (filas activas USD/EUR → ACT_TRANSF_EXTERIOR; CUP/MLC inactivas). Rechazo
  -- TEMPRANO y accionable; fin_resolve_financial_account queda como backstop.
  IF p_payment_method = 'external_transfer' AND p_currency NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION
      'ERR_COMBINACION_NO_SOPORTADA: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada',
      p_currency;
  END IF;

  -- ADN-009 (F12/§4): estado comprobado DESPUÉS de adquirir el bloqueo. Solo
  -- un servicio ACTIVO admite pagos (un borrador no genera obligación; un
  -- anulado no admite liquidación). receipts/production_orders: fuera del
  -- alcance de la misión — sin cambio de semántica.
  IF p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active' THEN
    RAISE EXCEPTION
      'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: %)',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- CP-FIN-003 (anexo §2): tasa de conversión REAL para moneda ≠ CUP.
  -- El equivalente contable (amount_cup) es columna GENERATED: la tasa debe
  -- llegar correcta a la INSERT. Sin tasa del llamante → tasa manual de la
  -- tienda; sin ninguna → fail-closed (jamás tasa 1 para divisa).
  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION
          'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1). Configúrela en Tasas o envíela con el pago.',
          p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  -- Monto en CUP (para payment_transactions.amount_cup — invariante)
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE round(p_amount * v_rate, 2)
  END;

  -- R3: Validar overpay — todo en la MONEDA DEL DOCUMENTO (20261113120800).
  -- Lectura DESPUÉS del lock (ADN-009): el saldo incluye los pagos de
  -- cualquier liquidación concurrente que ya confirmó.
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_amount_in_doc_currency := CASE
    WHEN p_currency = v_doc_currency THEN p_amount
    ELSE v_amount_cup / v_doc_rate
  END;

  v_balance := v_total - v_paid;
  IF v_amount_in_doc_currency > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_in_doc_currency, v_balance;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, v_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Guards de contrato (patrón 20261117120000): verifican que la reemisión
--    conservó las firmas canónicas y los contratos críticos. Fail-closed.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Firmas intactas (posicionales) — si esto falla, la reemisión rompió un
  -- contrato y NO debe desplegarse.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_products_for_reception'
      AND pg_get_function_identity_arguments(p.oid)
          = 'p_store_id uuid, p_search_term text, p_page integer, p_page_size integer'
  ) THEN
    RAISE EXCEPTION 'CONTRACTO ROTO: firma de get_products_for_reception';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_products_for_pos'
      AND pg_get_function_identity_arguments(p.oid)
          = 'p_store_id uuid, p_search_term text, p_category text, p_limit integer, p_offset integer'
  ) THEN
    RAISE EXCEPTION 'CONTRACTO ROTO: firma de get_products_for_pos';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_supplier_payment_batch'
      AND pg_get_function_identity_arguments(p.oid)
          = 'p_store_id uuid, p_ref_type text, p_ref_id uuid, p_payments jsonb, p_paid_by uuid, p_payment_date timestamp with time zone, p_idempotency_key text'
  ) THEN
    RAISE EXCEPTION 'CONTRACTO ROTO: firma de register_supplier_payment_batch';
  END IF;

  -- Columnas de retorno: la fuente SIEMPRE al final (aditivo).
  IF (SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL unnest(p.proallargtypes::oid[]) WITH ORDINALITY AS t(oid, ord)
      JOIN pg_type ty ON ty.oid = t.oid
      JOIN pg_attribute a ON a.attrelid = ty.typrelid AND a.attnum = t.ord
      WHERE n.nspname = 'public' AND p.proname = 'get_products_for_reception'
  ) IS NULL THEN
    RAISE EXCEPTION 'CONTRACTO ROTO: get_products_for_reception sin columnas OUT';
  END IF;

  -- La rama maestra SOLO para tiendas conectadas: la definición debe
  -- referenciar is_catalog_store_connected y master_products.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_products_for_pos'
      AND position('is_catalog_store_connected' in p.prosrc) > 0
      AND position('master_products' in p.prosrc) > 0
      AND position('source' in p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'CONTRACTO ROTO: get_products_for_pos sin unión maestra';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_supplier_payment'
      AND position('ERR_RECEIPT_NOT_PAYABLE' in p.prosrc) > 0
      AND position('ERR_RECEIPT_NOT_PAYABLE' in
        (SELECT p2.prosrc FROM pg_proc p2
         JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
         WHERE n2.nspname = 'public' AND p2.proname = 'register_supplier_payment_batch')
      ) > 0
  ) THEN
    RAISE EXCEPTION 'CONTRACTO ROTO: gate de receipts ausente en el motor de pagos';
  END IF;

  RAISE NOTICE 'CONTRACTOS OK: get_products_for_reception, get_products_for_pos, register_supplier_payment(_batch)';
END $$;
