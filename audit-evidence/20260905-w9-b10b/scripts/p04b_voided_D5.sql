-- B-10b probe: R4b voided D5 (esperado: ERR_INVALID_STATUS)
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b10b0000-0000-4000-8000-0000000001a1"}', true);
CREATE TEMP TABLE b10b_probe(msg text, payload jsonb);
DO $probe$
DECLARE
  v_res jsonb; v_err text;
  v_pre jsonb; v_post jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"b10b0000-0000-4000-8000-0000000001a1"}', true);
  SELECT jsonb_build_object(
    'stock', p.stock_current, 'wac', p.cost_average,
    'inv', i.quantity, 'dev_status', d.status
  ) INTO v_pre
  FROM public.devolutions d
  LEFT JOIN public.products p ON p.id = 'b10b0000-0000-4000-8000-0000000002a1'
  LEFT JOIN public.inventory i ON i.product_id = 'b10b0000-0000-4000-8000-0000000002a1' AND i.store_id = d.store_id
  WHERE d.id = 'b10b0000-0000-4000-8000-0000000003a5';

  BEGIN
    v_res := public.reverse_devolution('b10b0000-0000-4000-8000-0000000003a5', 'R4b voided D5', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  SELECT jsonb_build_object(
    'stock', p.stock_current, 'wac', p.cost_average,
    'inv', i.quantity, 'dev_status', d.status,
    'last_mov', (SELECT jsonb_build_object('type',m.movement_type,'delta',m.quantity_change,'uc',m.unit_cost,
                    'ref',m.reference_id,'doc',m.reference_doc,'bal',m.balance_after,'by',m.created_by)
                 FROM public.stock_movements m
                 WHERE m.product_id = 'b10b0000-0000-4000-8000-0000000002a1'
                 ORDER BY m.created_at DESC, m.id DESC LIMIT 1),
    'movs_n', (SELECT count(*) FROM public.stock_movements WHERE product_id = 'b10b0000-0000-4000-8000-0000000002a1'),
    'movs_dev', (SELECT count(*) FROM public.stock_movements WHERE reference_id = 'b10b0000-0000-4000-8000-0000000003a5'),
    'kardex_last', (SELECT jsonb_build_object('type',k.movement_type,'qty',k.quantity,'uc',k.unit_cost,
                      'ref_type',k.reference_type,'ref_id',k.reference_id,'bal_qty',k.balance_quantity)
                 FROM public.kardex_entries k WHERE k.product_id = 'b10b0000-0000-4000-8000-0000000002a1'
                 ORDER BY k.created_at DESC, k.id DESC LIMIT 1),
    'audits_dev', (SELECT count(*) FROM public.audit_logs WHERE action='REVERSE_DEVOLUTION' AND record_id='b10b0000-0000-4000-8000-0000000003a5'),
    'audit_last', (SELECT jsonb_build_object('user_id',a.user_id,'store',a.store_id,'meta',a.metadata)
                 FROM public.audit_logs a WHERE a.action='REVERSE_DEVOLUTION' AND a.record_id='b10b0000-0000-4000-8000-0000000003a5'
                 ORDER BY a.created_at DESC LIMIT 1),
    'wac_log', (SELECT COALESCE(jsonb_agg(jsonb_build_object('event',w.event,'qty',w.qty_in,'before',w.wac_before,'after',w.wac_after)),'[]'::jsonb)
                 FROM public.wac_change_log w WHERE w.product_id='b10b0000-0000-4000-8000-0000000002a1' AND w.event='devolution_reverse')
  ) INTO v_post
  FROM public.devolutions d
  LEFT JOIN public.products p ON p.id = 'b10b0000-0000-4000-8000-0000000002a1'
  LEFT JOIN public.inventory i ON i.product_id = 'b10b0000-0000-4000-8000-0000000002a1' AND i.store_id = d.store_id
  WHERE d.id = 'b10b0000-0000-4000-8000-0000000003a5';

  INSERT INTO b10b_probe VALUES ('result', jsonb_build_object(
    'probe', 'R4b voided D5', 'expected', 'ERR_INVALID_STATUS',
    'error', v_err, 'result', v_res, 'pre', v_pre, 'post', v_post));
END
$probe$;
SELECT payload FROM b10b_probe WHERE msg='result';
