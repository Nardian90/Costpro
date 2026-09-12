-- E7: kardex balance off-by-one — último balance_quantity por producto vs inventory actual
WITH last_k AS (
  SELECT DISTINCT ON (k.store_id, k.product_id)
         k.store_id, k.product_id, k.balance_quantity, k.balance_unit_cost, k.created_at
  FROM kardex_entries k
  ORDER BY k.store_id, k.product_id, k.created_at DESC, k.id DESC
)
SELECT s.name AS store, p.sku, lk.balance_quantity AS kardex_last_balance,
       i.quantity AS inv_now,
       i.quantity - lk.balance_quantity AS off_by
FROM last_k lk
JOIN inventory i ON i.store_id=lk.store_id AND i.product_id=lk.product_id
JOIN stores s ON s.id=lk.store_id
JOIN products p ON p.id=lk.product_id
WHERE i.quantity != lk.balance_quantity
ORDER BY ABS(i.quantity - lk.balance_quantity) DESC LIMIT 40;
