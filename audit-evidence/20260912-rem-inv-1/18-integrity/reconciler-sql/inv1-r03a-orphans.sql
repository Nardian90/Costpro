-- R03a: movimientos huérfanos (ledger sin fila inventory)
SELECT s.name AS store, sm.product_id, p.sku,
       COUNT(*) AS n_movs, SUM(sm.quantity_change) AS net_qty
FROM stock_movements sm
LEFT JOIN inventory i ON i.store_id=sm.store_id AND i.product_id=sm.product_id
JOIN products p ON p.id=sm.product_id
JOIN stores s ON s.id=sm.store_id
WHERE i.id IS NULL
GROUP BY s.name, sm.product_id, p.sku
ORDER BY n_movs DESC LIMIT 40;
