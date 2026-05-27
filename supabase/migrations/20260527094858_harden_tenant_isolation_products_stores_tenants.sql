-- Critical multi-tenant isolation hardening for products, stores, and tenants.
-- Scope:
--   - remove permissive products policies
--   - remove hidden broad product read policy found in production
--   - correct stores membership visibility
--   - enable and constrain tenants RLS
--   - fail loudly if broad ALL=true policies remain on scoped tables

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared helper: store access must be authenticated, membership based, and
-- tenant-aware for non-admin users. Kept in public for backward compatibility
-- because existing RPCs and policies call public.has_store_access(uuid).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    JOIN public.stores s
      ON s.id = m.store_id
    JOIN public.profiles p
      ON p.id = m.user_id
    WHERE m.user_id = v_user_id
      AND m.store_id = p_store_id
      AND m.status::text = 'active'
      AND (
        p.tenant_id IS NULL
        OR s.tenant_id IS NULL
        OR p.tenant_id = s.tenant_id
      )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_store_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_access(uuid) TO service_role;

COMMENT ON FUNCTION public.has_store_access(uuid) IS
'Returns true when the authenticated user is an admin or has an active membership for the store without a tenant mismatch.';

-- ---------------------------------------------------------------------------
-- products: remove permissive policies and replace with operation-specific RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_can_manage_products" ON public.products;
DROP POLICY IF EXISTS "authenticated_users_manage_products" ON public.products;
DROP POLICY IF EXISTS "deny_client_writes" ON public.products;
DROP POLICY IF EXISTS "public_read_products" ON public.products;
DROP POLICY IF EXISTS "products_select_store_access" ON public.products;
DROP POLICY IF EXISTS "products_insert_store_access" ON public.products;
DROP POLICY IF EXISTS "products_update_store_access" ON public.products;
DROP POLICY IF EXISTS "products_delete_store_access" ON public.products;

CREATE POLICY "products_select_store_access"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    public.has_store_access(public.products.store_id)
    AND (
      public.products.tenant_id IS NULL
      OR public.products.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = public.products.store_id
      )
    )
  );

CREATE POLICY "products_insert_store_access"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_store_access(public.products.store_id)
    AND (
      public.products.tenant_id IS NULL
      OR public.products.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = public.products.store_id
      )
    )
  );

CREATE POLICY "products_update_store_access"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    public.has_store_access(public.products.store_id)
    AND (
      public.products.tenant_id IS NULL
      OR public.products.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = public.products.store_id
      )
    )
  )
  WITH CHECK (
    public.has_store_access(public.products.store_id)
    AND (
      public.products.tenant_id IS NULL
      OR public.products.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = public.products.store_id
      )
    )
  );

CREATE POLICY "products_delete_store_access"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    public.has_store_access(public.products.store_id)
    AND (
      public.products.tenant_id IS NULL
      OR public.products.tenant_id IS NOT DISTINCT FROM (
        SELECT s.tenant_id
        FROM public.stores s
        WHERE s.id = public.products.store_id
      )
    )
  );

-- SECURITY DEFINER product RPCs bypass table RLS, so they must enforce the
-- same store and tenant authorization explicitly.
CREATE OR REPLACE FUNCTION public.get_paginated_products(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  category text,
  price numeric,
  cost_price numeric,
  min_stock integer,
  image_url text,
  description text,
  stock_current numeric,
  store_id uuid,
  is_active boolean,
  has_movements boolean,
  total_count bigint
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
  WITH products_filtered AS (
    SELECT
      p.id AS prod_id,
      p.name AS prod_name,
      p.sku AS prod_sku,
      p.category AS prod_cat,
      p.price AS prod_price,
      p.cost_price AS prod_cost,
      p.min_stock AS prod_min,
      p.image_url AS prod_img,
      p.description AS prod_desc,
      p.store_id AS prod_store_id,
      p.is_active AS prod_active,
      COUNT(*) OVER() AS total_records
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
  )
  SELECT
    pf.prod_id,
    pf.prod_name,
    pf.prod_sku,
    pf.prod_cat,
    pf.prod_price,
    pf.prod_cost,
    pf.prod_min,
    pf.prod_img,
    pf.prod_desc,
    (
      SELECT COALESCE(SUM(inv.quantity), 0)
      FROM public.inventory inv
      WHERE inv.product_id = pf.prod_id
        AND inv.store_id = pf.prod_store_id
    )::numeric,
    pf.prod_store_id,
    pf.prod_active,
    EXISTS (
      SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = pf.prod_id
      UNION ALL
      SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = pf.prod_id
      UNION ALL
      SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = pf.prod_id
    ) AS has_movements,
    pf.total_records
  FROM products_filtered pf
  ORDER BY pf.prod_name
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

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
  product_variants jsonb
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
    )
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

CREATE OR REPLACE FUNCTION public.managed_delete_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store_id uuid;
  v_product_name text;
  v_product_tenant_id uuid;
  v_store_tenant_id uuid;
  v_has_movements boolean;
