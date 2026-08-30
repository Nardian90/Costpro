-- ============================================================================
-- 08-df03-devolution-finance.sql — W6.2 LAB · DF-03 DEVOLUCIÓN ↔ FINANZAS
-- Diseño: W62-03 DF-03 + W62-05 §3. Requiere 01-07 (acumulativo con DF-07).
-- Modelo contable (política aprobada):
--   devolución cash/transfer/zelle → cash_movements(out) +
--     payment_transactions(ref_type='devolution', direction='refund',
--     transaction_id=venta_original, ref_id=devolution_id) — tolerancia 0.
--   devolución store_credit → store_credit_ledger (pasivo visible), caja intacta.
-- Hallazgo de laboratorio (ajuste de contrato necesario, documentado):
--   trg_validate_payment_invariants sumaba TODOS los pagos hacia la venta →
--   un refund con transaction_id=venta superaría el total → se NETEAN los
--   refunds (dirección='refund') en la invariante I1; el resto queda intacto.
-- ============================================================================

-- ─── S1. ref_type + 'devolution' ───
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_ref_type_check
  CHECK (ref_type = ANY (ARRAY['receipt','service','production_order','work','sale','commission','devolution']));

-- ─── S2. Columna direction (additive) ───
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in';
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_direction_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_direction_check
  CHECK (direction IN ('in','refund'));

-- ─── S3. CHECK análoga a sale_ref_check para devolution ───
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_devolution_ref_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_devolution_ref_check
  CHECK ((ref_type <> 'devolution') OR (transaction_id IS NOT NULL AND ref_id IS NOT NULL));

-- ─── S4. store_credit_ledger (pasivo visible, CR-W6-7) ───
CREATE TABLE IF NOT EXISTS public.store_credit_ledger (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              uuid NOT NULL,
  customer_id           uuid NOT NULL,
  amount                numeric NOT NULL CHECK (amount > 0),
  devolution_id         uuid,
  origin_transaction_id uuid,
  idempotency_key       text UNIQUE,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── S5. Invariante I1 enmendar: refunds se NETEAN (hallazgo de laboratorio) ───
CREATE OR REPLACE FUNCTION public.validate_payment_transactions_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $fn$ BEGIN IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'PT007'; END IF; IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1' USING ERRCODE = 'PT003'; END IF; IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1' USING ERRCODE = 'PT004'; END IF; IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP' USING ERRCODE = 'PT005'; END IF; IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0)); PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0)); ELSIF NEW.transaction_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0)); END IF; /* DF-03: los refunds (direction='refund') son contra-asientos de trazabilidad — NO se suman como pago hacia el total del documento */ IF NEW.transaction_id IS NOT NULL AND NEW.direction <> 'refund' THEN DECLARE v_total_amount numeric; v_sum_payments numeric; v_existing_rate numeric; BEGIN SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id; SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id AND direction <> 'refund'; IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL' USING ERRCODE = 'PT001'; END IF; SELECT exchange_rate INTO v_existing_rate FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id AND direction <> 'refund' LIMIT 1; IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES' USING ERRCODE = 'PT006'; END IF; END; END IF; RETURN NEW; END $fn$;

-- ─── S6. create_devolution_v2: tope DF-07 + contra-asiento DF-03 en MISMA TX ───
CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_sold_qty numeric;
  v_devolved_qty numeric;
  v_locked_sale uuid;
  v_session_id uuid;
  v_pt_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing);
    END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- DF-07: LOCK venta original PRIMERO
  IF p_original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original';
  END IF;
  SELECT id INTO v_locked_sale FROM public.transactions
    WHERE id = p_original_transaction_id AND store_id = p_store_id
    FOR UPDATE;
  IF v_locked_sale IS NULL THEN
    RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
  END IF;

  -- DF-07: tope por (venta, producto) DESPUÉS del lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: qty=%', v_qty;
    END IF;

    SELECT COALESCE(SUM(ti.quantity), 0) INTO v_sold_qty
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;

    SELECT COALESCE(SUM(di.quantity), 0) INTO v_devolved_qty
    FROM public.devolution_items di
    JOIN public.devolutions d ON d.id = di.devolution_id
    WHERE d.original_transaction_id = p_original_transaction_id
      AND di.product_id = v_pid
      AND d.status IN ('pending','completed');

    IF v_devolved_qty + v_qty > v_sold_qty THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CAP_EXCEEDED: producto % vendido=% devuelto=% solicitado=% (tope acumulado, lock de venta adquirido)',
        v_pid, v_sold_qty, v_devolved_qty, v_qty;
    END IF;
  END LOOP;

  -- Método permitido
  IF p_payment_method NOT IN ('cash','transfer','zelle','store_credit') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_METHOD: %', p_payment_method;
  END IF;

  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
      p_quantity := v_qty, p_movement_type := 'return',
      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(), p_skip_access_check := TRUE
    );
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  -- ═══ DF-03: CONTRA-ASIENTO FINANCIERO en la MISMA TX ═══
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_AMOUNT_POSITIVE';
  END IF;

  IF p_payment_method IN ('cash','transfer','zelle') THEN
    -- sesión de caja abierta de la tienda (find-or-create para que el out nunca se pierda)
    SELECT id INTO v_session_id FROM public.cash_register_sessions
      WHERE store_id = p_store_id AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO public.cash_register_sessions (store_id, cashier_id, opening_cash, opened_at, status)
      VALUES (p_store_id, v_caller_uid, 0, NOW(), 'open')
      RETURNING id INTO v_session_id;
    END IF;

    -- contra-asiento de caja: out por el total devuelto
    INSERT INTO public.cash_movements (session_id, movement_type, method, amount, reason, store_id)
    VALUES (v_session_id, 'out', p_payment_method::payment_method_enum, v_total,
            'Devolución ' || v_dev_number || ': ' || COALESCE(p_reason,''), p_store_id);

    -- asiento financiero trazable: venta → devolución → reversión
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, direction, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
      v_total, p_payment_method, 'CUP', 1.0,
      NOW(), 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
    ) RETURNING id INTO v_pt_id;

  ELSIF p_payment_method = 'store_credit' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
    END IF;
    -- pasivo visible y auditable; la caja NO se toca (el dinero ya no sale)
    INSERT INTO public.store_credit_ledger
      (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
    VALUES
      (p_store_id, p_customer_id, v_total, v_devolution_id, p_original_transaction_id,
       'dev-' || v_devolution_id::text || '-credit', v_caller_uid);
  END IF;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items),
      'cap_lock_df07', true,
      'financial_contra_entry_df03',
        jsonb_build_object('method', p_payment_method, 'amount', v_total,
          'cash_out', (p_payment_method <> 'store_credit'),
          'idempotency_key', 'dev-' || v_devolution_id::text || '-refund')
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total,
    'financial_effect', CASE WHEN p_payment_method = 'store_credit' THEN 'store_credit_ledger' ELSE 'cash_out_and_refund' END
  );
END $fn$;

\echo '08: DF-03 aplicado — contra-asiento financiero trazable (cash_out+refund / store_credit pasivo); I1 netea refunds'
