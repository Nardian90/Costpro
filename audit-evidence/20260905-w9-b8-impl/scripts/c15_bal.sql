SELECT m.movement_type::text AS mtype, m.quantity_change AS qty, m.balance_after,
       m.created_at::text AS at
FROM public.stock_movements m
WHERE m.product_id='b8cc0000-0000-4000-8000-000000000003'
ORDER BY m.created_at;
