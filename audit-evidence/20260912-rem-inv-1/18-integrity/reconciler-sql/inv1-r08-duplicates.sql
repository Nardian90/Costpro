-- R08: movimientos duplicados (mismo producto/tienda/tipo/qty/ref/doc/fecha)
SELECT s.name AS store, p.sku, sm.movement_type, sm.quantity_change,
       sm.reference_doc, sm.movement_date::date AS mdate, COUNT(*) AS dup_count
FROM stock_movements sm
JOIN stores s ON s.id=sm.store_id
JOIN products p ON p.id=sm.product_id
GROUP BY s.name, p.sku, sm.movement_type, sm.quantity_change, sm.reference_doc, sm.movement_date::date
HAVING COUNT(*) > 1
ORDER BY dup_count DESC LIMIT 40;
