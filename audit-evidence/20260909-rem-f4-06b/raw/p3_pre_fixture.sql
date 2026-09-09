-- @statement: PRE_B_fixture_row_with_trigger_disabled
-- Mecanismo documentado: trigger deshabilitado SOLO para sembrar el fixture.
-- Batch atómico (implicit txn): si falla, no queda ni fila ni trigger cambiado.
ALTER TABLE public.fiscal_closings DISABLE TRIGGER trg_audit_fiscal_closings;
INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, closing_notes)
VALUES ('f91b0e17-ac23-42ba-b08e-8159a6b57d83', 2026, 8, 'closed',
        'REM-F4-06b fixture F1 — HTTP lock test subject');
ALTER TABLE public.fiscal_closings ENABLE TRIGGER trg_audit_fiscal_closings;

-- @statement: PRE_B2_verify_triggers_enabled_and_row_exists
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid='fiscal_closings'::regclass AND NOT tgisinternal ORDER BY tgname;
SELECT id, store_id, period_year, period_month, status, closing_notes
FROM fiscal_closings
WHERE store_id='f91b0e17-ac23-42ba-b08e-8159a6b57d83' AND period_year=2026 AND period_month=8;
