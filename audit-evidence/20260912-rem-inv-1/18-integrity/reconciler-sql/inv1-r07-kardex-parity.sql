-- R07: paridad kardex vs movimientos por producto/tienda (1:1 esperado por diseño de triggers)
WITH km AS (
  SELECT store_id, product_id, COUNT(*) AS n_kardex FROM kardex_entries GROUP BY 1,2
), sm AS (
  SELECT store_id, product_id, COUNT(*) AS n_movs FROM stock_movements GROUP BY 1,2
)
SELECT s.name AS store, COALESCE(k.store_id, m.store_id) IS NOT NULL AS joined,
       p.sku, COALESCE(k.n_kardex,0) AS n_kardex, COALESCE(m.n_movs,0) AS n_movs
FROM sm m
LEFT JOIN km k ON k.store_id=m.store_id AND k.product_id=m.product_id
JOIN stores s ON s.id=m.store_id
JOIN products p ON p.id=m.product_id
WHERE COALESCE(k.n_kardex,0) != m.n_movs
ORDER BY ABS(COALESCE(k.n_kardex,0) - m.n_movs) DESC LIMIT 40;
