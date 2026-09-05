SELECT p.id::text AS pid, p.stock_current, i.quantity,
  (SELECT count(*)::int FROM public.stock_movements m WHERE m.product_id=p.id) AS movements
FROM public.products p LEFT JOIN public.inventory i ON i.product_id=p.id AND i.store_id=p.store_id
WHERE p.id::text LIKE 'b8cc0000%' ORDER BY p.id;
