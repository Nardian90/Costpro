-- DECLARED FINAL STATE (Git) de check_reception_cost_variation
-- fuente: 20260301_control_fallos_harden.sql stmt#15

CREATE OR REPLACE FUNCTION public.check_reception_cost_variation()
RETURNS TRIGGER AS $$
DECLARE
    v_avg_cost NUMERIC;
BEGIN
    SELECT COALESCE(cost_price, 0) INTO v_avg_cost FROM public.products WHERE id = NEW.product_id;

    IF v_avg_cost > 0 AND (NEW.unit_cost > v_avg_cost * 2.0 OR NEW.unit_cost < v_avg_cost * 0.2) THEN
        -- For now we just log a warning in the DB console or metadata
        -- Future: INSERT INTO audit_logs
        RAISE NOTICE 'Critical cost variation for product %: % vs average %', NEW.product_id, NEW.unit_cost, v_avg_cost;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
