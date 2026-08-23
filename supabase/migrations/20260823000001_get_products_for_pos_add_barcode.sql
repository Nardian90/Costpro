-- ============================================================================
-- Migration: 20260823000001_get_products_for_pos_add_barcode.sql
-- ============================================================================
-- Purpose: Add `barcode` and `barcode_type` columns to the
-- `get_products_for_pos` RPC return type so the UI can display them in the
-- EditProductModal and other views.
--
-- Background:
--   The RPC `get_products_for_pos(p_store_id, p_search_term, p_category)` is
--   used by `useProducts()` (src/hooks/api/useProducts.ts) to fetch products
--   for the catalog grid, inventory view, and edit modal.
--
--   The RPC returned 19 columns (id, name, description, sku, price, cost_price,
--   image_url, category, unit_of_measure, supplier, created_at, updated_at,
--   stock_current, cost_average, min_stock, store_id, is_active, has_movements,
--   product_variants, price_currency) but NOT `barcode` or `barcode_type`.
--
--   This caused a critical UX bug: when the user opened the EditProductModal
--   to edit a product, the `barcode` field was always empty (because the RPC
--   didn't return it). The user could click "Autogenerar" to get a barcode,
--   then click "Guardar" — the PATCH would persist the barcode in the BD —
--   but the next time the user opened the modal, the barcode appeared empty
--   again because the RPC fetch didn't include it.
--
--   Symptom reported by user: "the generated barcode doesn't persist after
--   saving and reopening the product."
--
--   Root cause: NOT a persistence bug — the BD does persist the barcode.
--   The bug was that the RPC returned by `useProducts()` did not include
--   the `barcode` column, so the UI always showed an empty field.
--
-- Compat: this is an additive change (new columns appended to the return
-- type). Existing clients that parse by name will continue to work; they
-- will simply see two new fields. Drop+CREATE because PostgreSQL requires
-- DROP FUNCTION when changing the return type signature.
-- ============================================================================

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
  on_promotion boolean
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
        COALESCE(p.on_promotion, false)
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

COMMENT ON FUNCTION public.get_products_for_pos(uuid, text, text, integer, integer) IS
    'Returns products for a store (POS, catalog, inventory). Now includes barcode, barcode_type, visible_en_tienda, precio_empresa and on_promotion for full EditProductModal support.';
