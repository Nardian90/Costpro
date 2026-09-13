-- DECLARED FINAL STATE (Git) de save_product_cost_sheet
-- fuente: 20260615000002_create_product_cost_sheets_and_alter_products.sql stmt#24

CREATE OR REPLACE FUNCTION public.save_product_cost_sheet(
  p_product_id UUID,
  p_store_id UUID,
  p_template_id TEXT,
  p_modalidad TEXT,
  p_calculated_data JSONB,
  p_cost_price NUMERIC(12,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cs_id UUID;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para guardar fichas de costo en esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida';
  END IF;

  -- Validate cost_price > 0 (REG-03: division by zero prevention)
  IF p_cost_price < 0 THEN
    RAISE EXCEPTION 'El costo unitario no puede ser negativo';
  END IF;

  -- Upsert the cost sheet
  INSERT INTO product_cost_sheets (product_id, store_id, template_id, modalidad, calculated_data, cost_price, sync_status)
  VALUES (p_product_id, p_store_id, p_template_id, p_modalidad, p_calculated_data, p_cost_price, 'synced')
  ON CONFLICT (product_id) WHERE deleted_at IS NULL
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    modalidad = EXCLUDED.modalidad,
    calculated_data = EXCLUDED.calculated_data,
    cost_price = EXCLUDED.cost_price,
    cost_price_updated_at = now(),
    sync_status = 'synced',
    updated_at = now()
  RETURNING id INTO v_cs_id;

  -- Link product to cost sheet
  UPDATE products SET cost_sheet_id = v_cs_id WHERE id = p_product_id;

  -- Return confirmation
  SELECT jsonb_build_object(
    'id', id,
    'product_id', product_id,
    'cost_price', cost_price,
    'cost_price_updated_at', cost_price_updated_at,
    'sync_status', sync_status
  ) INTO v_result
  FROM product_cost_sheets WHERE id = v_cs_id;

  RETURN v_result;
END;
$$
