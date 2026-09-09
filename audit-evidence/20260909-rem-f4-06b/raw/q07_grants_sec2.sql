-- @statement: execute_grants_fiscal_rpcs
SELECT p.proname, r.grantee::regrole AS grantee, r.privilege_type
FROM pg_proc p
CROSS JOIN (SELECT 'public'::regnamespace AS ns) x
JOIN information_schema.role_routine_grants r
  ON r.specific_name = p.proname::text
WHERE p.proname IN ('ensure_fiscal_period','lock_fiscal_period','close_fiscal_period')
  AND p.pronamespace = 'public'::regnamespace
ORDER BY p.proname, grantee;

-- @statement: commission_trigger_full (REM-F4-06 §2 verification)
SELECT tgname, pg_get_triggerdef(t.oid) AS def, t.tgenabled
FROM pg_trigger t WHERE tgrelid = 'commission_payments'::regclass AND NOT tgisinternal;

-- @statement: commission_payments_id_type
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='commission_payments' AND column_name='id';

-- @statement: commission_fn_full_def
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p WHERE p.proname='audit_commission_payments_changes';

-- @statement: has_store_access_helpers_exist
SELECT p.proname, p.oid::regprocedure AS signature
FROM pg_proc p WHERE p.proname IN ('has_store_access','has_store_access_as');
