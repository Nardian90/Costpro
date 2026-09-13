-- DECLARED FINAL STATE (Git) de upsert_store_cost_template
-- fuente: 20260615000001_create_store_cost_templates.sql stmt#15

CREATE OR REPLACE FUNCTION public.upsert_store_cost_template(
  p_store_id UUID,
  p_template_id TEXT,
  p_template_data JSONB,
  p_modalidad TEXT,
  p_pdf_format TEXT DEFAULT 'res148',
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado'])) THEN
    RAISE EXCEPTION 'Sin permisos para modificar la plantilla de esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida. Debe ser: produccion, servicios o comercializacion';
  END IF;

  -- Validate store exists
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o inactiva';
  END IF;

  INSERT INTO store_cost_templates (store_id, template_id, template_data, modalidad, pdf_format, created_by)
  VALUES (p_store_id, p_template_id, p_template_data, p_modalidad, p_pdf_format, p_created_by)
  ON CONFLICT (store_id)
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    template_data = EXCLUDED.template_data,
    modalidad = EXCLUDED.modalidad,
    pdf_format = EXCLUDED.pdf_format,
    is_active = true,
    updated_at = now()
  RETURNING jsonb_build_object(
    'id', id,
    'store_id', store_id,
    'template_id', template_id,
    'modalidad', modalidad,
    'pdf_format', pdf_format,
    'is_active', is_active,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$
