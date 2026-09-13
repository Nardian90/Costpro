-- DECLARED FINAL STATE (Git) de sync_product_stock
-- fuente: 20260802000008_v2_12_47_restore_rpc_execute.sql stmt#7

CREATE OR REPLACE FUNCTION public.sync_product_stock()
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
    SET stock_current = COALESCE(
        (SELECT sm.balance_after
         FROM public.stock_movements sm
         WHERE sm.product_id = NEW.product_id
         ORDER BY sm.movement_date DESC, sm.created_at DESC
         LIMIT 1),
        0
    )
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$
