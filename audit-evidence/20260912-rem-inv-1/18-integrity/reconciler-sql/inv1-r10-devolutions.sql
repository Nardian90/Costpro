-- R10: devoluciones — vinculación con movimientos de reversión (return / devolution_reverse)
SELECT s.name AS store, d.status, d.devolution_number,
       COUNT(DISTINCT di.id) AS n_items,
       SUM(di.quantity) AS returned_qty
FROM devolutions d
JOIN devolution_items di ON di.devolution_id=d.id
JOIN stores s ON s.id=d.store_id
GROUP BY s.name, d.status, d.devolution_number
ORDER BY d.status, d.devolution_number LIMIT 40;
