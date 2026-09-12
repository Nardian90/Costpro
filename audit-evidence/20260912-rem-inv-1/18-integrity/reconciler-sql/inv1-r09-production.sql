-- R09: producción — consumo (production_out) vs entrada (production_in) por orden + reversiones
SELECT s.name AS store, po.order_number, po.status,
       COALESCE(SUM(CASE WHEN sm.movement_type='production_out' THEN -sm.quantity_change END),0) AS consumed_qty,
       COALESCE(SUM(CASE WHEN sm.movement_type='production_in' THEN sm.quantity_change END),0) AS output_qty,
       COALESCE(SUM(CASE WHEN sm.movement_type='production_reverse' THEN sm.quantity_change END),0) AS reversed_qty,
       COUNT(sm.id) AS n_movs
FROM production_orders po
JOIN stores s ON s.id=po.store_id
LEFT JOIN stock_movements sm ON sm.reference_id::text = po.id::text
  AND sm.movement_type IN ('production_out','production_in','production_reverse')
GROUP BY s.name, po.order_number, po.status
ORDER BY s.name, po.order_number LIMIT 100;
