-- ============================================================================
-- Fase 0.3 — Idempotencia + validación overpay en register_supplier_payment
-- Creado: 2026-07-13
-- Descripción:
--   1. Añade p_idempotency_key a register_supplier_payment para prevenir
--      doble-click (mismo patrón que create_sale).
--   2. Valida que el pago no exceda el saldo pendiente (R3: no overpay).
--   3. Añade columna idempotency_key a payment_transactions.
--
-- R3 confirmada: "No pagar más del saldo" — bloquear server-side.
-- ============================================================================

-- ── 1. Añadir columna idempotency_key a payment_transactions ──
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Índice para búsqueda rápida por idempotency_key
CREATE INDEX IF NOT EXISTS idx_payment_txn_idempotency
  ON public.payment_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Constraint UNIQUE parcial: una misma key no puede tener 2 pagos
-- (NULL se permite múltiples veces — PostgreSQL partial index)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_txn_idempotency
  ON public.payment_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2. Recrear register_supplier_payment con idempotencia + overpay check ──
-- DROP la versión actual con su firma exacta
DROP FUNCTION IF EXISTS public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text
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
  -- FIX-FASE-0.3: nuevos parámetros
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
  -- ── Idempotencia: si ya existe un pago con esta key, devolverlo ──
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- ── Validar que el documento pertenece a la store ──
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost INTO v_doc_store_id, v_total
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount INTO v_doc_store_id, v_total
    FROM public.received_services WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- ── Calcular monto en CUP ──
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- ── R3: Validar que el pago no exceda el saldo pendiente ──
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
  FROM public.payment_transactions
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  v_balance := v_total - v_paid;

  IF v_amount_cup > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_cup, v_balance;
  END IF;

  -- ── Insertar el pago ──
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

-- ── 3. Grants ──
REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text
) TO authenticated, service_role;

-- ── 4. Comment ──
COMMENT ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text
) IS
  'Registra un pago a proveedor. R3: valida que el pago no exceda el saldo pendiente (overpay bloqueado). Idempotencia: si p_idempotency_key ya existe, devuelve el ID del pago previo sin crear duplicado.';
