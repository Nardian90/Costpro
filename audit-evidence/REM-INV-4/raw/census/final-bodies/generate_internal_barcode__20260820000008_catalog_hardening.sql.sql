-- DECLARED FINAL STATE (Git) de generate_internal_barcode
-- fuente: 20260820000008_catalog_hardening.sql stmt#3

CREATE OR REPLACE FUNCTION public.generate_internal_barcode()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_barcode text;
  v_seq bigint;
BEGIN
  -- Generar barcode interno: formato "INT" + secuencial de 12 dígitos
  -- Esto NO es un EAN/UPC oficial, es un código interno único
  -- Formato: INT000000000001, INT000000000002, etc.
  SELECT nextval('public.internal_barcode_seq') INTO v_seq;
  v_barcode := 'INT' || lpad(v_seq::text, 12, '0');
  RETURN v_barcode;
END;
$$
