-- ============================================================================
-- PR-4.4I v2.2.2-R7.2.1 — payment_transactions hardening DEFINITIVO
--
-- Cambios:
--   1. transaction_id (FK ON DELETE RESTRICT)
--   2. NOT NULL constraints (incluido amount_cup GENERATED)
--   3. CHECK constraints (ref_type con commission, currency con MLC, sale-ref)
--   4. Trigger BEFORE INSERT/UPDATE/DELETE (SECURITY INVOKER, advisory lock, I1a+I9-TXN)
--   5. Trigger BEFORE UPDATE transactions (I-TOTAL-CONTROL via current_user)
--   6. RPC adjust_total_amount (SECURITY DEFINER, owner = costpro_transaction_adjuster)
--   7. Rol dedicado costpro_transaction_adjuster (NOLOGIN NOINHERIT)
--   8. Comments de contrato contable
-- ============================================================================

-- ─── PREFLIGHT ESTRUCTURAL OBLIGATORIO ──────────────────────────────────
DO $$
DECLARE
  v_null_count int; v_bad_ref_type int; v_bad_currency int;
  v_bad_method int; v_i3_i4_violations int; v_i9_ref_violations int;
BEGIN
  SELECT COUNT(*) INTO v_null_count FROM public.payment_transactions
    WHERE amount IS NULL OR currency IS NULL OR exchange_rate IS NULL
       OR payment_method IS NULL OR amount_cup IS NULL;
  IF v_null_count > 0 THEN RAISE EXCEPTION 'PREFLIGHT NULLs: %', v_null_count; END IF;

  SELECT COUNT(*) INTO v_bad_ref_type FROM public.payment_transactions
    WHERE ref_type NOT IN ('receipt', 'service', 'production_order', 'work', 'sale', 'commission');
  IF v_bad_ref_type > 0 THEN RAISE EXCEPTION 'PREFLIGHT ref_type: %', v_bad_ref_type; END IF;

  SELECT COUNT(*) INTO v_bad_currency FROM public.payment_transactions
    WHERE currency NOT IN ('CUP', 'USD', 'EUR', 'MLC');
  IF v_bad_currency > 0 THEN RAISE EXCEPTION 'PREFLIGHT currency: %', v_bad_currency; END IF;

  SELECT COUNT(*) INTO v_bad_method FROM public.payment_transactions
    WHERE payment_method NOT IN ('cash', 'transfer', 'zelle');
  IF v_bad_method > 0 THEN RAISE NOTICE 'PREFLIGHT method (non-standard values): %', v_bad_method; END IF;

  SELECT COUNT(*) INTO v_i3_i4_violations FROM public.payment_transactions
    WHERE (currency = 'CUP' AND exchange_rate != 1)
       OR (currency != 'CUP' AND exchange_rate <= 1);
  IF v_i3_i4_violations > 0 THEN RAISE EXCEPTION 'PREFLIGHT I3/I4: %', v_i3_i4_violations; END IF;

  WITH rg AS (
    SELECT ref_type, ref_id, payment_method, currency, COUNT(DISTINCT exchange_rate) AS rc
    FROM public.payment_transactions GROUP BY ref_type, ref_id, payment_method, currency
  )
  SELECT COUNT(*) INTO v_i9_ref_violations FROM rg WHERE rc > 1;
  IF v_i9_ref_violations > 0 THEN
    RAISE NOTICE 'I9-REF violations (informational): %', v_i9_ref_violations;
  END IF;
END $$;

-- ─── 1. Rol dedicado NOLOGIN NOINHERIT ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'costpro_transaction_adjuster') THEN
    CREATE ROLE costpro_transaction_adjuster NOLOGIN NOINHERIT;
    RAISE NOTICE 'Created role costpro_transaction_adjuster (NOLOGIN NOINHERIT)';
  ELSE
    ALTER ROLE costpro_transaction_adjuster NOLOGIN NOINHERIT;
    RAISE NOTICE 'Role costpro_transaction_adjuster ensured NOLOGIN NOINHERIT';
  END IF;
END $$;

