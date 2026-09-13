-- DECLARED FINAL STATE (Git) de get_or_create_product_cost_sheet
-- fuente: 20260615000002_create_product_cost_sheets_and_alter_products.sql stmt#20

CREATE OR REPLACE FUNCTION public.get_or_create_product_cost_sheet(
  p_product_id UUID,
  p_store_id UUID,
  p_template_id TEXT DEFAULT NULL,
  p_modalidad TEXT DEFAULT NULL,
  p_pdf_format TEXT DEFAULT 'res148'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost_sheet_id UUID;
  v_template_id TEXT;
  v_modalidad TEXT;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para acceder a las fichas de costo de esta tienda';
  END IF;

  -- 1. Check if product already has a cost sheet
  SELECT cost_sheet_id INTO v_cost_sheet_id
  FROM products WHERE id = p_product_id;

  IF v_cost_sheet_id IS NOT NULL THEN
    -- Return existing cost sheet data
    SELECT jsonb_build_object(
      'id', id,
      'product_id', product_id,
      'store_id', store_id,
      'template_id', template_id,
      'modalidad', modalidad,
      'calculated_data', calculated_data,
      'cost_price', cost_price,
      'cost_price_updated_at', cost_price_updated_at,
      'sync_status', sync_status,
      'exists', true
    ) INTO v_result
    FROM product_cost_sheets
    WHERE id = v_cost_sheet_id AND deleted_at IS NULL;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- 2. Resolve template: explicit parameter > store default > error
  IF p_template_id IS NOT NULL THEN
    v_template_id := p_template_id;
    v_modalidad := COALESCE(p_modalidad, 'produccion');
  ELSE
    -- Get store's default template
    SELECT sct.template_id, sct.modalidad INTO v_template_id, v_modalidad
    FROM store_cost_templates sct
    WHERE sct.store_id = p_store_id AND sct.is_active = true;

    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'No hay plantilla de FC asignada a esta tienda. Configure una plantilla predeterminada primero.';
    END IF;
  END IF;

  -- 3. Return template info for client-side calculation
  -- (The actual calculation uses the TypeScript cost-engine on the API route)
  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'store_id', p_store_id,
    'template_id', v_template_id,
    'modalidad', v_modalidad,
    'pdf_format', COALESCE(p_pdf_format, 'res148'),
    'exists', false,
    'needs_calculation', true
  );
END;
$$
