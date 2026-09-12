-- R01s: resumen de divergencia inventory vs movements por tienda
WITH mov AS (
  SELECT store_id, product_id, SUM(quantity_change) AS mov_sum
  FROM stock_movements GROUP BY 1,2
), cmp AS (
  SELECT i.store_id, i.product_id, i.quantity, COALESCE(m.mov_sum,0) AS mov_sum
  FROM inventory i LEFT JOIN mov m ON m.store_id=i.store_id AND m.product_id=i.product_id
)
SELECT s.name AS store, COUNT(*) AS divergent_rows,
       SUM(CASE WHEN c.quantity - c.mov_sum > 0 THEN 1 ELSE 0 END) AS inv_gt_mov,
       SUM(CASE WHEN c.quantity - c.mov_sum < 0 THEN 1 ELSE 0 END) AS inv_lt_mov,
       SUM(ABS(c.quantity - c.mov_sum)) AS total_abs_diff
FROM cmp c JOIN stores s ON s.id=c.store_id
WHERE c.quantity != c.mov_sum
GROUP BY s.name ORDER BY divergent_rows DESC;
