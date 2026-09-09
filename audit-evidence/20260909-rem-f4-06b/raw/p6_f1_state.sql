-- @statement: F1_STATE_AFTER_HTTP_500
SELECT id, status, locked_by IS NULL AS locked_by_null, locked_at IS NULL AS locked_at_null, updated_at
FROM fiscal_closings WHERE id='17558101-2d1e-498b-b995-542717735e93';

-- @statement: AUDIT_ROWS_AFTER_HTTP_500
SELECT count(*)::int AS audit_fiscal_rows
FROM audit_logs WHERE table_name='fiscal_closings';
