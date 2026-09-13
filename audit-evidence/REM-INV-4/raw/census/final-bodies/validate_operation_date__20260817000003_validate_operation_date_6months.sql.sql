-- DECLARED FINAL STATE (Git) de validate_operation_date
-- fuente: 20260817000003_validate_operation_date_6months.sql stmt#0

CREATE OR REPLACE FUNCTION public.validate_operation_date(
  p_new_date TIMESTAMP WITH TIME ZONE,
  p_store_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_today_business DATE;
  v_min_date_business DATE;
  v_max_date_business DATE;
  v_new_date_business DATE;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- PR-4.4E: comparar fechas de NEGOCIO (date-only) en timezone America/Havana
  v_today_business := (NOW() AT TIME ZONE 'America/Havana')::DATE;
  -- CAMBIO: 2 months → 6 months
  v_min_date_business := v_today_business - INTERVAL '6 months';
  v_max_date_business := v_today_business + INTERVAL '1 day';
  v_new_date_business := (p_new_date AT TIME ZONE 'America/Havana')::DATE;

  IF v_new_date_business < v_min_date_business THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior al límite histórico permitido de 6 meses (mínimo: %). No se pueden registrar operaciones con más de 6 meses de antigüedad.',
      to_char(v_new_date_business, 'DD/MM/YYYY'),
      to_char(v_min_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_new_date_business > v_max_date_business THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT: La fecha % es posterior al máximo permitido (hoy + 1 día). No se pueden registrar operaciones con fechas futuras.',
      to_char(v_new_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$
