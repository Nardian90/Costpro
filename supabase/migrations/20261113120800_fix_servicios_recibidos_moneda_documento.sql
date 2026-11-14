-- ══════════════════════════════════════════════════════════════════════
-- FIX §17.1 — Servicios Recibidos en divisa: consistencia de moneda en
-- paid_amount / payment_status / guard de edición.
--
-- Expediente: docs/audits/2026-11-13-cp-fin-partida-doble/
--   INFORME_AUDITORIA_FINAL.md §17.1 (MEDIO-ALTO, pre-existente, fuera de
--   alcance CP-FIN; corrección independiente autorizada por el propietario
--   el 2026-11-13 en rama/PR separados).
--
-- DEFECTO:
--   · update_payment_status (rama 'service'): v_paid = SUM(amount_cup)
--     (CUP) se compara contra v_total = total_amount (divisa del documento)
--     y se guarda en paid_amount → servicios en divisa quedan con
--     paid_amount en CUP y payment_status mal computado.
--   · prevent_received_service_edit (regla 4): NEW.total_amount (divisa) <
--     paid_amount (CUP) → ERR_TOTAL_BELOW_PAID espurio → el documento
--     queda inalterable (ni editar ni cambiar estado; los pagos tampoco).
--   · register_supplier_payment: v_balance = total (divisa) −
--     SUM(amount_cup) (CUP) → el control de overpay mezcla monedas.
--
-- CORRECCIÓN (respeta la moneda original del documento y sus pagos; sin
-- conversiones implícitas CUP↔USD):
--   1. update_payment_status: comparar TODO en la moneda del documento.
--      paid_amount pasa a significar "suma de pagos en la moneda del
--      documento": pagos en la MISMA moneda suman su importe nominal;
--      pagos en OTRA moneda aportan su equivalente CUP reconvertido con la
--      tasa DEL DOCUMENTO (misma fuente de verdad que usa CP-FIN para
--      normalizar: total_cup = total_amount × exchange_rate del doc).
--      Cero conversiones implícitas: la tasa es siempre la del documento.
--   2. prevent_received_service_edit: regla 4 compara en la misma moneda
--      (paid_amount ya queda en moneda del documento).
--   3. register_supplier_payment: balance en moneda del documento; el pago
--      se convierte a la moneda del documento con la tasa del doc para el
--      check de overpay. El importe del pago se conserva SIEMPRE en su
--      moneda original en amount/amount_cup (sin tocar).
--
-- SCOPE (deliberadamente mínimo, sin regresiones):
--   · Rama 'service' de update_payment_status únicamente. Las ramas
--     'receipt' y 'production_order' operan en CUP de punta a punta
--     (receipts/production_orders no tienen columna currency) y quedan
--     intactas byte a byte.
--   · No se modifica: triggers, RLS, políticas, constraints, ni ningún
--     control de integridad. No se tocan datos existentes (la producción
--     tiene 0 servicios en divisa hoy — verificado read-only; los CUP
--     existentes obtienen resultados idénticos porque con currency='CUP'
--     el cálculo nuevo es numéricamente igual al antiguo).
--   · Idempotente: CREATE OR REPLACE + DROP/CREATE IF EXISTS.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. update_payment_status: comparación y paid_amount en moneda del documento ───
CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_ref_type TEXT;
  v_ref_id UUID;
  v_total NUMERIC;
  v_paid NUMERIC;             -- pagos acumulados EN la moneda del documento
  v_paid_service NUMERIC;     -- acumulado para docs en divisa (por moneda de cada pago)
  v_doc_currency TEXT;
  v_doc_rate NUMERIC;
  v_method TEXT;
  v_status TEXT;
  v_doc_status TEXT;
