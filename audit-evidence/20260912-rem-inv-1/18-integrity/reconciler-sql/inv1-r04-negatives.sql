-- R04: cantidades negativas y balances kardex negativos
SELECT 'inventory_negative' AS kind, s.name AS store, p.sku,
       i.quantity AS qty, NULL::numeric AS balance
FROM inventory i JOIN stores s ON s.id=i.store_id JOIN products p ON p.id=i.product_id
WHERE i.quantity < 0
UNION ALL
SELECT 'kardex_balance_negative', s.name, p.sku,
       NULL::numeric, MIN(k.balance_quantity)
FROM kardex_entries k JOIN stores s ON s.id=k.store_id JOIN products p ON p.id=k.product_id
GROUP BY s.name, p.sku HAVING MIN(k.balance_quantity) < 0
ORDER BY 1,4 NULLS LAST, 5 NULLS LAST LIMIT 40;
