-- @statement: has_store_access_def
SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname='has_store_access';

-- @statement: fiscal_rls_force_check
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid='fiscal_closings'::regclass;

-- @statement: pre_state_fixture_periods
SELECT count(*)::int AS rows_store_a FROM fiscal_closings WHERE store_id='f91b0e17-ac23-42ba-b08e-8159a6b57d83';
SELECT count(*)::int AS audit_fiscal_rows_pre FROM audit_logs WHERE table_name='fiscal_closings';
