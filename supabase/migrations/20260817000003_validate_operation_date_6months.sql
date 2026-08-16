-- ============================================================================
-- FIX: validate_operation_date — ampliar límite histórico de 2 a 6 meses
-- ============================================================================
-- Cambio solicitado: el límite de backdate para operaciones (recepciones,
-- ventas, transferencias, ajustes) pasa de 2 meses a 6 meses.
--
-- Esto permite importar datos históricos con hasta 6 meses de antigüedad.
--
-- Función afectada: validate_operation_date(timestamp, uuid)
-- Llamada por: register_reception, create_sale, perform_inventory_adjustment,
--              validate_transfer_operation_date, etc.
-- ============================================================================

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
$function$;

-- Verify
SELECT 'validate_operation_date' as function_updated,
       (SELECT pg_get_functiondef('public.validate_operation_date(timestamp with time zone, uuid)'::regprocedure) IS NOT NULL) as exists;
