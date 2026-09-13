-- DECLARED FINAL STATE (Git) de prevent_direct_inventory_modification
-- fuente: 20260802000008_v2_12_47_restore_rpc_execute.sql stmt#2

CREATE OR REPLACE FUNCTION public.prevent_direct_inventory_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 OR current_setting('role', true) = 'postgres' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ERR_DIRECT_INVENTORY_MODIFICATION: El inventario es inmutable. Registra un movimiento en stock_movements para cambiar las cantidades.';
END;
$$
