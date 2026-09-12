-- R05: balance por transferencia (salida A vs entrada B, por transferencia)
WITH outm AS (
  SELECT reference_id AS transfer_id, SUM(-quantity_change) AS out_qty, COUNT(*) AS n_out
  FROM stock_movements WHERE movement_type='transfer_out' AND reference_id IS NOT NULL
  GROUP BY 1
), inm AS (
  SELECT reference_id AS transfer_id, SUM(quantity_change) AS in_qty, COUNT(*) AS n_in
  FROM stock_movements WHERE movement_type='transfer_in' AND reference_id IS NOT NULL
  GROUP BY 1
)
SELECT s.name AS origin_store, sd.name AS dest_store, t.status,
       COALESCE(o.out_qty,0) AS out_qty, COALESCE(i2.in_qty,0) AS in_qty,
       COALESCE(o.out_qty,0) - COALESCE(i2.in_qty,0) AS imbalance,
       COALESCE(o.n_out,0) AS n_out, COALESCE(i2.n_in,0) AS n_in
FROM transfers t
JOIN stores s ON s.id=t.origin_store_id
JOIN stores sd ON sd.id=t.destination_store_id
LEFT JOIN outm o ON o.transfer_id::text = t.id::text
LEFT JOIN inm i2 ON i2.transfer_id::text = t.id::text
ORDER BY imbalance DESC;
