-- @statement: PRE_C_update_repro_42703_masks_42804
-- La operación EXACTA que hace lock_fiscal_period (status closed→locked).
-- Contexto authenticated real (usuario fixture). Txn explícita + ROLLBACK.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
UPDATE public.fiscal_closings
SET status='locked', locked_by='a1111111-1111-1111-1111-111111111111'::uuid, locked_at=now()
WHERE id='17558101-2d1e-498b-b995-542717735e93' AND status='closed';
ROLLBACK;

-- @statement: PRE_C2_zero_persistence_update
SELECT status, locked_by IS NULL AS locked_by_null, locked_at IS NULL AS locked_at_null
FROM fiscal_closings WHERE id='17558101-2d1e-498b-b995-542717735e93';
SELECT count(*)::int AS audit_rows_after_update_attempt
FROM audit_logs WHERE table_name='fiscal_closings';

-- @statement: PRE_D_delete_contract_documentation
-- El trigger trg_audit_fiscal_closings NO cubre DELETE (contrato: INSERT/UPDATE).
-- Prueba aislada (rollback): el DELETE como owner procede SIN generar auditoría.
BEGIN;
DELETE FROM public.fiscal_closings WHERE id='17558101-2d1e-498b-b995-542717735e93' RETURNING id;
SELECT count(*)::int AS audit_rows_during_delete_window
FROM audit_logs WHERE table_name='fiscal_closings';
ROLLBACK;

-- @statement: PRE_D2_row_restored_after_rollback
SELECT count(*)::int AS rows_restored FROM fiscal_closings WHERE id='17558101-2d1e-498b-b995-542717735e93';
