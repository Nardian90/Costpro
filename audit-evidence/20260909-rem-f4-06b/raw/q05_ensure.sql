-- @statement: ensure_fiscal_period_def
SELECT pg_get_functiondef(p.oid) AS def, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef, p.proconfig AS spcfg
FROM pg_proc p WHERE p.proname = 'ensure_fiscal_period';
