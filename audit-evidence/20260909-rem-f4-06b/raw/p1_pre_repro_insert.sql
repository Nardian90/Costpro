-- @statement: PRE_A_insert_repro_authenticated_42804
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status)
VALUES ('f91b0e17-ac23-42ba-b08e-8159a6b57d83', 2026, 8, 'open');
ROLLBACK;

-- @statement: PRE_A2_zero_persistence_proof
SELECT count(*)::int AS rows_after_insert_attempt
FROM fiscal_closings WHERE store_id='f91b0e17-ac23-42ba-b08e-8159a6b57d83' AND period_year=2026 AND period_month=8;
SELECT count(*)::int AS audit_rows_after_insert_attempt
FROM audit_logs WHERE table_name='fiscal_closings';