BEGIN
  v_ref_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_type ELSE NEW.ref_type END;
  v_ref_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_id ELSE NEW.ref_id END;

  IF v_ref_type = 'receipt' THEN
    -- BUG #1 FIX (v2.25.1, se conserva): skip if receipt is voided
    SELECT status INTO v_doc_status FROM receipts WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    -- BUG #1 FIX (v2.25.1, se conserva): skip if received_services is voided
    SELECT status INTO v_doc_status FROM received_services WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    -- FIX §17.1: moneda y tasa DEL DOCUMENTO (fuente de verdad, igual que
    -- fin_compute_metrics: total_cup = total_amount × exchange_rate del doc).
    SELECT total_amount, currency, COALESCE(exchange_rate, 1)
      INTO v_total, v_doc_currency, v_doc_rate
    FROM received_services WHERE id = v_ref_id;

    -- FIX §17.1: acumular cada pago en la MONEDA DEL DOCUMENTO:
    --   · pago en la misma moneda → importe nominal (sin conversión);
    --   · pago en otra moneda → su equivalente CUP (amount_cup) dividido
    --     por la tasa del documento (inverso exacto de la normalización;
    --     no introduce ninguna tasa nueva). Docs CUP: todo nominal = CUP.
    SELECT COALESCE(SUM(
           CASE WHEN pt.currency = v_doc_currency THEN pt.amount
                ELSE pt.amount_cup / v_doc_rate
           END), 0)
      INTO v_paid
    FROM payment_transactions pt
    WHERE pt.ref_type = 'service' AND pt.ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type IN ('production_order', 'work') THEN
    SELECT status INTO v_doc_status FROM production_orders WHERE id = v_ref_id;
    IF v_doc_status IN ('cancelled', 'voided') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE production_orders SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ─── 2. prevent_received_service_edit: regla 4 con paid_amount en moneda del documento ───
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

-- ─── 3. register_supplier_payment: overpay check en moneda del documento ───
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
  v_amount_in_doc_currency numeric;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount, currency, COALESCE(exchange_rate, 1)
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total, 'CUP', 1
      INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- MISIÓN POLÍTICA TEMPORAL (2026-10-18): gate canónico para la fecha
  -- financiera del pago. Se conservan las fechas históricas (V2.12.32)
  -- dentro del piso de 6 meses; NUNCA fechas futuras (tope HOY Habana).
  -- v_eff_payment_date = COALESCE(p_payment_date, now()) → NOW() siempre pasa.
  PERFORM public.validate_operation_date(v_eff_payment_date, p_store_id);

  -- Calcular monto en CUP (para payment_transactions.amount_cup — invariante)
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- R3: Validar overpay — FIX §17.1: todo en la MONEDA DEL DOCUMENTO.
  --   · pagado acumulado: pagos en la misma moneda suman nominal; pagos en
  --     otra moneda aportan amount_cup / tasa_del_documento (inverso exacto
  --     de la normalización CP-FIN; ninguna tasa nueva).
  --   · este pago: p_amount si es la misma moneda; si no, su CUP-equivalente
  --     reconvertido con la tasa del doc. El pago se inserta SIEMPRE en su
  --     moneda original (amount/amount_cup sin tocar).
  SELECT COALESCE(SUM(
         CASE WHEN pt.currency = v_doc_currency THEN pt.amount
              ELSE pt.amount_cup / v_doc_rate
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

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- NOTA DE COMPATIBILIDAD (históricos CUP):
--   Con currency='CUP' (100% de los servicios actuales en producción,
--   verificado read-only el 2026-11-13) las tres funciones producen
--   resultados NUMÉRICAMENTE IDÉNTICOS a las versiones anteriores:
--     · v_paid = SUM(amount_cup) con docs CUP (pagos CUP → nominal = CUP;
--       pagos USD → amount_cup/1 = amount_cup) — igual que antes para
--       pagos CUP; para un pago USD a doc CUP antes sumaba 4000 CUP y ahora
--       también 4000 CUP (amount_cup / tasa_doc(1)).
--     · register_supplier_payment: balance idéntico para docs CUP.
--   La única diferencia de comportamiento es para docs en DIVISA, donde
--   antes el resultado era incorrecto (§17.1).
-- ══════════════════════════════════════════════════════════════════════
