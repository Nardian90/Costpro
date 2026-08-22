-- ============================================================================
-- Migration: 20260820000010_fix_barcode_type_and_rpc_trim.sql
-- H-01: barcode_type consistente + H-02: RPC trim
--
-- H-01: El trigger ensure_product_barcode ahora setea barcode_type='INTERNAL'
-- cuando genera un barcode INT... No puede quedar INT+EAN13.
--
-- H-02: get_products_for_pos ahora hace trim(coalesce(p_search_term, ''))
-- para que espacios del scanner no impidan encontrar el producto.
-- ============================================================================

-- ═══ H-01: Trigger con barcode_type=INTERNAL ═══
CREATE OR REPLACE FUNCTION public.ensure_product_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
    NEW.barcode := public.generate_internal_barcode();
    NEW.barcode_type := 'INTERNAL';
  ELSE
    IF NEW.barcode LIKE 'INT%' THEN
      NEW.barcode_type := 'INTERNAL';
    ELSIF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
      NEW.barcode_type := 'EAN13';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══ H-02: RPC con trim ═══
CREATE OR REPLACE FUNCTION public.get_products_for_pos(
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, description text, sku text, price numeric,
  cost_price numeric, image_url text, category text, unit_of_measure text,
  supplier text, created_at timestamp with time zone, updated_at timestamp with time zone,
  stock_current numeric, cost_average numeric, min_stock integer, store_id uuid,
  is_active boolean, has_movements boolean, product_variants jsonb, price_currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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
    COALESCE(p.price_currency, 'CUP')
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
