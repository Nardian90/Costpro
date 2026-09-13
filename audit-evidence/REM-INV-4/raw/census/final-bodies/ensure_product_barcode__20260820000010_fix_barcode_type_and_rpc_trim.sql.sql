-- DECLARED FINAL STATE (Git) de ensure_product_barcode
-- fuente: 20260820000010_fix_barcode_type_and_rpc_trim.sql stmt#0

CREATE OR REPLACE FUNCTION public.ensure_product_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
    NEW.barcode := public.generate_internal_barcode();
    NEW.barcode_type := 'INTERNAL';
  ELSE
    IF NEW.barcode LIKE 'INT%' THEN
      NEW.barcode_type := 'INTERNAL';
    ELSIF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
      NEW.barcode_type := 'EAN13';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
