-- DECLARED FINAL STATE (Git) de prevent_received_service_edit
-- fuente: 20260809000003_v2_25_g3_trigger_prevent_edit.sql stmt#0

CREATE OR REPLACE FUNCTION public.prevent_received_service_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_paid_amount NUMERIC;
  v_sum_distributions NUMERIC;
BEGIN
  -- 1. Bloquear edicion de servicio voided (excepto RPCs via set_config)
  IF OLD.status = 'voided' AND TG_OP = 'UPDATE' THEN
    IF current_setting('app.is_void_rpc', true) IS DISTINCT FROM 'true'
       AND current_setting('app.is_status_change_rpc', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'ERR_SERVICE_VOIDED: no se puede editar un servicio anulado';
    END IF;
  END IF;

  -- 2. service_number inmutable post-creacion
  IF NEW.service_number IS DISTINCT FROM OLD.service_number THEN
    RAISE EXCEPTION 'ERR_SERVICE_NUMBER_IMMUTABLE: service_number no puede cambiarse post-creacion';
  END IF;

  -- 3. store_id inmutable (cross-tenant protection)
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'ERR_STORE_ID_IMMUTABLE: store_id no puede cambiarse';
  END IF;

  -- 4. total_amount no puede reducirse por debajo de paid_amount
  SELECT COALESCE(paid_amount, 0) INTO v_paid_amount
  FROM received_services WHERE id = OLD.id;
  IF NEW.total_amount < v_paid_amount THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAID: total_amount (%) no puede ser menor que paid_amount (%)',
      NEW.total_amount, v_paid_amount;
  END IF;

  -- 5. total_amount no puede reducirse por debajo de la suma de distribuciones
  SELECT COALESCE(SUM(distribution_amount), 0) INTO v_sum_distributions
  FROM service_cost_distributions WHERE service_id = OLD.id;
  IF NEW.total_amount < v_sum_distributions THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_DISTRIBUTIONS: total_amount (%) no puede ser menor que la suma de distribuciones (%)',
      NEW.total_amount, v_sum_distributions;
  END IF;

  -- 6. service_date no puede back-date fuera del periodo fiscal
  IF NEW.service_date IS DISTINCT FROM OLD.service_date THEN
    PERFORM public.validate_operation_date(NEW.service_date::timestamp with time zone, NEW.store_id);
  END IF;

  RETURN NEW;
END;
$function$
