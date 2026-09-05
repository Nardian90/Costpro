-- B-10b-OBS-1 · GATE 2/16 — estado actual de funciones + alcance del huérfano por tienda
SELECT jsonb_build_object(
  'reverse_devolution_now', (SELECT jsonb_build_object('oid',p.oid,'owner',pg_get_userbyid(p.proowner),'secdef',p.prosecdef,'hash',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'))
      FROM pg_proc p WHERE p.oid='public.reverse_devolution(uuid,text,uuid)'::regprocedure),
  'register_stock_movement_hash', (SELECT encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') FROM pg_proc p WHERE p.proname='register_stock_movement' LIMIT 1),
  'fn_recalc_wac_hash', (SELECT encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') FROM pg_proc p WHERE p.proname='fn_recalc_wac' LIMIT 1),
  'fn_sync_inventory_hash', (SELECT encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') FROM pg_proc p WHERE p.proname='fn_sync_inventory_on_movement' LIMIT 1),
  'sync_product_stock_hash', (SELECT encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') FROM pg_proc p WHERE p.proname='sync_product_stock' LIMIT 1),
  'auto_kardex_hash', (SELECT encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') FROM pg_proc p WHERE p.proname='auto_kardex_on_stock_movement' LIMIT 1),
  'product_store_check', (SELECT jsonb_build_object('id',p.id,'store_id',p.store_id,'stock',p.stock_current,'wac',p.cost_average,'updated_at',p.updated_at) FROM public.products p WHERE p.id='da1c4090-3e10-4120-a2bc-24da53cffe16'),
  'store_d1c4ba0e_orphans', (SELECT jsonb_build_object(
      'products_total',(SELECT count(*) FROM public.products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'products_stock_nonzero',(SELECT count(*) FROM public.products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576' AND stock_current<>0),
      'sum_stock',(SELECT COALESCE(SUM(stock_current),0) FROM public.products WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'inventory_rows',(SELECT count(*) FROM public.inventory WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'movements_rows',(SELECT count(*) FROM public.stock_movements WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'),
      'transactions_rows',(SELECT count(*) FROM public.transactions WHERE store_id='d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576')))
) AS capture;
