-- R11: warehouse_stock vs inventory (H1 — divergencia almacén vs tienda)
SELECT s.name AS store, p.sku,
       w.quantity AS wh_qty, i.quantity AS inv_qty, w.reserved_quantity
FROM warehouse_stock w
JOIN inventory i ON i.store_id=w.store_id AND i.product_id=w.product_id
JOIN stores s ON s.id=w.store_id
JOIN products p ON p.id=w.product_id
WHERE w.quantity != i.quantity
ORDER BY ABS(w.quantity - i.quantity) DESC LIMIT 40;
