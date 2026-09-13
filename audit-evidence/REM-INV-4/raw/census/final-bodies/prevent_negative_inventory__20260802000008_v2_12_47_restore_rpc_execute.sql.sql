-- DECLARED FINAL STATE (Git) de prevent_negative_inventory
-- fuente: 20260802000008_v2_12_47_restore_rpc_execute.sql stmt#3

CREATE OR REPLACE FUNCTION public.prevent_negative_inventory()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Stock negativo no permitido | product_id=% | store_id=%', NEW.product_id, NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$
