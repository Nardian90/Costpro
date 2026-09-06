-- GATE 2 · Snapshot completo por producto (124 filas) (READ ONLY)
SELECT p.id, p.sku, p.name, p.store_id, p.stock_current, p.cost_average,
       p.created_at, p.updated_at, p.status, p.is_active, p.has_movements,
       p.min_stock, p.price, p.cost_price,
       i.quantity AS inventory_quantity, i.updated_at AS inventory_updated_at,
       (SELECT count(*) FROM stock_movements m WHERE m.store_id=p.store_id AND m.product_id=p.id) AS movements_cnt,
       (SELECT count(*) FROM kardex_entries k WHERE k.store_id=p.store_id AND k.product_id=p.id) AS kardex_cnt,
       (SELECT count(*) FROM transaction_items ti JOIN transactions t ON t.id=ti.transaction_id
         WHERE t.store_id=p.store_id AND ti.product_id=p.id) AS sale_items_cnt
FROM products p
LEFT JOIN inventory i ON i.store_id = p.store_id AND i.product_id = p.id
WHERE p.store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
ORDER BY p.created_at, p.name;
