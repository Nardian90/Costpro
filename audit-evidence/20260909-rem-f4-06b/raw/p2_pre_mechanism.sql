-- @statement: PRE_A3_42804_mechanism_proof_isolated
-- Demuestra el mecanismo de tipo del defecto D2 (record_id text vs uuid)
-- en aislamiento y con ROLLBACK (0 persistencia).
BEGIN;
INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
VALUES (
  'F4-06B-MECHANISM-PROOF',
  'fiscal_closings',
  '11111111-1111-1111-1111-111111111111'::text,
  'f91b0e17-ac23-42ba-b08e-8159a6b57d83'::uuid,
  NULL,
  jsonb_build_object('purpose','isolated 42804 mechanism proof')
);
ROLLBACK;

-- @statement: PRE_A4_zero_persistence_after_mechanism_proof
SELECT count(*)::int AS audit_rows_mechanism_proof
FROM audit_logs WHERE action='F4-06B-MECHANISM-PROOF';
