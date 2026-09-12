-- R01: inventory.quantity vs SUM(stock_movements.quantity_change) por producto/tienda
WITH mov AS (
  SELECT store_id, product_id, SUM(quantity_change) AS mov_sum, COUNT(*) AS n_mov
  FROM stock_movements GROUP BY 1,2
)
SELECT s.name AS store, p.sku, p.name AS product,
       i.quantity AS inv_qty, COALESCE(m.mov_sum,0) AS mov_sum,
       i.quantity - COALESCE(m.mov_sum,0) AS diff, COALESCE(m.n_mov,0) AS n_mov
FROM inventory i
JOIN products p ON p.id = i.product_id
JOIN stores s ON s.id = i.store_id
LEFT JOIN mov m ON m.store_id=i.store_id AND m.product_id=i.product_id
WHERE i.quantity != COALESCE(m.mov_sum,0)
ORDER BY ABS(i.quantity - COALESCE(m.mov_sum,0)) DESC
LIMIT 60;
