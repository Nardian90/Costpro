-- DECLARED FINAL STATE (Git) de sync_products_stock_current
-- fuente: 20260802000008_v2_12_47_restore_rpc_execute.sql stmt#1

CREATE OR REPLACE FUNCTION public.sync_products_stock_current()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  UPDATE public.products
  SET stock_current = NEW.quantity
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$
