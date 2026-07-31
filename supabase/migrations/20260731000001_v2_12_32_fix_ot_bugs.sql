-- ════════════════════════════════════════════════════════════════════════
-- V2.12.32: Fix 3 bugs en módulo de órdenes de producción/servicio
--
-- Bug #1: close_service_order_as_sale falla porque customer_phone no existe
--         en transactions table. Solución: añadir customer_phone, customer_ci,
--         customer_address a transactions.
--
-- Bug #1b: close_service_order_as_sale no refleja el desglose de pagos
--          (cash_amount, transfer_amount, zelle_amount siempre en 0).
--          Solución: calcular desde payment_transactions y setear en la venta.
--
-- Bug #2: register_supplier_payment no soporta fechas históricas (siempre
--         usa NOW() como payment_date). Solución: añadir p_payment_date.
--
-- Bug #3: (se fixea en API route, no en SQL) rate limit demasiado estricto.
-- ════════════════════════════════════════════════════════════════════════

-- ── Bug #1: Añadir columnas customer_* a transactions ──────────────────
-- Estas columnas ya existen en production_orders (customer_name, customer_ci,
-- customer_phone, customer_address). Ahora las añadimos a transactions para
-- que close_service_order_as_sale pueda copiar los datos del cliente al
-- crear la venta. customer_name ya existe (añadida en migration 20260618000001).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS customer_ci TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT;

COMMENT ON COLUMN public.transactions.customer_phone IS 'Teléfono del cliente al momento de la venta. NULL = walk-in';
COMMENT ON COLUMN public.transactions.customer_ci IS 'CI/identificación del cliente al momento de la venta. NULL = walk-in';
COMMENT ON COLUMN public.transactions.customer_address IS 'Dirección del cliente al momento de la venta. NULL = walk-in';

-- ── Bug #1b: Actualizar close_service_order_as_sale ─────────────────────
-- Cambios:
-- 1. Incluir customer_phone, customer_ci, customer_address en el INSERT
-- 2. Calcular cash_amount, transfer_amount, zelle_amount desde payment_transactions
--    para que la venta refleje el desglose real de pagos
-- 3. Setear completed_at = now() (antes solo seteaba created_at)
-- 4. Setear subtotal = budget_total (para consistencia contable)
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(
  p_order_id uuid,
  p_store_id uuid,
  p_seller_id uuid,
  p_payment_method text,
  p_currency text DEFAULT 'CUP',
  p_exchange_rate numeric DEFAULT 1.0,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- V2.12.32: calcular desglose de pagos desde payment_transactions
  -- para que la venta refleje cómo se pagó realmente (cash/transfer/zelle)
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM public.payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  -- Determinar método efectivo: si hay más de un método con monto > 0, es 'mixed'
  v_effective_method := p_payment_method;
  IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
    v_effective_method := 'mixed';
  ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
    v_effective_method := 'mixed';
  ELSIF v_cash_amount > 0 THEN
    v_effective_method := 'cash';
  ELSIF v_transfer_amount > 0 THEN
    v_effective_method := 'transfer';
  ELSIF v_zelle_amount > 0 THEN
    v_effective_method := 'zelle';
  END IF;

  -- V2.12.32: incluir customer_phone, customer_ci, customer_address
  -- + desglose de pagos (cash_amount, transfer_amount, zelle_amount)
  INSERT INTO public.transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at, completed_at,
    customer_name, customer_phone, customer_ci, customer_address,
    subtotal, cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    v_effective_method::public.payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(), now(),
    v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
    v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
  ) RETURNING id INTO v_transaction_id;

  -- Crear item de la venta (servicio prestado)
  INSERT INTO public.transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- Marcar orden como closed y vincular transaction
  UPDATE public.production_orders
    SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id
    WHERE id = p_order_id;

  RETURN v_transaction_id;
END;
$function$;

-- ── Bug #2: Añadir p_payment_date a register_supplier_payment ──────────
-- El RPC anterior siempre usaba NOW() como payment_date (via column default).
-- Ahora acepta p_payment_date opcional (NULL = NOW() para backwards compat).
-- Esto permite registrar pagos con fechas históricas (ej: reconciliación de
-- caja de días anteriores, hot tests con datos reales).

-- DROP old signature (11 params) — necesario porque CREATE OR REPLACE no
-- puede cambiar la lista de parámetros
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
$func$;

-- Permisos para la nueva signature (12 params)
REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz
) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_payment(
  uuid, text, uuid, numeric, text, uuid, text, numeric, text, text, text, timestamptz
) TO service_role;

-- ── Verificación ────────────────────────────────────────────────────────
SELECT
  'transactions columns' as check_name,
  string_agg(column_name, ', ' ORDER BY column_name) as columns
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('customer_name', 'customer_phone', 'customer_ci', 'customer_address')
GROUP BY table_name;
