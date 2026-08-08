-- ══════════════════════════════════════════════════════════════════════
-- HOTFIX-2 — Fix audit_payment_transactions_changes: NEW.id::text → NEW.id
-- ══════════════════════════════════════════════════════════════════════
-- Bug: trigger inserts NEW.id::text into audit_logs.record_id (uuid column)
--      Error: 42804: column "record_id" is of type uuid but expression is of type text
-- Impact: same as HOTFIX-1 — register_supplier_payment broken system-wide.
-- Fix: remove ::text cast (NEW.id is already uuid, matches record_id type).
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_payment_transactions_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'SUPPLIER_PAYMENT_REGISTERED' ELSE 'PAYMENT_TRANSACTION_UPDATED' END,
    'payment_transactions',
    NEW.id,  -- ← FIX: was NEW.id::text (audit_logs.record_id is uuid, not text)
    NEW.store_id,
    NEW.paid_by,  -- ← FIX (from HOTFIX-1): was NEW.created_by
    jsonb_build_object(
      'tg_op', TG_OP,
      'ref_type', NEW.ref_type,
      'ref_id', NEW.ref_id,
      'amount', NEW.amount,
      'amount_cup', NEW.amount_cup,
      'payment_method', NEW.payment_method,
      'currency', NEW.currency
    )
  );
  RETURN NEW;
END;
$function$;
