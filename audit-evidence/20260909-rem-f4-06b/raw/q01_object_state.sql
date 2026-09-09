-- @statement: commission_trigger_function_state (REM-F4-06 verification)
SELECT p.proname, p.oid::regprocedure AS signature, p.prosecdef AS security_definer,
       p.proconfig AS search_path_cfg, pg_get_userbyid(p.proowner) AS owner,
       (pg_get_functiondef(p.oid) LIKE '%::text%') AS has_text_cast,
       pg_get_functiondef(p.oid) LIKE '%NEW.id::text%' AS has_new_id_text,
       pg_get_functiondef(p.oid) LIKE '%OLD.id::text%' AS has_old_id_text
FROM pg_proc p
WHERE p.proname = 'audit_commission_payments_changes';

-- @statement: fiscal_trigger_function_state (target of F4-06b)
SELECT p.proname, p.oid::regprocedure AS signature, p.prosecdef AS security_definer,
       p.proconfig AS search_path_cfg, pg_get_userbyid(p.proowner) AS owner,
       pg_get_functiondef(p.oid) LIKE '%NEW.id::text%' AS has_new_id_text,
       pg_get_functiondef(p.oid) LIKE '%OLD.id::text%' AS has_old_id_text
FROM pg_proc p
WHERE p.proname = 'audit_fiscal_closings_changes';

-- @statement: fiscal_closings_id_type
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'fiscal_closings' AND column_name = 'id';

-- @statement: audit_logs_record_id_type
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'audit_logs' AND column_name = 'record_id';

-- @statement: fiscal_closings_trigger
SELECT tgname, pg_get_triggerdef(t.oid) AS definition, t.tgenabled
FROM pg_trigger t
WHERE tgrelid = 'fiscal_closings'::regclass AND NOT tgisinternal;

-- @statement: cash_closures_canonical_reference
SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%v_record_id := NEW.id%' AS uses_direct_uuid,
       pg_get_functiondef(p.oid) LIKE '%::text%' AS has_any_text_cast
FROM pg_proc p
WHERE p.proname = 'audit_cash_closures_changes';
