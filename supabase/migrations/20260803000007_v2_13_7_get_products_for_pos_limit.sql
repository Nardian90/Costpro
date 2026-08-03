-- ============================================================================
-- Migration: 20260803000007_v2_13_7_get_products_for_pos_limit.sql
-- Iteración 11.1 — Fix M-5
-- ============================================================================
-- PROBLEMA: get_products_for_pos no tenía LIMIT. Con catálogos grandes
-- (>2000 productos), el payload era pesado y degradaba performance.
--
-- SOLUCIÓN: Añadir parámetro p_limit (default 500, max 5000) y p_offset
-- (default 0) para paginación server-side. El frontend puede usar
-- usePOSServerSearch para búsquedas paginadas.
--
-- COMPATIBILIDAD: Los parámetros son opcionales (DEFAULT). Llamadas
-- existentes sin p_limit/p_offset siguen funcionando (retornan top 500).
--
-- UP:
--   DROP + CREATE con nuevos parámetros.
--
-- DOWN:
--   DROP + CREATE sin p_limit/p_offset (versión 20260715000011).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_products_for_pos(uuid, text, text);
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
  price_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
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
    p.id,
    p.name,
    p.description,
    p.sku,
    p.price,
    p.cost_price,
    p.image_url,
    p.category,
    p.unit_of_measure,
    p.supplier,
    p.created_at,
    p.updated_at,
    (
      SELECT COALESCE(SUM(inv.quantity), 0)
      FROM public.inventory inv
      WHERE inv.product_id = p.id
        AND inv.store_id = p.store_id
    )::numeric,
    p.cost_average,
    p.min_stock::integer,
    p.store_id,
    p.is_active,
    EXISTS (
      SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
      UNION ALL
      SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
      UNION ALL
      SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id
    ) AS has_movements,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'id', pv.id,
          'name', pv.name,
          'sku', pv.sku,
          'price', pv.price,
          'conversion_factor', pv.conversion_factor
        ))
        FROM public.product_variants pv
        WHERE pv.product_id = p.id
      ),
      '[]'::jsonb
    ),
    COALESCE(p.price_currency, 'CUP')
  FROM public.products p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND public.has_store_access(p.store_id)
    AND (
      p.tenant_id IS NULL
      OR p.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = p.store_id
      )
    )
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR p.name ILIKE ('%' || p_search_term || '%')
      OR p.sku ILIKE ('%' || p_search_term || '%')
    )
    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
  ORDER BY p.name
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) IS
  'Iteración 11.1 (M-5): Added p_limit (default 500, max 5000) and p_offset (default 0) for server-side pagination. Clamped to prevent abuse.';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_products_for_pos(uuid, text, text, integer, integer);
-- -- Restaurar versión de 20260715000011 (sin p_limit/p_offset):
-- -- [pegar body de 20260715000011_fix_get_products_for_pos_min_stock.sql]
-- ============================================================================
