-- DECLARED FINAL STATE (Git) de managed_delete_product
-- fuente: 20260527094858_harden_tenant_isolation_products_stores_tenants.sql stmt#21

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
$$
