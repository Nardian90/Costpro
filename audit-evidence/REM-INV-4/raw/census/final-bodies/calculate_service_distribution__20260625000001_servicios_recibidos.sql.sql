-- DECLARED FINAL STATE (Git) de calculate_service_distribution
-- fuente: 20260625000001_servicios_recibidos.sql stmt#30

CREATE OR REPLACE FUNCTION calculate_service_distribution(
  p_service_id UUID
) RETURNS TABLE(
  receipt_item_id UUID,
  product_id UUID,
  distribution_amount NUMERIC,
  distribution_percentage NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_service received_services%ROWTYPE;
  v_method TEXT;
  v_total_amount NUMERIC;
  v_total_value NUMERIC DEFAULT 0;
  v_total_qty NUMERIC DEFAULT 0;
  v_link service_reception_links%ROWTYPE;
  v_receipt_id UUID;
  v_item receipt_items%ROWTYPE;
  v_allocated NUMERIC;
BEGIN
  SELECT * INTO v_service FROM received_services WHERE id = p_service_id;
  IF NOT FOUND THEN RETURN; END IF;
  
  v_method := v_service.distribution_method;
  v_total_amount := v_service.total_amount;

  -- Para cada recepción vinculada
  FOR v_link IN SELECT * FROM service_reception_links WHERE service_id = p_service_id AND allocated_amount > 0 LOOP
    v_receipt_id := v_link.receipt_id;
    v_allocated := v_link.allocated_amount;

    -- Calcular base de distribución según método
    IF v_method = 'amount' THEN
      SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total_value
      FROM receipt_items WHERE receipt_id = v_receipt_id;
      
      IF v_total_value > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_receipt_id LOOP
          distribution_amount := v_allocated * (v_item.quantity * v_item.unit_cost / v_total_value);
          distribution_percentage := (v_item.quantity * v_item.unit_cost / v_total_value) * 100;
          receipt_item_id := v_item.id;
          product_id := v_item.product_id;
          RETURN NEXT;
        END LOOP;
      END IF;

    ELSIF v_method = 'quantity' THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
      FROM receipt_items WHERE receipt_id = v_receipt_id;
      
      IF v_total_qty > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_receipt_id LOOP
          distribution_amount := v_allocated * (v_item.quantity / v_total_qty);
          distribution_percentage := (v_item.quantity / v_total_qty) * 100;
          receipt_item_id := v_item.id;
          product_id := v_item.product_id;
          RETURN NEXT;
        END LOOP;
      END IF;

    ELSIF v_method = 'manual' THEN
      -- En manual, la distribución se guarda directamente desde el cliente
      RETURN;
    END IF;
  END LOOP;
END;
$$
