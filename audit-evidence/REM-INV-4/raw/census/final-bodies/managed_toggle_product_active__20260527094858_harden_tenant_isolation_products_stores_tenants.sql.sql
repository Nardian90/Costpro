-- DECLARED FINAL STATE (Git) de managed_toggle_product_active
-- fuente: 20260527094858_harden_tenant_isolation_products_stores_tenants.sql stmt#22

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
$$
