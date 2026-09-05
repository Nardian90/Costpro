-- B-10b probe: R6b no-member U3→L2 (esperado: ERR_UNAUTHORIZED)
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"b10b0000-0000-4000-8000-0000000001d4"}', true);
CREATE TEMP TABLE b10b_probe(msg text, payload jsonb);
DO $probe$
DECLARE
  v_res jsonb; v_err text;
  v_pre jsonb; v_post jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"b10b0000-0000-4000-8000-0000000001d4"}', true);
  SELECT jsonb_build_object(
    'stock', p.stock_current, 'wac', p.cost_average,
    'inv', i.quantity, 'dev_status', d.status
  ) INTO v_pre
  FROM public.devolutions d
  LEFT JOIN public.products p ON p.id = 'b10b0000-0000-4000-8000-0000000002a4'
  LEFT JOIN public.inventory i ON i.product_id = 'b10b0000-0000-4000-8000-0000000002a4' AND i.store_id = d.store_id
  WHERE d.id = 'b10b0000-0000-4000-8000-0000000003b2';

  BEGIN
    v_res := public.reverse_devolution('b10b0000-0000-4000-8000-0000000003b2', 'R6b no-member U3→L2', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  SELECT jsonb_build_object(
    'stock', p.stock_current, 'wac', p.cost_average,
    'inv', i.quantity, 'dev_status', d.status,
    'last_mov', (SELECT jsonb_build_object('type',m.movement_type,'delta',m.quantity_change,'uc',m.unit_cost,
                    'ref',m.reference_id,'doc',m.reference_doc,'bal',m.balance_after,'by',m.created_by)
                 FROM public.stock_movements m
                 WHERE m.product_id = 'b10b0000-0000-4000-8000-0000000002a4'
                 ORDER BY m.created_at DESC, m.id DESC LIMIT 1),
    'movs_n', (SELECT count(*) FROM public.stock_movements WHERE product_id = 'b10b0000-0000-4000-8000-0000000002a4'),
    'movs_dev', (SELECT count(*) FROM public.stock_movements WHERE reference_id = 'b10b0000-0000-4000-8000-0000000003b2'),
    'kardex_last', (SELECT jsonb_build_object('type',k.movement_type,'qty',k.quantity,'uc',k.unit_cost,
                      'ref_type',k.reference_type,'ref_id',k.reference_id,'bal_qty',k.balance_quantity)
                 FROM public.kardex_entries k WHERE k.product_id = 'b10b0000-0000-4000-8000-0000000002a4'
                 ORDER BY k.created_at DESC, k.id DESC LIMIT 1),
    'audits_dev', (SELECT count(*) FROM public.audit_logs WHERE action='REVERSE_DEVOLUTION' AND record_id='b10b0000-0000-4000-8000-0000000003b2'),
    'audit_last', (SELECT jsonb_build_object('user_id',a.user_id,'store',a.store_id,'meta',a.metadata)
                 FROM public.audit_logs a WHERE a.action='REVERSE_DEVOLUTION' AND a.record_id='b10b0000-0000-4000-8000-0000000003b2'
                 ORDER BY a.created_at DESC LIMIT 1),
    'wac_log', (SELECT COALESCE(jsonb_agg(jsonb_build_object('event',w.event,'qty',w.qty_in,'before',w.wac_before,'after',w.wac_after)),'[]'::jsonb)
                 FROM public.wac_change_log w WHERE w.product_id='b10b0000-0000-4000-8000-0000000002a4' AND w.event='devolution_reverse')
  ) INTO v_post
  FROM public.devolutions d
  LEFT JOIN public.products p ON p.id = 'b10b0000-0000-4000-8000-0000000002a4'
  LEFT JOIN public.inventory i ON i.product_id = 'b10b0000-0000-4000-8000-0000000002a4' AND i.store_id = d.store_id
  WHERE d.id = 'b10b0000-0000-4000-8000-0000000003b2';

  INSERT INTO b10b_probe VALUES ('result', jsonb_build_object(
    'probe', 'R6b no-member U3→L2', 'expected', 'ERR_UNAUTHORIZED',
    'error', v_err, 'result', v_res, 'pre', v_pre, 'post', v_post));
END
$probe$;
SELECT payload FROM b10b_probe WHERE msg='result';
