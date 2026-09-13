-- DECLARED FINAL STATE (Git) de validate_payment_transactions_invariants
-- fuente: 20260812000001_pr4_4i_payment_transactions_hardening.sql stmt#17

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
$function$
