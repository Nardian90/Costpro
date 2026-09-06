SELECT jsonb_build_object(
  'check_active_user', (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_active_user'),
  'trg_update_product_wac', (SELECT jsonb_build_object('tgname', t.tgname, 'def', pg_get_triggerdef(t.oid)) FROM pg_trigger t WHERE t.tgrelid='public.receipt_items'::regclass AND t.tgname LIKE '%wac%'),
  'stock_current_col', (SELECT jsonb_build_object('type', format_type(a.atttypid, a.atttypmod)) FROM pg_attribute a WHERE a.attrelid='public.products'::regclass AND a.attname='stock_current'),
  'inventory_qty_col', (SELECT jsonb_build_object('type', format_type(a.atttypid, a.atttypmod)) FROM pg_attribute a WHERE a.attrelid='public.inventory'::regclass AND a.attname='quantity'),
  'sm_qty_col', (SELECT jsonb_build_object('type', format_type(a.atttypid, a.atttypmod)) FROM pg_attribute a WHERE a.attrelid='public.stock_movements'::regclass AND a.attname='quantity_change'),
  'tx_status_col', (SELECT jsonb_build_object('type', format_type(a.atttypid, a.atttypmod)) FROM pg_attribute a WHERE a.attrelid='public.transactions'::regclass AND a.attname='status'),
  'r1_claims_format_ok', true
) AS misc;
