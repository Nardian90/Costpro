-- ============================================================================
-- CP-BRA-REMEDIATION-001 (20261126140000) — Motor de pagos: R-01 (rama OT
-- del trigger) y R-14 (guard de período fiscal en la reversión).
-- PR: fix/cpbra-r01-r14.
--
-- R-01 (CRÍTICO, FIN-002/REP-001): la reemisión 20261124120000 de
--   update_payment_status PERDIÓ la rama `production_order|work` que existía
--   desde 20261113120800 (evidencia RISK-REGISTER R-01). Efecto: todo pago
--   nuevo a una OT deja production_orders.paid_amount/payment_status
--   desactualizados; CxC lee esas columnas → saldos divergentes. Forense
--   2026-11-25: 18 OTs pagadas hoy siguen coherentes SOLO porque sus pagos
--   son anteriores a la reemisión; el defecto afecta a TODO pago futuro.
--   Corrección: reemisión íntegra del trigger con las TRES ramas
--   (receipt|service|production_order|work), la rama OT restaurada CON neteo
--   de contra-filas (direction='reversal' resta — consistente con §2 de
--   20261124120000, que la versión 20261113120800 no tenía) y con el guard
--   de la OT anulada (no tocar saldos de documentos voided).
--
-- R-14 (CRÍTICO, FIN-008/004): reverse_supplier_payment permite revertir
--   pagos cuyo período fiscal ya está cerrado/locked — el efecto cae en el
--   turno vigente y manipula el corte (RISK-REGISTER R-14). Corrección:
--   guard de período (patrón ERR_FISCAL_PERIOD_CLOSED de 20260810000003
--   v2_19_3, extendido a la reversión de pagos) con excepción administrativa
--   auditada (p_allow_closed_period + is_admin_check + motivo obligatorio,
--   patrón ERR_ADMIN_ONLY de los locks fiscales).
--
-- Además (R-01 colateral, misión §Fase3.D — protección en capa autoritativa):
--   register_supplier_payment gana el gate de estado para OT (voided →
--   ERR_ORDER_NOT_PAYABLE) y el lock FOR UPDATE que ya tenían receipt|service
--   (protección frente a concurrencia). Se mantiene permitido pagar OTs en
--   draft: es la realidad operativa vigente (34 pagos históricos en draft,
--   forense 2026-11-25); restringirlo es decisión del propietario, no de esta
--   remediación.
--
-- Idempotente (CREATE OR REPLACE / DROP IF EXISTS + CREATE, guards, ACLs
-- re-declaradas — convención PUR-004). Sin cambios de datos históricos: al
-- aplicar, los saldos OT existentes ya son coherentes (forense R-01); el
-- trigger recomputará SIEMPRE que se inserte/actualice/elimine cualquier fila
-- de pago futura. Aditivo y fail-closed: ninguna vía pierde controles.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- §1. update_payment_status — reemisión íntegra con las TRES ramas.
--    Fuente: 20261124120000 §2 (receipt|service con neteo, verbatim) +
--    rama OT restaurada de 20261113120800 (líneas 127-145) MEJORADA con
--    neteo de contra-filas y lectura COALESCE(NEW,OLD) para que DELETE
--    también recompute (integridad del saldo frente a cualquier writer).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_type TEXT := COALESCE(NEW.ref_type, OLD.ref_type);
  v_ref_id UUID := COALESCE(NEW.ref_id, OLD.ref_id);
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
  v_doc_status TEXT;
