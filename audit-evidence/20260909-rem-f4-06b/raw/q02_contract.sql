-- @statement: full_function_def_fiscal
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p WHERE p.proname = 'audit_fiscal_closings_changes';

-- @statement: full_function_def_prevent
SELECT pg_get_functiondef(p.oid) AS def
FROM pg_proc p WHERE p.proname = 'prevent_fiscal_closing_edit';

-- @statement: fiscal_closings_columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'fiscal_closings'
ORDER BY ordinal_position;

-- @statement: fiscal_closings_rls_policies
SELECT pol.polname AS policy, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr,
       CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END AS cmd
FROM pg_policy pol WHERE pol.polrelid = 'fiscal_closings'::regclass;

-- @statement: fiscal_closings_rls_enabled_and_grants
SELECT c.relrowsecurity AS rls_enabled, c.relowner::regrole AS owner
FROM pg_class c WHERE c.oid = 'fiscal_closings'::regclass;

-- @statement: fiscal_closings_acl
SELECT privilege_type, grantee::regrole AS grantee_role
FROM information_schema.role_table_grants
WHERE table_name = 'fiscal_closings'
ORDER BY grantee_role, privilege_type;

-- @statement: audit_logs_rls_and_grants_summary
SELECT c.relrowsecurity AS rls_enabled
FROM pg_class c WHERE c.oid = 'audit_logs'::regclass;
SELECT privilege_type, grantee::regrole AS grantee_role
FROM information_schema.role_table_grants
WHERE table_name = 'audit_logs'
ORDER BY grantee_role, privilege_type;

-- @statement: fiscal_closings_row_count_and_sample
SELECT count(*) AS total_rows FROM fiscal_closings;