-- ─── 2. transaction_id con ON DELETE RESTRICT explícito ─────────────────
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS transaction_id UUID;

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_transaction_id_fkey;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_transaction_id_fkey
  FOREIGN KEY (transaction_id)
  REFERENCES public.transactions(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_id
  ON public.payment_transactions(transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ─── 3. NOT NULL constraints ────────────────────────────────────────────
ALTER TABLE public.payment_transactions ALTER COLUMN amount SET NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN currency SET NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN exchange_rate SET NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN payment_method SET NOT NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN amount_cup SET NOT NULL;

-- ─── 4. CHECK constraints ───────────────────────────────────────────────
ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_ref_type_check
  CHECK (ref_type IN ('receipt', 'service', 'production_order', 'work', 'sale', 'commission'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_currency_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_currency_check
  CHECK (currency IN ('CUP', 'USD', 'EUR', 'MLC'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_sale_ref_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_sale_ref_check
  CHECK (
    ref_type != 'sale'
    OR (transaction_id IS NOT NULL AND ref_id = transaction_id)
  );

-- ─── 5. Trigger BEFORE INSERT/UPDATE/DELETE en payment_transactions ─────
CREATE OR REPLACE FUNCTION public.validate_payment_transactions_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_existing_rate numeric;
  v_lock_old bigint;
  v_lock_new bigint;
  v_total_amount numeric;
  v_sum_payments numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN: payment_transactions rows cannot be deleted. Use reversal/void flow.'
      USING ERRCODE = 'PT007';
  END IF;

  IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN
    RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1: currency=CUP requires exchange_rate=1, got %', NEW.exchange_rate
      USING ERRCODE = 'PT003';
  END IF;

  IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN
    RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1: currency=% requires exchange_rate > 1, got %', NEW.currency, NEW.exchange_rate
      USING ERRCODE = 'PT004';
  END IF;

  IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN
    RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP: payment_method=zelle requires currency in (USD, EUR, MLC). Got CUP.'
      USING ERRCODE = 'PT005';
  END IF;

  -- I1a + I9-TXN con advisory lock
  IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN
    v_lock_old := hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0);
    v_lock_new := hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0);
    IF v_lock_old < v_lock_new THEN
      PERFORM pg_advisory_xact_lock(v_lock_old);
      PERFORM pg_advisory_xact_lock(v_lock_new);
    ELSIF v_lock_old > v_lock_new THEN
      PERFORM pg_advisory_xact_lock(v_lock_new);
      PERFORM pg_advisory_xact_lock(v_lock_old);
    ELSE
      PERFORM pg_advisory_xact_lock(v_lock_new);
    END IF;
  ELSIF NEW.transaction_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0));
  END IF;

  IF NEW.transaction_id IS NOT NULL THEN
    SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id;

    IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL: existing=% + new=% > total_amount=%', v_sum_payments, NEW.amount_cup, v_total_amount
        USING ERRCODE = 'PT001';
    END IF;

    SELECT exchange_rate INTO v_existing_rate
    FROM public.payment_transactions
    WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id
    LIMIT 1;

    IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN
      RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES: transaction_id=% has %/% with rate=%, cannot add rate=%',
        NEW.transaction_id, NEW.payment_method, NEW.currency, v_existing_rate, NEW.exchange_rate
        USING ERRCODE = 'PT006';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_payment_invariants ON public.payment_transactions;
CREATE TRIGGER trg_validate_payment_invariants
  BEFORE INSERT OR UPDATE OR DELETE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_transactions_invariants();

-- ─── 6. Trigger BEFORE UPDATE en transactions (I-TOTAL-CONTROL) ─────────
CREATE OR REPLACE FUNCTION public.protect_transactions_total_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    IF current_user <> 'costpro_transaction_adjuster' THEN
      RAISE EXCEPTION 'ERR_TOTAL_AMOUNT_IMMUTABLE: transactions.total_amount cannot be modified directly (current_user=%). Use adjust_total_amount() RPC.',
        current_user
        USING ERRCODE = 'PT008';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_transactions_total_amount ON public.transactions;
CREATE TRIGGER trg_protect_transactions_total_amount
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_transactions_total_amount();

-- ─── 7. RPC adjust_total_amount (SECURITY DEFINER) ─────────────────────
CREATE OR REPLACE FUNCTION public.adjust_total_amount(
  p_transaction_id uuid,
  p_new_total numeric,
  p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_actor uuid;
  v_old_total numeric;
  v_store_id uuid;
  v_paid_total numeric;
  v_lock_key bigint;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: p_reason cannot be empty' USING ERRCODE = 'PT013';
  END IF;

  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_TOTAL: p_new_total must be >= 0 and non-null, got %', p_new_total
      USING ERRCODE = 'PT012';
  END IF;

  v_lock_key := hashtextextended(p_transaction_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT total_amount, store_id
    INTO v_old_total, v_store_id
  FROM public.transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016';
  END IF;

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total
  FROM public.payment_transactions
  WHERE transaction_id = p_transaction_id;

  IF v_paid_total > p_new_total + 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS: existing payments=% > new_total=%. Cannot violate I1a.',
      v_paid_total, p_new_total
      USING ERRCODE = 'PT002';
  END IF;

  IF v_old_total = p_new_total THEN
    INSERT INTO public.audit_logs (
      action, table_name, record_id, store_id, user_id, metadata
    ) VALUES (
      'ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object(
        'total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP',
        'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor
      )
    );
    RETURN true;
  END IF;

  UPDATE public.transactions
    SET total_amount = p_new_total
    WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (
    action, table_name, record_id, store_id, user_id, metadata
  ) VALUES (
    'ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
    jsonb_build_object(
      'old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason,
      'paid_total_at_time', v_paid_total,
      'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor
    )
  );

  RETURN true;
END;
$function$;

ALTER FUNCTION public.adjust_total_amount(uuid, numeric, text) OWNER TO costpro_transaction_adjuster;

REVOKE EXECUTE ON FUNCTION public.adjust_total_amount(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_total_amount(uuid, numeric, text) TO authenticated;

-- Privileges mínimos para el rol dedicado
GRANT SELECT, UPDATE ON public.transactions TO costpro_transaction_adjuster;
GRANT SELECT ON public.payment_transactions TO costpro_transaction_adjuster;
GRANT INSERT ON public.audit_logs TO costpro_transaction_adjuster;
GRANT EXECUTE ON FUNCTION public.is_admin() TO costpro_transaction_adjuster;

-- ─── 8. Comments ────────────────────────────────────────────────────────
COMMENT ON COLUMN public.payment_transactions.transaction_id IS
  'PR-4.4I: Venta a la que se aplica este pago contablemente. NULL = pago sin venta asociada. FK ON DELETE RESTRICT.';

COMMENT ON COLUMN public.payment_transactions.amount_cup IS
  'CONTRATO CONTABLE: Equivalente CUP. GENERATED ALWAYS AS (CASE WHEN currency=CUP THEN amount ELSE amount*exchange_rate END) STORED. NOT NULL. Invariante I2 estructural.';

COMMENT ON COLUMN public.payment_transactions.ref_type IS
  'PR-4.4I: Origen del pago. Valores: receipt, service, production_order, work, sale, commission. Si ref_type=sale, entonces transaction_id IS NOT NULL AND ref_id = transaction_id (CHECK).';

COMMENT ON COLUMN public.transactions.total_amount IS
  'CONTRATO CONTABLE: SIEMPRE CUP. TOTAL DE LA VENTA (obligación). INMUTABLE post-INSERT (trigger trg_protect_transactions_total_amount). Mecanismo de ajuste: RPC adjust_total_amount() con rol costpro_transaction_adjuster.';

COMMENT ON FUNCTION public.validate_payment_transactions_invariants IS
  'PR-4.4I v2.2.2-R7.2.1: SECURITY INVOKER. Invariantes: I2 (GENERATED), I3, I4, I8, I1a (lock), I9-TXN (lock, logical key: transaction_id+method+currency). DELETE prohibido. SQLSTATE PT001-PT007.';

COMMENT ON FUNCTION public.protect_transactions_total_amount IS
  'PR-4.4I v2.2.2-R7.2.1: I-TOTAL-CONTROL. Verifica current_user = costpro_transaction_adjuster. SQLSTATE PT008.';

COMMENT ON FUNCTION public.adjust_total_amount IS
  'PR-4.4I v2.2.2-R7.2.1: Ajuste administrativo. Owner: costpro_transaction_adjuster. SECURITY DEFINER. auth.uid() + is_admin() + FOR UPDATE + I1a validation. SQLSTATE PT002, PT012-PT016.';

NOTIFY pgrst, 'reload schema';
