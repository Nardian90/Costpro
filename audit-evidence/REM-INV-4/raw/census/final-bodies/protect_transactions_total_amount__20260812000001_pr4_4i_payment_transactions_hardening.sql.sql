-- DECLARED FINAL STATE (Git) de protect_transactions_total_amount
-- fuente: 20260812000001_pr4_4i_payment_transactions_hardening.sql stmt#20

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
$function$
