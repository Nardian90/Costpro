-- B-10b-OBS-1 · GATE 3 — Inmersión forense del producto afectado (solo lectura)
SELECT jsonb_build_object(
  'product', (SELECT to_jsonb(p) FROM public.products p WHERE p.id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'inventory_rows', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.store_id) FROM public.inventory i WHERE i.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'movements_all', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at, m.id) FROM public.stock_movements m WHERE m.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'movements_count', (SELECT count(*) FROM public.stock_movements WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'kardex_all', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at, k.id) FROM public.kardex_entries k WHERE k.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'kardex_count', (SELECT count(*) FROM public.kardex_entries WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'movement_range_global', (SELECT jsonb_build_object('min',(SELECT min(created_at) FROM public.stock_movements),'max',(SELECT max(created_at) FROM public.stock_movements))),
  'kardex_range_global', (SELECT jsonb_build_object('min',(SELECT min(created_at) FROM public.kardex_entries),'max',(SELECT max(created_at) FROM public.kardex_entries))),
  'dev_created_v2_metadata', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM public.audit_logs a
      WHERE a.action='DEVOLUTION_CREATED_V2' AND a.record_id IN (SELECT id FROM public.devolutions)),
  'transactions_of_product', (SELECT jsonb_agg(jsonb_build_object('tx_id',ti.transaction_id,'qty',ti.quantity,'tx_status',t.status,'tx_created_at',t.created_at,'tx_reversed_at',t.reversed_at) ORDER BY t.created_at)
      FROM public.transaction_items ti JOIN public.transactions t ON t.id=ti.transaction_id
      WHERE ti.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'wac_change_log_rows', (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.created_at) FROM public.wac_change_log w WHERE w.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16')
) AS capture;
