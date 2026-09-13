-- DECLARED FINAL STATE (Git) de alert_low_stock
-- fuente: 20260802000008_v2_12_47_restore_rpc_execute.sql stmt#4

CREATE OR REPLACE FUNCTION public.alert_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <= COALESCE(NEW.low_stock_threshold, 10) THEN
    INSERT INTO public.business_events(event_type, entity_id, payload, created_at)
    VALUES (
      'low_stock_alert',
      NEW.product_id,
      jsonb_build_object(
        'store_id', NEW.store_id,
        'quantity', NEW.quantity,
        'threshold', NEW.low_stock_threshold
      ),
      timezone('utc', now())
    );
  END IF;
  RETURN NEW;
END;
$$
