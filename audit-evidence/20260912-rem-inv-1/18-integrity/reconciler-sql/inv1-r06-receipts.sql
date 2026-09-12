-- R06: recepciones confirmadas sin movimiento de compra asociado
SELECT s.name AS store, r.status, COUNT(*) AS n_receipts,
       SUM(CASE WHEN mov.n IS NULL THEN 1 ELSE 0 END) AS without_movements
FROM receipts r
JOIN stores s ON s.id=r.store_id
LEFT JOIN (
  SELECT reference_id, COUNT(*) AS n FROM stock_movements
  WHERE movement_type='purchase' AND reference_id IS NOT NULL GROUP BY 1
) mov ON mov.reference_id::text = r.id::text
GROUP BY s.name, r.status
ORDER BY without_movements DESC, n_receipts DESC;