BEGIN
  SELECT p.store_id, p.name, p.tenant_id, s.tenant_id
  INTO v_store_id, v_product_name, v_product_tenant_id, v_store_tenant_id
  FROM public.products p
  LEFT JOIN public.stores s
    ON s.id = p.store_id
  WHERE p.id = p_product_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_tenant_id IS NOT NULL
     AND v_product_tenant_id IS DISTINCT FROM v_store_tenant_id THEN
    RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'Unauthorized product access' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p_product_id
    UNION ALL
    SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p_product_id
    UNION ALL
    SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p_product_id
  ) INTO v_has_movements;

  IF v_has_movements THEN
    RAISE EXCEPTION 'No se puede eliminar un producto con movimientos. Desactivelo en su lugar.';
  END IF;

  DELETE FROM public.inventory
  WHERE product_id = p_product_id
    AND store_id = v_store_id;

  DELETE FROM public.product_variants
  WHERE product_id = p_product_id;

  DELETE FROM public.products
  WHERE id = p_product_id
    AND store_id = v_store_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
  VALUES (
    auth.uid(),
    'DELETE_PRODUCT',
    'products',
    p_product_id,
    jsonb_build_object('name', v_product_name, 'store_id', v_store_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.managed_toggle_product_active(
  p_product_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store_id uuid;
  v_old_active boolean;
  v_product_tenant_id uuid;
  v_store_tenant_id uuid;
BEGIN
  SELECT p.store_id, p.is_active, p.tenant_id, s.tenant_id
  INTO v_store_id, v_old_active, v_product_tenant_id, v_store_tenant_id
  FROM public.products p
  LEFT JOIN public.stores s
    ON s.id = p.store_id
  WHERE p.id = p_product_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_tenant_id IS NOT NULL
     AND v_product_tenant_id IS DISTINCT FROM v_store_tenant_id THEN
    RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'Unauthorized product access' USING ERRCODE = '42501';
  END IF;

  UPDATE public.products
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_product_id
    AND store_id = v_store_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'ACTIVATE_PRODUCT' ELSE 'DEACTIVATE_PRODUCT' END,
    'products',
    p_product_id,
    jsonb_build_object('is_active', v_old_active, 'store_id', v_store_id),
    jsonb_build_object('is_active', p_is_active, 'store_id', v_store_id)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_paginated_products(integer, integer, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.managed_delete_product(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.managed_toggle_product_active(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_paginated_products(integer, integer, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_delete_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.managed_toggle_product_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_paginated_products(integer, integer, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_products_for_pos(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.managed_delete_product(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.managed_toggle_product_active(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- stores: remove overlapping/broad visibility policies and recreate strict,
-- operation-specific policies.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stores visibility" ON public.stores;
DROP POLICY IF EXISTS "Stores management" ON public.stores;
DROP POLICY IF EXISTS "Users can view assigned stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view their assigned stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view all stores" ON public.stores;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.stores;
DROP POLICY IF EXISTS "Admins and Encargados can manage stores" ON public.stores;
DROP POLICY IF EXISTS "stores_select_admin_or_member" ON public.stores;
DROP POLICY IF EXISTS "stores_insert_admin_or_encargado" ON public.stores;
DROP POLICY IF EXISTS "stores_update_admin_or_encargado_creator" ON public.stores;
DROP POLICY IF EXISTS "stores_delete_admin" ON public.stores;

CREATE POLICY "stores_select_admin_or_member"
  ON public.stores
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_store_memberships m
      JOIN public.profiles p
        ON p.id = m.user_id
      WHERE m.store_id = public.stores.id
        AND m.user_id = auth.uid()
        AND m.status::text = 'active'
        AND (
          p.tenant_id IS NULL
          OR public.stores.tenant_id IS NULL
          OR p.tenant_id = public.stores.tenant_id
        )
    )
  );

CREATE POLICY "stores_insert_admin_or_encargado"
  ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.stores.created_by = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text = 'encargado'
          AND public.stores.tenant_id IS NOT DISTINCT FROM p.tenant_id
      )
    )
  );

CREATE POLICY "stores_update_admin_or_encargado_creator"
  ON public.stores
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.stores.created_by = auth.uid()
      AND public.has_store_access(public.stores.id)
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text = 'encargado'
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.stores.created_by = auth.uid()
      AND public.has_store_access(public.stores.id)
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role::text = 'encargado'
          AND public.stores.tenant_id IS NOT DISTINCT FROM p.tenant_id
      )
    )
  );

CREATE POLICY "stores_delete_admin"
  ON public.stores
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- tenants: enable RLS and expose only authorized tenant rows.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenants FROM PUBLIC;
REVOKE ALL ON TABLE public.tenants FROM anon;
GRANT SELECT ON TABLE public.tenants TO authenticated;

DROP POLICY IF EXISTS "tenants_select_own_or_store_member" ON public.tenants;
DROP POLICY IF EXISTS "Tenants visibility" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select_authenticated" ON public.tenants;

CREATE POLICY "tenants_select_own_or_store_member"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = public.tenants.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_store_memberships m
      JOIN public.stores s
        ON s.id = m.store_id
      WHERE m.user_id = auth.uid()
        AND m.status::text = 'active'
        AND s.tenant_id = public.tenants.id
    )
  );

-- ---------------------------------------------------------------------------
-- Guardrail: do not allow broad true predicates to remain on the scoped
-- tenant-isolated tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_policies text[];
BEGIN
  SELECT array_agg(format('%I.%I:%I', n.nspname, c.relname, p.polname))
  INTO v_bad_policies
  FROM pg_policy p
  JOIN pg_class c
    ON c.oid = p.polrelid
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('products', 'stores', 'tenants')
    AND (
      COALESCE(pg_get_expr(p.polqual, p.polrelid), '') IN ('true', '(true)')
      OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') IN ('true', '(true)')
    );

  IF COALESCE(array_length(v_bad_policies, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Unsafe broad RLS policies remain on scoped tables: %', v_bad_policies;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
