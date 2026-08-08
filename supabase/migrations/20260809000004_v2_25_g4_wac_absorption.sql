-- ══════════════════════════════════════════════════════════════════════
-- F-30 G4 — Extender trg_update_product_wac para absorber service costs
-- Resuelve: Iter 2 CRÍTICO #2 (v_dist_costs dead code) + CRÍTICO #3 (trigger no consulta SCD)
-- Restriccion: NO reactivar Path 2 ni Path 3. Single source of truth = este trigger.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_product_wac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id UUID;
  v_total_cost NUMERIC := 0;
  v_total_qty NUMERIC := 0;
  v_service_costs NUMERIC := 0;
  v_current_wac NUMERIC;
BEGIN
  SELECT store_id INTO v_store_id FROM products WHERE id = NEW.product_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;

  -- Sumar costos de receipt_items (costo directo de recepciones)
  SELECT COALESCE(SUM(ri.quantity * ri.unit_cost * COALESCE(ri.tasa_cambio_recepcion, 1.0)), 0)
  INTO v_total_cost
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE ri.product_id = NEW.product_id AND r.store_id = v_store_id AND r.status = 'active';

  -- Sumar cantidades de receipt_items
  SELECT COALESCE(SUM(ri.quantity), 0)
  INTO v_total_qty
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE ri.product_id = NEW.product_id AND r.store_id = v_store_id AND r.status = 'active';

  -- G4 NUEVO: Sumar costos de service_cost_distributions (servicios recibidos)
  SELECT COALESCE(SUM(scd.distribution_amount), 0)
  INTO v_service_costs
  FROM service_cost_distributions scd
  JOIN received_services rs ON rs.id = scd.service_id
  WHERE scd.product_id = NEW.product_id
    AND rs.store_id = v_store_id
    AND rs.status = 'active';

  -- Calcular WAC: (costo recepciones + costo servicios) / cantidad total
  IF v_total_qty > 0 THEN
    v_current_wac := (v_total_cost + v_service_costs) / v_total_qty;
  ELSE
    v_current_wac := 0;
  END IF;

  UPDATE products
  SET cost_average = v_current_wac, updated_at = NOW()
  WHERE id = NEW.product_id AND store_id = v_store_id;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_product_wac() TO authenticated;
