-- ============================================================================
-- CP-OPERATIONAL-CLASS-001 (2026-11-08) — Clasificación operativa del catálogo
-- ============================================================================
-- MISIÓN: nueva clasificación INFORMATIVA e INDEPENDIENTE del tipo físico/
-- servicio para cada elemento del catálogo: venta | insumo | activo_fijo |
-- util_herramienta. Persistida en la capa operativa (public.products, por
-- tienda+tenant) que es la fila que edita el modal «Información del producto»
-- (EditProductModal → useUpdateProduct) y la que expone el Listado de precios
-- (get_products_for_pos) y el Catálogo (get_paginated_products_v2).
--
-- REGLAS DE LA MISIÓN:
--  · NULL = «Sin clasificar». Los registros HISTÓRICOS NO se reclasifican:
--    ninguna fila existente cambia de valor (sin UPDATE masivo, sin backfill).
--  · No altera contabilización, cuentas contables, valoración, impuestos,
--    ventas, costos, movimientos, facturación ni tratamiento gasto/activo:
--    es SOLO clasificación informativa para organizar y filtrar.
--  · No confundir con la categoría comercial (products.category TEXT) ni con
--    el tipo físico/servicio (products.is_service BOOLEAN).
--  · RLS intacto: la columna pertenece a products; las políticas existentes
--    (products_tenant_select/insert/update/delete, políticas de membresía por
--    tienda) cubren automáticamente lectura y escritura del nuevo campo.
--  · Firma de ambos RPCs PRESERVADA (solo se añade una columna de retorno);
--    permisos (ACL) se conservan por ser CREATE OR REPLACE; se re-declaran
--    los REVOKE de hardening (20261020000002) por contrato explícito.
-- ============================================================================

-- 1) Tipo enumerado (4 valores; ampliable a futuro con ALTER TYPE ADD VALUE).
--    CREATE TYPE no admite IF NOT EXISTS: guard idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t
                 JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'product_operational_class'
                   AND n.nspname = 'public') THEN
    CREATE TYPE public.product_operational_class AS ENUM (
      'venta',
      'insumo',
      'activo_fijo',
      'util_herramienta'
    );
  END IF;
END
$$;

COMMENT ON TYPE public.product_operational_class IS
'Clasificación operativa del elemento del catálogo (misión CP-OPERATIONAL-CLASS-001). Informativa: NO cambia contabilización, valoración, impuestos ni reglas de venta/costeo. Independiente de is_service (físico/servicio) y de la categoría comercial.';

-- 2) Columna en la capa operativa. NULL = Sin clasificar (estado inicial de
--    TODO el catálogo existente; los pendientes se migran de forma progresiva
--    y verificada desde la UI, nunca automáticamente).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS operational_class public.product_operational_class;

COMMENT ON COLUMN public.products.operational_class IS
'Clasificación operativa del elemento: venta | insumo | activo_fijo | util_herramienta. NULL = Sin clasificar (registros históricos y pendientes; jamás se asigna automáticamente). Independiente de is_service y de la categoría comercial. Solo informativa: no afecta contabilidad, impuestos, ventas ni costeo.';

-- 3) Índice parcial para el filtro del Listado de precios / Catálogo
--    (scoping por tienda ya garantizado por RLS; el índice solo acelera).
CREATE INDEX IF NOT EXISTS products_operational_class_store_idx
  ON public.products (store_id, operational_class)
  WHERE operational_class IS NOT NULL;

-- 4) Verificación de integridad (append-only: solo lectura + NOTICE).
DO $$
DECLARE
  v_column_type text;
  v_enum_values text;
  v_unclassified bigint;
  v_classified bigint;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_column_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'products'
    AND a.attname = 'operational_class' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_column_type IS NULL THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS: la columna products.operational_class no fue creada';
  END IF;
  IF v_column_type <> 'public.product_operational_class' THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS: tipo inesperado % (se esperaba public.product_operational_class)', v_column_type;
  END IF;

  SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) INTO v_enum_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'product_operational_class';
  IF v_enum_values IS DISTINCT FROM 'venta,insumo,activo_fijo,util_herramienta' THEN
    RAISE EXCEPTION 'CP-OPERATIONAL-CLASS: valores del enum inesperados: %', v_enum_values;
  END IF;

  -- Inventario del estado de clasificación (NINGÚN dato se modifica aquí).
  SELECT COUNT(*) INTO v_classified FROM public.products WHERE operational_class IS NOT NULL;
  SELECT COUNT(*) INTO v_unclassified FROM public.products WHERE operational_class IS NULL;
  RAISE NOTICE 'CP-OPERATIONAL-CLASS OK: % fila(s) clasificada(s), % Sin clasificar (histórico intacto, sin backfill)', v_classified, v_unclassified;
END
$$;

-- ============================================================================
-- 5) get_paginated_products_v2 — expone operational_class (Catálogo).
--    Definición vigente (20261028120000) PRESERVADA al 100%: misma firma,
--    mismos filtros/orden; ÚNICO cambio = columna de retorno añadida antes
--    de total_count (posición fija al final del payload por-fila).
-- ============================================================================
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
  -- CP-OPERATIONAL-CLASS-001: nueva columna de retorno (NULL = Sin clasificar)
  operational_class public.product_operational_class,
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
    -- CP-OPERATIONAL-CLASS-001: clasificación operativa (NULL = Sin clasificar)
    p.operational_class AS operational_class,
    COUNT(*) OVER()::bigint AS total_count
  FROM public.products p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND public.has_store_access(p.store_id)
    AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
         (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
    AND (p_search_term IS NULL OR p_search_term = '' OR
         p.name ILIKE ('%' || p_search_term || '%') OR
         p.sku ILIKE ('%' || p_search_term || '%') OR
         COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%') OR
         -- CP-CATÁLOGO (2026-10-28): búsqueda por barcode canónico del maestro
         -- (coincidencia exacta, como el escaneo) para productos vinculados
         -- de la misma organización de la fila local.
         (
           p.master_product_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM public.master_products m
              WHERE m.id = p.master_product_id
                AND m.barcode = trim(p_search_term)
                AND m.tenant_id = (SELECT s3.tenant_id FROM public.stores s3 WHERE s3.id = p.store_id)
           )
         ))
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

-- ============================================================================
-- 6) get_products_for_pos — expone operational_class (Listado de precios /
--    POS). Definición vigente (20261101130000) PRESERVADA al 100%: misma
--    firma, mismos guardas/filtros; ÚNICO cambio = columna de retorno añadida
--    al final del payload por-fila.
-- ============================================================================
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
  -- CP-OPERATIONAL-CLASS-001: nueva columna de retorno (NULL = Sin clasificar)
  operational_class public.product_operational_class
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
        -- CP-OPERATIONAL-CLASS-001: clasificación operativa (NULL = Sin clasificar)
        p.operational_class AS operational_class
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
      ORDER BY p.name
      LIMIT v_limit OFFSET v_offset;
    END;
$function$;

-- ============================================================================
-- 7) Hardening de permisos — contrato del repo (20261020000002): los RPCs
--    solo se ejecutan desde sesiones autenticadas (CREATE OR REPLACE conserva
--    los ACL vigentes; los REVOKE se re-declaran por contrato explícito).
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_paginated_products_v2 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_products_for_pos FROM PUBLIC, anon;
