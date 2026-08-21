-- Fix: get_paginated_products — leer stock de inventory.quantity en vez de products.stock_current
-- CAUSA: products.stock_current está desincronizado para 67 productos.
-- La fuente de verdad es inventory.quantity (sincronizada por triggers de stock_movements).

CREATE OR REPLACE FUNCTION public.get_paginated_products(
  p_store_id uuid,
  p_search_term text DEFAULT ''::text,
  p_category text DEFAULT ''::text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  sku text,
  barcode text,
  barcode_type text,
  price numeric,
  precio_empresa numeric,
  cost_price numeric,
  image_url text,
  category text,
  unit_of_measure text,
  supplier text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  stock_current numeric,
  cost_average numeric,
  min_stock numeric,
  store_id uuid,
  is_active boolean,
  visible_en_tienda boolean,
  price_visible boolean,
  stock_visible boolean,
  on_promotion boolean,
  price_currency text,
  has_movements boolean,
  total bigint,
  is_complete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE v_total bigint; v_is_complete boolean;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
  AND (COALESCE(p_search_term, '') = '' OR p.search_vector @@ plainto_tsquery('spanish', p_search_term) OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
  AND (COALESCE(p_category, '') = '' OR p.category = p_category);

  v_is_complete := (p_limit + p_offset >= v_total);

  RETURN QUERY SELECT
    p.id::uuid, p.name::text, p.description::text, p.sku::text, p.barcode::text, p.barcode_type::text,
    p.price::numeric, p.precio_empresa::numeric, p.cost_price::numeric, p.image_url::text,
    p.category::text, p.unit_of_measure::text, p.supplier::text,
    p.created_at::timestamptz, p.updated_at::timestamptz,
    -- FIX: leer de inventory.quantity (fuente de verdad) en vez de p.stock_current (desincronizado)
    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
    p.cost_average::numeric, p.min_stock::numeric,
    p.store_id::uuid, p.is_active::boolean, p.visible_en_tienda::boolean,
    COALESCE(p.price_visible, true)::boolean, COALESCE(p.stock_visible, true)::boolean, COALESCE(p.on_promotion, false)::boolean, COALESCE(p.price_currency, 'CUP')::text,
    EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)::boolean AS has_movements,
    v_total::bigint, v_is_complete::boolean
  FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
  AND (COALESCE(p_search_term, '') = '' OR p.search_vector @@ plainto_tsquery('spanish', p_search_term) OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
  AND (COALESCE(p_category, '') = '' OR p.category = p_category)
  ORDER BY p.name LIMIT p_limit OFFSET p_offset;
END;
$function$;
