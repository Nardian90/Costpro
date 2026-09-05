-- Sentinelas PRE/POST de datos reales (idempotente, sin tocar datos)
SELECT jsonb_build_object(
  'ts', now(),
  'counts', jsonb_build_object(
    'devolutions', (SELECT count(*) FROM public.devolutions),
    'devolution_items', (SELECT count(*) FROM public.devolution_items),
    'products', (SELECT count(*) FROM public.products),
    'inventory', (SELECT count(*) FROM public.inventory),
    'stock_movements', (SELECT count(*) FROM public.stock_movements),
    'kardex_entries', (SELECT count(*) FROM public.kardex_entries),
    'wac_change_log', (SELECT count(*) FROM public.wac_change_log),
    'audit_logs', (SELECT count(*) FROM public.audit_logs),
    'payment_transactions', (SELECT count(*) FROM public.payment_transactions),
    'commission_payments', (SELECT count(*) FROM public.commission_payments),
    'commission_rules', (SELECT count(*) FROM public.commission_rules),
    'document_sequences', (SELECT count(*) FROM public.document_sequences),
    'business_events', (SELECT count(*) FROM public.business_events)
  ),
  'invariants', jsonb_build_object(
    'products_sum_stock', (SELECT COALESCE(SUM(stock_current),0) FROM public.products),
    'inventory_sum_qty', (SELECT COALESCE(SUM(quantity),0) FROM public.inventory),
    'movements_sum_delta', (SELECT COALESCE(SUM(quantity_change),0) FROM public.stock_movements),
    'products_max_updated_at', (SELECT max(updated_at) FROM public.products),
    'inventory_max_updated_at', (SELECT max(updated_at) FROM public.inventory),
    'devolutions_max_created', (SELECT max(created_at) FROM public.devolutions),
    'devolutions_by_status', (SELECT jsonb_object_agg(status,c) FROM (SELECT status,count(*) c FROM public.devolutions GROUP BY status) s),
    'audit_max_created', (SELECT max(created_at) FROM public.audit_logs),
    'movements_max_created', (SELECT max(created_at) FROM public.stock_movements)
  )
) AS sentinels;
