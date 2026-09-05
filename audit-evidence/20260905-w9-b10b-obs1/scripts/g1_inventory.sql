-- B-10b-OBS-1 · GATE 1 — Inventario forense completo (solo lectura)
-- Identifica TODAS las devoluciones que puedan haber sido procesadas por
-- reverse_devolution histórico. No asume status='reversed' como único criterio.
SELECT jsonb_build_object(
  'captured_at', now(),
  'schema', (SELECT jsonb_agg(jsonb_build_object('table',table_name,'col',column_name,'type',data_type,'pos',ordinal_position) ORDER BY table_name, ordinal_position)
             FROM information_schema.columns WHERE table_schema='public'
               AND table_name IN ('devolutions','devolution_items','products','inventory','stock_movements','kardex_entries','audit_logs','payment_transactions','transactions','commissions')),
  'devolutions_status_check', (SELECT jsonb_agg(jsonb_build_object('conname',conname,'pg_get_constraintdef',pg_get_constraintdef(oid)))
             FROM pg_constraint WHERE conrelid='public.devolutions'::regclass AND contype='c'),
  'counts', (SELECT jsonb_build_object(
      'products',(SELECT count(*) FROM public.products),
      'inventory',(SELECT count(*) FROM public.inventory),
      'devolutions',(SELECT count(*) FROM public.devolutions),
      'devolution_items',(SELECT count(*) FROM public.devolution_items),
      'stock_movements',(SELECT count(*) FROM public.stock_movements),
      'kardex_entries',(SELECT count(*) FROM public.kardex_entries),
      'audit_logs',(SELECT count(*) FROM public.audit_logs))),
  'devolutions_by_status', (SELECT COALESCE(jsonb_object_agg(status,cnt),'{}'::jsonb) FROM (SELECT status, count(*) cnt FROM public.devolutions GROUP BY status) s),
  'all_devolutions', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at, d.id) FROM public.devolutions d),
  'all_devolution_items', (SELECT jsonb_agg(to_jsonb(di) ORDER BY di.devolution_id, di.product_id) FROM public.devolution_items di),
  'audit_devolution_related', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at, a.id) FROM public.audit_logs a
      WHERE a.action ILIKE '%devol%' OR a.action ILIKE '%reverse%' OR a.table_name='devolutions'),
  'kardex_for_devolutions', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at, k.id) FROM public.kardex_entries k
      WHERE k.reference_id::text IN (SELECT id::text FROM public.devolutions)
         OR k.reference_type = 'reversal'
         OR k.movement_type = 'devolution_in'),
  'movements_for_devolutions', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at, m.id) FROM public.stock_movements m
      WHERE m.reference_id::text IN (SELECT id::text FROM public.devolutions)
         OR m.movement_type IN ('return','devolution_reverse')),
  'movement_type_distinct_live', (SELECT jsonb_agg(DISTINCT movement_type ORDER BY movement_type) FROM public.stock_movements),
  'kardex_type_distinct_live', (SELECT jsonb_agg(DISTINCT movement_type ORDER BY movement_type) FROM public.kardex_entries),
  'kardex_out_reversal_all', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at, k.id) FROM public.kardex_entries k
      WHERE k.movement_type='out' AND k.reference_type='reversal' AND k.unit_cost=0)
) AS capture;
