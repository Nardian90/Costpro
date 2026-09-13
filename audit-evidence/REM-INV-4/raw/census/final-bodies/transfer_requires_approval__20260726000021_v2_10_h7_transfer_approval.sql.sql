-- DECLARED FINAL STATE (Git) de transfer_requires_approval
-- fuente: 20260726000021_v2_10_h7_transfer_approval.sql stmt#11

CREATE OR REPLACE FUNCTION public.transfer_requires_approval(
  p_origin_store_id UUID,
  p_destination_store_id UUID,
  p_items JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id UUID;
  v_rule RECORD;
  v_total_amount NUMERIC := 0;
  v_total_quantity NUMERIC := 0;
  v_item RECORD;
BEGIN
  -- Obtener tenant_id
  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_origin_store_id;

  -- Buscar regla aplicable: primero por store, luego por tenant
  SELECT * INTO v_rule FROM public.transfer_approval_rules
  WHERE is_active = true
    AND (
      (store_id = p_origin_store_id) OR
      (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
    )
  ORDER BY store_id NULLS LAST
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    RETURN FALSE;  -- no hay regla, no requiere aprobación
  END IF;

  -- Calcular totales
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC)
  LOOP
    v_total_quantity := v_total_quantity + v_item.quantity;
    v_total_amount := v_total_amount + (v_item.quantity * v_item.unit_cost);
  END LOOP;

  -- Verificar umbrales
  IF v_rule.threshold_amount IS NOT NULL AND v_total_amount >= v_rule.threshold_amount THEN
    RETURN TRUE;
  END IF;
  IF v_rule.threshold_quantity IS NOT NULL AND v_total_quantity >= v_rule.threshold_quantity THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$
