-- ============================================================================
-- CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — Migración 3 (20261126120200).
--
-- FIX del bug latente hallado al ejecutar la remediación del caso
-- F-23112026 (Pixelarte, misión FASE 3): reverse_supplier_payment es
-- INOPERANTE sobre servicios voided.
--
-- Cadena del fallo (reproducido en producción 2026-11-26, sin efectos por
-- ser transaccional):
--   reverse_supplier_payment inserta la contra-fila → trigger
--   update_payment_status netea y hace UPDATE del documento padre
--   (paid_amount/payment_status) → trg_prevent_received_service_edit
--   rechaza el UPDATE de un servicio voided (ERR_SERVICE_VOIDED) salvo que
--   exista app.is_void_rpc / app.is_status_change_rpc — configs que NI el
--   RPC de reversión NI el motor de pagos fijan.
--
-- El trigger de inmutabilidad protege los campos DE NEGOCIO de un documento
-- anulado; el neteo de los campos de seguimiento de pago por el MOTOR DE
-- PAGOS (update_payment_status, invocado por cualquier contra-fila) no es
-- una edición de negocio: es exactamente lo que la misión exige («resolver
-- la aplicación y el estado financiero del pago mediante el procedimiento
-- oficial de reversión»).
--
-- Corrección quirúrgica: un UPDATE sobre un servicio voided sin configs de
-- RPC se PERMITE solo si el estado no cambia y SI NINGÚN campo de negocio
-- se modifica — únicamente pueden variar los campos de seguimiento de pago
-- (payment_status, paid_amount, paid_at, payment_method, updated_at). Cual
--quier otra variación sigue levantando ERR_SERVICE_VOIDED.
--
-- Nota: las recepciones NO tienen trigger de inmutabilidad equivalente; la
-- reversión de pagos sobre recepciones voided/reversed ya funciona.
--
-- Idempotente: CREATE OR REPLACE. Reversible: reemitir el cuerpo previo
-- (20261113120800).
-- ============================================================================

BEGIN;

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
      -- CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001: excepción
      -- QUIRÚRGICA para el MOTOR DE PAGOS. Sin configs de RPC, un UPDATE sobre
      -- un servicio voided solo se admite si NO cambia el estado y NO toca
      -- ningún campo de negocio — únicamente el neteo de los campos de
      -- seguimiento de pago (que update_payment_status realiza al procesar
      -- contra-filas de reverse_supplier_payment). Cualquier otra variación
      -- sigue siendo inmutable (auditoría del documento anulado intacta).
      IF NEW.status IS DISTINCT FROM OLD.status
         OR NEW.id IS DISTINCT FROM OLD.id
         OR NEW.store_id IS DISTINCT FROM OLD.store_id
         OR NEW.service_number IS DISTINCT FROM OLD.service_number
         OR NEW.service_date IS DISTINCT FROM OLD.service_date
         OR NEW.service_type_id IS DISTINCT FROM OLD.service_type_id
         OR NEW.service_type_name IS DISTINCT FROM OLD.service_type_name
         OR NEW.supplier IS DISTINCT FROM OLD.supplier
         OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
         OR NEW.supplier_master_party_id IS DISTINCT FROM OLD.supplier_master_party_id
         OR NEW.supplier_code IS DISTINCT FROM OLD.supplier_code
         OR NEW.supplier_tax_id IS DISTINCT FROM OLD.supplier_tax_id
         OR NEW.supplier_phone IS DISTINCT FROM OLD.supplier_phone
         OR NEW.supplier_address IS DISTINCT FROM OLD.supplier_address
         OR NEW.reference_doc IS DISTINCT FROM OLD.reference_doc
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
         OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
         OR NEW.observations IS DISTINCT FROM OLD.observations
         OR NEW.distribution_method IS DISTINCT FROM OLD.distribution_method
         OR NEW.due_date IS DISTINCT FROM OLD.due_date
         OR NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days
         OR NEW.created_by IS DISTINCT FROM OLD.created_by
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'ERR_SERVICE_VOIDED: no se puede editar un servicio anulado (solo el motor de pagos netea sus campos de pago)';
      END IF;
      -- Solo cambian payment_status / payment_method / paid_amount / paid_at /
      -- updated_at → neteo del motor de pagos: PERMITIR (continúa las demás
      -- validaciones estructurales, que con total_amount intacto pasan).
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
  --    FIX §17.1: tras la corrección de update_payment_status, paid_amount
  --    está EN LA MONEDA DEL DOCUMENTO → la comparación es homogénea.
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
$function$;

COMMIT;
