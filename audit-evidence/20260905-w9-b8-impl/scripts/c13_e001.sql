SELECT m.movement_type::text AS mtype, m.quantity_change AS qty, m.reference_id::text AS ref, m.reference_doc, m.notes, m.created_by::text AS by
FROM public.stock_movements m
WHERE m.product_id='b8cc0000-0000-4000-8000-000000000003'
ORDER BY m.created_at;
SELECT p.stock_current AS p3_stock, i.quantity AS p3_inv FROM public.products p, public.inventory i
WHERE p.id='b8cc0000-0000-4000-8000-000000000003' AND i.product_id=p.id AND i.store_id=p.store_id;
