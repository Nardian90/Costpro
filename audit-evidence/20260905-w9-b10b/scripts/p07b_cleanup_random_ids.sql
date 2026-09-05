-- limpieza dirigida de devoluciones canónicas (IDs aleatorios capturados)
SET session_replication_role = replica;
DELETE FROM public.audit_logs WHERE record_id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','99e9e934-1f88-46af-a876-53b67413ce49','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20');
DELETE FROM public.business_events WHERE entity_id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','99e9e934-1f88-46af-a876-53b67413ce49','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20');
DELETE FROM public.devolution_items WHERE devolution_id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','99e9e934-1f88-46af-a876-53b67413ce49','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20');
DELETE FROM public.payment_transactions WHERE ref_type='devolution' AND ref_id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','99e9e934-1f88-46af-a876-53b67413ce49','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20');
DELETE FROM public.devolutions WHERE id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','99e9e934-1f88-46af-a876-53b67413ce49','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20');
SET session_replication_role = DEFAULT;
