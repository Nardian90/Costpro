-- DECLARED FINAL STATE (Git) de sync_product_has_movements
-- fuente: 20260802000008_v2_12_47_restore_rpc_execute.sql stmt#9

CREATE OR REPLACE FUNCTION public.sync_product_has_movements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET has_movements = true
    WHERE id = NEW.product_id AND has_movements = false;

    RETURN NEW;
END;
$$