BEGIN
  IF v_ref_type = 'receipt' THEN
    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    -- CP-OPS-ENERVIDA: las contra-filas (direction='reversal') RESTAN del
    -- saldo pagado — la obligación queda restablecida por el importe revertido.
    SELECT COALESCE(SUM(
             CASE WHEN COALESCE(direction, 'in') = 'reversal' THEN -amount_cup
                  ELSE amount_cup END), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'receipt' AND ref_id = v_ref_id
         AND COALESCE(direction, 'in') <> 'reversal'
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(
             CASE WHEN COALESCE(direction, 'in') = 'reversal' THEN -amount_cup
                  ELSE amount_cup END), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'service' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'service' AND ref_id = v_ref_id
         AND COALESCE(direction, 'in') <> 'reversal'
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type IN ('production_order', 'work') THEN
    -- R-01 (CP-BRA-REMEDIATION-001): rama restaurada. La OT anulada no
    -- actualiza saldos (semántica de 20261113120800 para cancelled|voided;
    -- 'cancelled' no existe en el CHECK vigente, solo 'voided').
    SELECT status, budget_total INTO v_doc_status, v_total
    FROM production_orders WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    -- Neteo de contra-filas: misma semántica que receipt|service (§2 de
    -- 20261124120000). Los pagos OT no tienen hoy vía de reversión
    -- (FIN-013), pero el neteo hace la rama correcta por construcción.
    SELECT COALESCE(SUM(
             CASE WHEN COALESCE(direction, 'in') = 'reversal' THEN -amount_cup
                  ELSE amount_cup END), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id
         AND COALESCE(direction, 'in') <> 'reversal'
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE production_orders SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_payment_status ON payment_transactions;
CREATE TRIGGER trg_update_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_payment_status();

COMMENT ON FUNCTION public.update_payment_status() IS
  'CP-BRA-REMEDIATION-001 §1: saldo pagado NETEO contra-filas y cubre las TRES familias de documento (receipt|service|production_order|work). Rama OT restaurada (perdida en 20261124120000 — R-01).';

-- ---------------------------------------------------------------------------
-- §2. register_supplier_payment — reemisión íntegra de 20261124120000 §5
--    con DOS cambios localizados en la rama OT: lock FOR UPDATE + estado.
--    Firma y resto del contrato intactos (verbatim).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_doc_currency text;
  v_doc_rate numeric;
  v_doc_status text;
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
  v_rate numeric := p_exchange_rate;
  v_store_rate numeric;
BEGIN
  -- ADN-009 (F2/§4): BLOQUEO COMPARTIDO del documento SIEMPRE primero.
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1, status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.receipts WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1), status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.received_services WHERE id = p_ref_id FOR UPDATE;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    -- R-01 (CP-BRA-REMEDIATION-001): lock + estado — igual que receipt|service.
    -- El documento OT se sigue tratando como CUP/tasa 1 (contrato vigente del
    -- motor; alignarlo a budget_currency es decisión de negocio posterior).
    SELECT store_id, budget_total, 'CUP', 1, status
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status
    FROM public.production_orders WHERE id = p_ref_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  IF p_ref_type = 'receipt' AND COALESCE(v_doc_status, 'active') IN ('voided', 'reversed') THEN
    RAISE EXCEPTION
      'ERR_RECEIPT_NOT_PAYABLE: la recepción está % y no admite pagos nuevos',
      v_doc_status;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  IF p_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
    RAISE EXCEPTION 'Moneda de pago no soportada: %', p_currency;
  END IF;
  IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;
  IF p_payment_method NOT IN ('cash', 'transfer', 'external_transfer') THEN
    RAISE EXCEPTION 'Medio de pago no soportado: %', p_payment_method;
  END IF;

  IF p_payment_method = 'external_transfer' AND p_currency NOT IN ('USD', 'EUR') THEN
    RAISE EXCEPTION
      'ERR_COMBINACION_NO_SOPORTADA: Transf. Exterior (external_transfer) es un riel de divisa (USD/EUR); combinación con % no soportada',
      p_currency;
  END IF;

  IF p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active' THEN
    RAISE EXCEPTION
      'ERR_SERVICE_NOT_ACTIVE: solo un servicio ACTIVO admite pagos (estado actual: %)',
      v_doc_status;
  END IF;

  -- R-01 (CP-BRA-REMEDIATION-001): gate de estado de la OT — una orden
  -- anulada no admite pagos nuevos (fail-closed). Draft sigue permitido:
  -- es la realidad operativa (anticipos sobre órdenes en elaboración).
  IF p_ref_type IN ('production_order', 'work') AND COALESCE(v_doc_status, 'draft') = 'voided' THEN
    RAISE EXCEPTION
      'ERR_ORDER_NOT_PAYABLE: la orden de trabajo está voided y no admite pagos nuevos (estado actual: %)',
      v_doc_status;
  END IF;

  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  IF p_currency <> 'CUP' THEN
    IF coalesce(v_rate, 0) <= 1 THEN
      SELECT rate INTO v_store_rate
      FROM public.store_exchange_rates
      WHERE store_id = p_store_id AND currency = p_currency
      ORDER BY updated_at DESC LIMIT 1;
      IF coalesce(v_store_rate, 0) > 1 THEN
        v_rate := v_store_rate;
      ELSE
        RAISE EXCEPTION
          'ERR_TASA_NO_DISPONIBLE: el pago en % requiere tasa de conversión (> 1). Configúrela en Tasas o envíela con el pago.',
          p_currency;
      END IF;
    END IF;
  ELSE
    v_rate := 1;
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE round(p_amount * v_rate, 2)
  END;

  -- R3: overpay en la MONEDA DEL DOCUMENTO. CP-OPS-ENERVIDA: el saldo pagado
  -- NETEA las contra-filas (direction='reversal' resta) — una obligación con
  -- pago revertido vuelve a admitir pagos por el importe restablecido.
  SELECT COALESCE(SUM(
         CASE WHEN COALESCE(pt.direction, 'in') = 'reversal' THEN
                -CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                      ELSE pt.amount_cup / v_doc_rate END
              ELSE
                CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                     ELSE pt.amount_cup / v_doc_rate END
         END), 0) INTO v_paid
  FROM public.payment_transactions pt
  WHERE pt.ref_type = p_ref_type AND pt.ref_id = p_ref_id;

  v_amount_in_doc_currency := CASE
    WHEN p_currency = v_doc_currency THEN p_amount
    ELSE v_amount_cup / v_doc_rate
  END;

  v_balance := v_total - v_paid;
  IF v_amount_in_doc_currency > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_in_doc_currency, v_balance;
  END IF;

  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, v_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- §3. reverse_supplier_payment — guard de período fiscal (R-14).
--    Nueva firma con p_allow_closed_period (excepción administrativa).
--    El overload de 4 args se ELIMINA (DROP) para que no quede una vía
--    antigua sin el guard (lección CREATE-OR-REPLACE de PUR-004/ADN-009).
--    Resto del contrato: reemisión íntegra de 20261124120000 §4.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.reverse_supplier_payment(uuid, text, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.reverse_supplier_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_operation_date timestamptz DEFAULT NULL,
  p_allow_closed_period boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_orig record;
  v_reversal_id uuid;
  v_existing_reversal_id uuid;
  v_doctype text;
  v_parent_status text;
  v_parent_number text;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_eff_date timestamptz := COALESCE(p_operation_date, NOW());
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_fc record;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('revpay:' || p_payment_id::text));

  SELECT * INTO v_orig FROM public.payment_transactions
  WHERE id = p_payment_id FOR UPDATE;
  IF v_orig.id IS NULL THEN
    RAISE EXCEPTION 'ERR_PAYMENT_NOT_FOUND: %', p_payment_id;
  END IF;
  IF v_orig.ref_type NOT IN ('receipt', 'service') THEN
    RAISE EXCEPTION 'ERR_REVERSAL_NOT_SUPPORTED: ref_type % (solo receipt|service)', v_orig.ref_type;
  END IF;
  IF COALESCE(v_orig.direction, 'in') <> 'in' THEN
    RAISE EXCEPTION 'ERR_PAYMENT_NOT_REVERSIBLE: la fila ya es una contra-fila (direction=%)', v_orig.direction;
  END IF;

  -- Idempotencia: una sola reversión por pago original (índice único §1).
  SELECT id INTO v_existing_reversal_id
  FROM public.payment_transactions
  WHERE reverses_payment_id = p_payment_id
  LIMIT 1;
  IF v_existing_reversal_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'idempotent',
      'reversal_payment_id', v_existing_reversal_id,
      'original_payment_id', p_payment_id
    );
  END IF;

  IF NOT public.has_store_access_as(v_caller_uid, v_orig.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(v_eff_date, v_orig.store_id);

  -- R-14 (CP-BRA-REMEDIATION-001): guard de período fiscal cerrado/locked.
  -- Si el pago ORIGINAL cayó en un cierre fiscal confirmado, revertirlo
  -- reabre historia financiera: el compensatorio caería en el turno vigente
  -- (FIN-008). Bloqueado salvo excepción administrativa auditada
  -- (p_allow_closed_period + admin + motivo).
  SELECT fc.period_year, fc.period_month, fc.status INTO v_fc
  FROM public.fiscal_closings fc
  WHERE fc.store_id = v_orig.store_id
    AND fc.status IN ('closed', 'locked')
    AND v_orig.payment_date >= make_date(fc.period_year, fc.period_month, 1)
    AND v_orig.payment_date < make_date(fc.period_year, fc.period_month, 1) + interval '1 month'
  LIMIT 1;
  IF v_fc.period_year IS NOT NULL THEN
    IF NOT (p_allow_closed_period
            AND public.is_admin_check(v_caller_uid)
            AND v_reason <> '') THEN
      RAISE EXCEPTION
        'ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD: el pago % (fecha %) cayó en el período fiscal %-% en estado % — su reversión reabriría un cierre histórico. Requiere excepción administrativa explícita (p_allow_closed_period + motivo) autorizada por el propietario.',
        p_payment_id, v_orig.payment_date, v_fc.period_year, v_fc.period_month, v_fc.status;
    END IF;
    INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
    VALUES (v_caller_uid, v_orig.store_id, 'PAYMENT_REVERSED_CLOSED_PERIOD', 'payment_transactions', p_payment_id,
      jsonb_build_object(
        'original_payment_id', p_payment_id,
        'period_year', v_fc.period_year,
        'period_month', v_fc.period_month,
        'fiscal_closing_status', v_fc.status,
        'payment_date', v_orig.payment_date,
        'reason', v_reason,
        'authorized_by', 'admin_exception'
      ));
  END IF;

  -- Documento padre: SOLO informativo/doctype — la reversión del pago NO
  -- anula el documento (misión §5: no confundir anular pago con anular
  -- recepción). Se admite también sobre padres ya anulados (limpieza de
  -- anomalías históricas: pagos huérfanos de documentos anulados).
  IF v_orig.ref_type = 'receipt' THEN
    v_doctype := 'RECEPCION';
    SELECT status, COALESCE(document_number, reference_doc) INTO v_parent_status, v_parent_number
    FROM public.receipts WHERE id = v_orig.ref_id;
  ELSE
    v_doctype := 'SERVICIO_RECIBIDO';
    SELECT status, service_number INTO v_parent_status, v_parent_number
    FROM public.received_services WHERE id = v_orig.ref_id;
  END IF;

  -- Contra-fila: MISMO importe/medio/moneda/tasa del original, fecha de la
  -- reversión, usuario que la ejecuta, motivo trazable y clave idempotente.
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date, direction, reverses_payment_id
  ) VALUES (
    v_orig.store_id, v_orig.ref_type, v_orig.ref_id, v_orig.amount, v_orig.payment_method,
    v_orig.currency, v_orig.exchange_rate,
    'Reversión de pago' || CASE WHEN COALESCE(v_orig.reference, '') <> '' THEN ' · ' || v_orig.reference ELSE '' END,
    CASE
      WHEN v_reason <> '' THEN 'Reversión de pago ' || p_payment_id::text || ' — ' || v_reason
      ELSE 'Reversión de pago ' || p_payment_id::text
    END,
    v_caller_uid,
    'reversal:' || p_payment_id::text,
    v_eff_date,
    'reversal',
    p_payment_id
  ) RETURNING id INTO v_reversal_id;

  -- Asiento compensatorio del 'pago' original (nunca UPDATE del histórico).
  PERFORM public.fin_post_payment_annulment(v_doctype, v_orig.ref_id, p_payment_id);

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_orig.store_id, 'PAYMENT_REVERSED', 'payment_transactions', v_reversal_id,
    jsonb_build_object(
      'original_payment_id', p_payment_id,
      'ref_type', v_orig.ref_type,
      'ref_id', v_orig.ref_id,
      'document_number', v_parent_number,
      'amount', v_orig.amount,
      'currency', v_orig.currency,
      'amount_cup', v_orig.amount_cup,
      'payment_method', v_orig.payment_method,
      'reason', NULLIF(v_reason, ''),
      'parent_status_at_reversal', v_parent_status,
      'operation_date', v_eff_date
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'reversal_payment_id', v_reversal_id,
    'original_payment_id', p_payment_id,
    'parent_status', v_parent_status
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz, boolean) TO service_role;

COMMENT ON FUNCTION public.reverse_supplier_payment(uuid, text, uuid, timestamptz, boolean) IS
  'CP-OPS-ENERVIDA §5 + CP-BRA-REMEDIATION-001 §3 (R-14): anula un PAGO de recepción/servicio con fila contraria + asiento compensatorio. Guard de período fiscal cerrado/locked con excepción administrativa auditada. El documento queda intacto y su obligación restablecida. Idempotente por (reverses_payment_id) e idempotency_key.';

COMMIT;
