-- DECLARED FINAL STATE (Git) de calculate_receipt_total_cup
-- fuente: 20260810000020_pr2_migracion_b_schema.sql stmt#0

CREATE OR REPLACE FUNCTION public.calculate_receipt_total_cup(
  p_receipt_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_total numeric;
  v_invalid_count integer;
BEGIN
  -- Verificar que todos los items tengan datos coherentes
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.receipt_items ri
  WHERE ri.receipt_id = p_receipt_id
    AND (
      -- Moneda NULL o no soportada
      ri.moneda_recepcion IS NULL
      OR ri.moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
      -- CUP con tasa != 1
      OR (ri.moneda_recepcion = 'CUP' AND ri.tasa_cambio_recepcion IS DISTINCT FROM 1.0)
      -- FX con tasa NULL o <= 1.5
      OR (ri.moneda_recepcion IN ('USD', 'EUR', 'MLC') AND (
        ri.tasa_cambio_recepcion IS NULL
        OR ri.tasa_cambio_recepcion <= 1.5
      ))
      -- cantidad inválida
      OR ri.quantity IS NULL OR ri.quantity <= 0
      -- unit_cost inválido
      OR ri.unit_cost IS NULL OR ri.unit_cost < 0
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_RECEIPT_DATA: % items con datos inválidos para receipt %',
      v_invalid_count, p_receipt_id;
  END IF;

  SELECT COALESCE(SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion), 0)
    INTO v_total
  FROM public.receipt_items ri
  WHERE ri.receipt_id = p_receipt_id;

  RETURN v_total;
END;
$function$
