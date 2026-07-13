-- ============================================================================
-- Fix C2+C3 — Restaurar production_order/work en trigger y RPC
-- Creado: 2026-07-13
-- Descripción: La Fase 0.3 hizo DROP de register_supplier_payment perdiendo
-- el soporte para production_order/work. Esta migración restaura las ramas
-- en el trigger update_payment_status y en el RPC.
-- ============================================================================

-- ── 1. Actualizar trigger para cubrir production_order y work ──
CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_type TEXT := NEW.ref_type;
  v_ref_id UUID := NEW.ref_id;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
BEGIN
  IF v_ref_type = 'receipt' THEN
    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
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
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
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
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type IN ('production_order', 'work') THEN
    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
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
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE production_orders SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Recrear register_supplier_payment con soporte para production_order/work ──
DROP FUNCTION IF EXISTS public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text
);

CREATE OR REPLACE FUNCTION public.register_supplier_payment(
  p_store_id uuid,
  p_ref_type text,
  p_ref_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_paid_by uuid,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $func$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
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
    SELECT store_id, total_cost INTO v_doc_store_id, v_total
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount INTO v_doc_store_id, v_total
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total INTO v_doc_store_id, v_total
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

  -- Calcular monto en CUP
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- R3: Validar overpay
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
  FROM public.payment_transactions
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  v_balance := v_total - v_paid;

  IF v_amount_cup > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_cup, v_balance;
  END IF;

  -- Insertar pago
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by, p_idempotency_key
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text
) TO authenticated, service_role;
