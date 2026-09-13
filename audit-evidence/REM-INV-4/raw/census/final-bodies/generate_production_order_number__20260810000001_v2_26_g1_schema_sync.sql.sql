-- DECLARED FINAL STATE (Git) de generate_production_order_number
-- fuente: 20260810000001_v2_26_g1_schema_sync.sql stmt#8

CREATE OR REPLACE FUNCTION public.generate_production_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year INT := EXTRACT(YEAR FROM now());
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'OP-' || v_year || '-' || LPAD(nextval('production_order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$
