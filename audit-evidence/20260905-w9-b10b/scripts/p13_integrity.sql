-- B-10b p13: integridad agregada del fixture tras todos los probes
SELECT jsonb_build_object(
  'chain_p1', (SELECT jsonb_build_object(
    'movs', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'d',quantity_change,'uc',unit_cost,'ref',reference_id) ORDER BY created_at)
             FROM public.stock_movements WHERE product_id='b10b0000-0000-4000-8000-0000000002a1'),
    'kardex', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'q',quantity,'uc',unit_cost) ORDER BY created_at)
             FROM public.kardex_entries WHERE product_id='b10b0000-0000-4000-8000-0000000002a1'),
    'stock', (SELECT stock_current FROM public.products WHERE id='b10b0000-0000-4000-8000-0000000002a1'),
    'inv', (SELECT quantity FROM public.inventory WHERE product_id='b10b0000-0000-4000-8000-0000000002a1'),
    'sum_delta', (SELECT SUM(quantity_change) FROM public.stock_movements WHERE product_id='b10b0000-0000-4000-8000-0000000002a1'),
    'wac', (SELECT cost_average FROM public.products WHERE id='b10b0000-0000-4000-8000-0000000002a1'))),
  'chain_p2_zero', (SELECT jsonb_build_object(
    'movs', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'d',quantity_change,'uc',unit_cost) ORDER BY created_at)
             FROM public.stock_movements WHERE product_id='b10b0000-0000-4000-8000-0000000002a2'),
    'kardex', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'q',quantity,'uc',unit_cost) ORDER BY created_at)
             FROM public.kardex_entries WHERE product_id='b10b0000-0000-4000-8000-0000000002a2'),
    'stock', (SELECT stock_current FROM public.products WHERE id='b10b0000-0000-4000-8000-0000000002a2'),
    'inv', (SELECT quantity FROM public.inventory WHERE product_id='b10b0000-0000-4000-8000-0000000002a2'),
    'wac', (SELECT cost_average FROM public.products WHERE id='b10b0000-0000-4000-8000-0000000002a2'))),
  'sync_invariant_all', (SELECT jsonb_agg(jsonb_build_object('product',p.id::text,'stock',p.stock_current,'inv',i.quantity,
      'ok',(p.stock_current = COALESCE(i.quantity,-999))))
    FROM public.products p LEFT JOIN public.inventory i ON i.product_id=p.id AND i.store_id=p.store_id
    WHERE p.id IN ('b10b0000-0000-4000-8000-0000000002a1','b10b0000-0000-4000-8000-0000000002a2','b10b0000-0000-4000-8000-0000000002a5','b10b0000-0000-4000-8000-0000000002a6','b10b0000-0000-4000-8000-0000000002a4')),
  'wac_invariant', (SELECT jsonb_agg(jsonb_build_object('product',product_id::text,'before',wac_before,'after',wac_after,'qty',qty_in))
    FROM public.wac_change_log WHERE store_id='b10b0000-0000-4000-8000-00000000000a' AND event='devolution_reverse'),
  'finance_untouched', jsonb_build_object(
    'payments_fixture', (SELECT count(*) FROM public.payment_transactions WHERE ref_id IN (SELECT id FROM public.devolutions WHERE id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20','b10b0000-0000-4000-8000-0000000003b1','b10b0000-0000-4000-8000-0000000003b2'))),
    'commission_payments_fixture', (SELECT count(*) FROM public.commission_payments WHERE store_id='b10b0000-0000-4000-8000-00000000000a')),
  'audits_fixture', (SELECT jsonb_agg(jsonb_build_object('action',action,'user',user_id,'record',record_id,'op',metadata->>'operation','pipeline',metadata->>'pipeline') ORDER BY created_at)
    FROM public.audit_logs WHERE store_id='b10b0000-0000-4000-8000-00000000000a' AND action IN ('REVERSE_DEVOLUTION')),
  'devs_final', (SELECT jsonb_object_agg(id::text, jsonb_build_object('status',status,'by',reversed_by,'reason',reversal_reason))
    FROM public.devolutions WHERE id IN ('deafe436-ab12-404c-9975-b519623a8da9','0d504a04-d888-4711-8094-9f0773006514','aa8186ea-4b3a-441a-9fd7-59a1345db0e0','c144f0c8-2ef4-44ed-8e87-aa4bac254e20','b10b0000-0000-4000-8000-0000000003b1','b10b0000-0000-4000-8000-0000000003b2','99e9e934-1f88-46af-a876-53b67413ce49','b10b0000-0000-4000-8000-0000000003a4','b10b0000-0000-4000-8000-0000000003a5')),
  'traceability_D1', (SELECT jsonb_build_object(
    'movs_by_ref', (SELECT count(*) FROM public.stock_movements WHERE reference_id='deafe436-ab12-404c-9975-b519623a8da9'),
    'kardex_via_mov', (SELECT count(*) FROM public.kardex_entries k
      WHERE k.reference_type='stock_movement' AND k.reference_id IN
        (SELECT id::uuid FROM public.stock_movements WHERE reference_id='deafe436-ab12-404c-9975-b519623a8da9'))))
) AS integrity;
