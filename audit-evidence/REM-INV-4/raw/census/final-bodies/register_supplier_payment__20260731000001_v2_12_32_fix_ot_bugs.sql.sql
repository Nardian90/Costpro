-- DECLARED FINAL STATE (Git) de register_supplier_payment
-- fuente: 20260731000001_v2_12_32_fix_ot_bugs.sql stmt#6

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
  p_idempotency_key text DEFAULT NULL,
  p_payment_date timestamptz DEFAULT NULL
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
$func$
