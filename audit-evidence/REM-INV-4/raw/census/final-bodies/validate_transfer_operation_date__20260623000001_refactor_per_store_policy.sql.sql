-- DECLARED FINAL STATE (Git) de validate_transfer_operation_date
-- fuente: 20260623000001_refactor_per_store_policy.sql stmt#11

CREATE OR REPLACE FUNCTION public.validate_transfer_operation_date(
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_origin_store_id UUID,
  p_destination_store_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_origin TIMESTAMP WITH TIME ZONE;
  v_max_dest TIMESTAMP WITH TIME ZONE;
  v_max_date TIMESTAMP WITH TIME ZONE;
  v_max_date_str TEXT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- MAX de cada tienda involucrada
  SELECT public.get_global_max_operation_date(p_origin_store_id) INTO v_max_origin;
  SELECT public.get_global_max_operation_date(p_destination_store_id) INTO v_max_dest;

  -- El más restrictivo de los dos
  v_max_date := GREATEST(v_max_origin, v_max_dest);

  IF v_max_date IS NOT NULL AND p_new_date < v_max_date THEN
    v_max_date_str := to_char(v_max_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI');
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior a la fecha mínima permitida (%). La transferencia afecta 2 tiendas y debe respetar el MAX de ambas.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI'),
      v_max_date_str
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$
