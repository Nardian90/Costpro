-- ════════════════════════════════════════════════════════════════════
-- SERVICIOS RECIBIDOS Y COSTOS ASOCIADOS
-- Módulo: Inventario → Servicios Recibidos
-- ════════════════════════════════════════════════════════════════════

-- TABLA 1: Tipos de servicio (configurable por tienda)
CREATE TABLE IF NOT EXISTS service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_types_store ON service_types(store_id);

-- TABLA 2: Servicios recibidos (entidad principal)
CREATE TABLE IF NOT EXISTS received_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  service_number TEXT NOT NULL,
  service_date DATE NOT NULL,
  service_type_id UUID REFERENCES service_types(id),
  service_type_name TEXT NOT NULL,
  supplier TEXT,
  reference_doc TEXT,
  currency TEXT DEFAULT 'CUP',
  exchange_rate NUMERIC DEFAULT 1,
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  observations TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','voided','draft')),
  distribution_method TEXT DEFAULT 'amount' CHECK (distribution_method IN ('amount','quantity','manual')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_received_services_store ON received_services(store_id);
CREATE INDEX IF NOT EXISTS idx_received_services_date ON received_services(service_date DESC);
CREATE INDEX IF NOT EXISTS idx_received_services_status ON received_services(status);

-- TABLA 3: Vinculación servicio ↔ recepción
CREATE TABLE IF NOT EXISTS service_reception_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES received_services(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  allocation_percentage NUMERIC DEFAULT 0,
  allocated_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(service_id, receipt_id)
);
CREATE INDEX IF NOT EXISTS idx_srl_service ON service_reception_links(service_id);
CREATE INDEX IF NOT EXISTS idx_srl_receipt ON service_reception_links(receipt_id);

-- TABLA 4: Distribución detallada por línea de recepción
CREATE TABLE IF NOT EXISTS service_cost_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES received_services(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL,
  receipt_item_id UUID NOT NULL,
  product_id UUID NOT NULL,
  distribution_amount NUMERIC NOT NULL DEFAULT 0,
  distribution_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scd_service ON service_cost_distributions(service_id);
CREATE INDEX IF NOT EXISTS idx_scd_receipt_item ON service_cost_distributions(receipt_item_id);
CREATE INDEX IF NOT EXISTS idx_scd_product ON service_cost_distributions(product_id);

-- TABLA 5: Auditoría
CREATE TABLE IF NOT EXISTS service_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID,
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sal_service ON service_audit_log(service_id);

-- RLS
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE received_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_reception_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_cost_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_types_read" ON service_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_types_write" ON service_types FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "received_services_read" ON received_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "received_services_write" ON received_services FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "srl_read" ON service_reception_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "srl_write" ON service_reception_links FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "scd_read" ON service_cost_distributions FOR SELECT TO authenticated USING (true);
CREATE POLICY "scd_write" ON service_cost_distributions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "sal_read" ON service_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "sal_write" ON service_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: Calcular distribución de un servicio entre las líneas de sus recepciones
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
$$;

-- RPC: Obtener análisis de costos por producto
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
$$;
