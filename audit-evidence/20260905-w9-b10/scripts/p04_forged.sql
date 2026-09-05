INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average) VALUES
  ('b10c0000-0000-4000-8000-00000000001e','B10-P30-FORGED','B10-P30','b10a0000-0000-4000-8000-0000000000a1',11,10);
INSERT INTO public.inventory (store_id, product_id, quantity) VALUES
  ('b10a0000-0000-4000-8000-0000000000a1','b10c0000-0000-4000-8000-00000000001e',11);
INSERT INTO public.receipts (id, store_id, status, reference_doc) VALUES
  ('b10d0000-0000-4000-8000-00000000e109','b10a0000-0000-4000-8000-0000000000a1','active','B10-R9-forged');
INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost) VALUES
  ('b10d0000-0000-4000-8000-00000000e109','b10c0000-0000-4000-8000-00000000001e',1,10);
SELECT count(*)::int AS ok FROM public.receipts WHERE id='b10d0000-0000-4000-8000-00000000e109';
