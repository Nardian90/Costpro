CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_store_id UUID; v_movement_type TEXT; v_qty NUMERIC; v_unit_cost NUMERIC;
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  v_movement_type := CASE
    WHEN NEW.movement_type IN ('sale', 'void', 'sale_void', 'issue_slip_out') THEN 'out'
    WHEN NEW.movement_type IN ('purchase', 'initial') THEN 'in'
    WHEN NEW.movement_type = 'adjustment' THEN 'adjustment'
    WHEN NEW.movement_type = 'return' THEN 'devolution_in'
    WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
    WHEN NEW.movement_type IN ('transfer', 'transfer_out') THEN 'transfer_out'
    WHEN NEW.movement_type IN ('production_in', 'production_out') THEN 'adjustment'
    WHEN NEW.movement_type = 'purchase_reverse' THEN 'purchase_reverse'
    WHEN NEW.movement_type = 'sale_reverse' THEN 'sale_reverse'
    WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'
    WHEN NEW.movement_type = 'devolution_reverse' THEN 'devolution_out'
    WHEN NEW.movement_type = 'issue_slip_reverse' THEN 'in'
    ELSE 'adjustment'
  END;
  v_qty := ABS(NEW.quantity_change);
  v_unit_cost := COALESCE(NEW.unit_cost, 0);
  INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
  SELECT v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
    p.stock_current, p.cost_average, p.stock_current * p.cost_average,
    'stock_movement', NEW.id, COALESCE(NEW.reference_doc, NEW.movement_type::text), NEW.created_by
  FROM public.products p WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$function$

;
