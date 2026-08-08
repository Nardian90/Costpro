-- ══════════════════════════════════════════════════════════════════════
-- HOTFIX — Fix audit_payment_transactions_changes: NEW.created_by → NEW.paid_by
-- ══════════════════════════════════════════════════════════════════════
-- Bug: trigger trg_audit_payment_transactions references NEW.created_by,
--      but payment_transactions table has NO column created_by (has paid_by).
--      Error: 42703: record "new" has no field "created_by"
-- Impact: register_supplier_payment is BROKEN system-wide since 2026-08-01.
--         Affects F-02 (receipts), F-30 (services), production_orders.
--         Last successful payment: 2026-08-01 (66 payment_transactions pre-existing).
-- Fix: change NEW.created_by to NEW.paid_by (the actual column name).
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
    NEW.id::text,
    NEW.store_id,
    NEW.paid_by,  -- ← FIX: was NEW.created_by (column doesn't exist; correct column is paid_by)
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

-- Verify the fix
SELECT pg_get_functiondef('public.audit_payment_transactions_changes()'::regprocedure);
