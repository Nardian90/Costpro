-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-17): añadir price_currency al RPC get_products_for_pos
-- ════════════════════════════════════════════════════════════════════
-- Objetivo: la UI de "Comisiones por producto" necesita mostrar la moneda
-- original del producto (CUP, USD, EUR, MLC) para que el admin configure
-- comisiones sabiendo que "panel 375 USD × 680 × 1% = 2550 CUP".
--
-- El RPC actual devuelve todos los campos de products EXCEPTO price_currency.
-- Esta migración lo añade a la firma RETURNS TABLE y al SELECT.
--
-- Compatibilidad: cambio aditivo — los clientes existentes que deserialicen
-- por nombre siguen funcionando (reciben un campo nuevo que simplemente ignoran).
-- ════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_products_for_pos(uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_products_for_pos(
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text
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
  -- v3 (2026-07-17): moneda del precio de venta (CUP, USD, EUR, MLC)
  price_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
    p.min_stock,
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
    -- v3 (2026-07-17): devolver price_currency (default 'CUP' si es NULL)
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
  ORDER BY p.name;
END;
$function$;

-- Re-aplicar grants
REVOKE EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text) TO service_role;

-- Verificación
SELECT 'rpc_price_currency_added' AS status,
       (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'get_products_for_pos' AND n.nspname = 'public') AS function_count;
