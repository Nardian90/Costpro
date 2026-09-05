-- B-10b-OBS-1 · GATE 4/7/9 — Alcance de purga del ledger, consistencia global, finanzas (solo lectura)
SELECT jsonb_build_object(
  'movements_by_store', (SELECT jsonb_agg(jsonb_build_object('store',store_id,'cnt',cnt,'min',mn,'max',mx) ORDER BY cnt DESC)
      FROM (SELECT store_id, count(*) cnt, min(created_at) mn, max(created_at) mx FROM public.stock_movements GROUP BY store_id) s),
  'kardex_by_store', (SELECT jsonb_agg(jsonb_build_object('store',store_id,'cnt',cnt,'min',mn,'max',mx) ORDER BY cnt DESC)
      FROM (SELECT store_id, count(*) cnt, min(created_at) mn, max(created_at) mx FROM public.kardex_entries GROUP BY store_id) s),
  'inventory_by_store', (SELECT jsonb_agg(jsonb_build_object('store',store_id,'cnt',cnt) ORDER BY cnt DESC)
      FROM (SELECT store_id, count(*) cnt FROM public.inventory GROUP BY store_id) s),
  'stores', (SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'created_at',created_at)) FROM public.stores),
  'products_with_movements_no_inventory', (SELECT count(*) FROM (
      SELECT DISTINCT m.product_id FROM public.stock_movements m
      WHERE NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.product_id=m.product_id AND i.store_id=m.store_id)) t),
  'products_casoA_mismatch', (SELECT jsonb_agg(jsonb_build_object('product',p.id,'name',p.name,'stock',p.stock_current,'inv',i.quantity,'diff',p.stock_current-i.quantity) ORDER BY p.id)
      FROM public.products p JOIN public.inventory i ON i.product_id=p.id AND i.store_id=p.store_id
      WHERE p.stock_current <> i.quantity),
  'products_with_inventory_total', (SELECT count(*) FROM public.products p WHERE EXISTS (SELECT 1 FROM public.inventory i WHERE i.product_id=p.id AND i.store_id=p.store_id)),
  'orig_tx_of_reversed_dev', (SELECT jsonb_build_object('id',t.id,'status',t.status,'total',t.total_amount,'created_at',t.created_at,'reversed_at',t.reversed_at,'items',(SELECT jsonb_agg(jsonb_build_object('product_id',ti.product_id,'qty',ti.quantity)) FROM public.transaction_items ti WHERE ti.transaction_id=t.id))
      FROM public.transactions t WHERE t.id='edb274bd-e2e1-4001-8932-13674d13d2b9'),
  'tx_items_of_product_any', (SELECT count(*) FROM public.transaction_items WHERE product_id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'payments_for_devolutions', (SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.created_at) FROM public.payment_transactions pt
      WHERE (pt.ref_id IN (SELECT id FROM public.devolutions) AND pt.ref_type ILIKE '%devol%')
         OR pt.ref_id = 'edb274bd-e2e1-4001-8932-13674d13d2b9'),
  'payments_ref_types', (SELECT jsonb_agg(DISTINCT ref_type) FROM public.payment_transactions),
  'payments_for_orig_tx', (SELECT jsonb_agg(to_jsonb(pt) ORDER BY pt.created_at) FROM public.payment_transactions pt WHERE pt.transaction_id='edb274bd-e2e1-4001-8932-13674d13d2b9'),
  'reset_fn_live', (SELECT jsonb_agg(p.proname) FROM pg_proc p WHERE p.proname ILIKE '%reset%store%'),
  'audit_reset_events', (SELECT jsonb_agg(jsonb_build_object('action',a.action,'created_at',a.created_at,'metadata',a.metadata)) FROM public.audit_logs a WHERE a.action ILIKE '%reset%' OR a.action ILIKE '%restore%'),
  'commission_payment_cols', (SELECT jsonb_agg(column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='commission_payments'),
  'issue_slips_product', (SELECT jsonb_build_object('cnt', (SELECT count(*) FROM public.issue_slip_items isi WHERE isi.product_id='da1c4090-3e10-4120-a2bc-24da53cffe16')))
) AS capture;
