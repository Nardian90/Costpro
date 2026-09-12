-- R02: products.stock_current vs inventory.quantity (consistencia cache primaria)
SELECT s.name AS store, p.sku, p.name AS product,
       p.stock_current, i.quantity AS inv_qty,
       p.stock_current - i.quantity AS diff
FROM products p
JOIN inventory i ON i.product_id=p.id AND i.store_id=p.store_id
JOIN stores s ON s.id=p.store_id
WHERE p.stock_current != i.quantity
ORDER BY ABS(p.stock_current - i.quantity) DESC LIMIT 40;
