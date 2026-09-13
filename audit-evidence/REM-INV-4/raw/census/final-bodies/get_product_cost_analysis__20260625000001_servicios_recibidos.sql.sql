-- DECLARED FINAL STATE (Git) de get_product_cost_analysis
-- fuente: 20260625000001_servicios_recibidos.sql stmt#31

CREATE OR REPLACE FUNCTION get_product_cost_analysis(
  p_product_id UUID,
  p_store_id UUID
) RETURNS TABLE(
  receipt_id UUID,
  receipt_date TIMESTAMPTZ,
  quantity INT,
  unit_cost FLOAT,
  service_type TEXT,
  service_amount NUMERIC,
  total_cost NUMERIC,
  unit_cost_final NUMERIC
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 
    ri.receipt_id,
    r.reception_date,
    ri.quantity,
    ri.unit_cost,
    st.name AS service_type,
    COALESCE(scd.distribution_amount, 0) AS service_amount,
    ri.unit_cost * ri.quantity + COALESCE(scd.distribution_amount, 0) AS total_cost,
    CASE WHEN ri.quantity > 0 
      THEN (ri.unit_cost * ri.quantity + COALESCE(scd.distribution_amount, 0)) / ri.quantity 
      ELSE 0 END AS unit_cost_final
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  LEFT JOIN service_cost_distributions scd ON scd.receipt_item_id = ri.id
  LEFT JOIN received_services rs ON rs.id = scd.service_id AND rs.status = 'active'
  LEFT JOIN service_types st ON st.id = rs.service_type_id
  WHERE ri.product_id = p_product_id
    AND r.store_id = p_store_id
    AND r.status = 'active'
  ORDER BY r.reception_date DESC;
$$
