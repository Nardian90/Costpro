-- Zero-touch BEFORE/AFTER: fingerprint económico de las 3 tiendas de producción
-- (todas las cifras son agregados SELECT-only)
WITH prod AS (
  SELECT id::text AS sid, name FROM stores
  WHERE name IN ('Puerto Padre VITALLCONS','ENERVIDA-VITALLCONS','TIENDA CENTRAL COSTPRO')
)
SELECT 'inventory' AS metric, prod.sid, prod.name,
       COUNT(*)::text AS n, COALESCE(SUM(i.quantity),0)::text AS total
FROM prod JOIN inventory i ON i.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'stock_movements', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(sm.quantity_change),0)::text
FROM prod JOIN stock_movements sm ON sm.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'kardex_entries', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(k.quantity),0)::text
FROM prod JOIN kardex_entries k ON k.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'transactions', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(t.total_amount),0)::text
FROM prod JOIN transactions t ON t.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'receipts', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(r.total_cost),0)::text
FROM prod JOIN receipts r ON r.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'devolutions', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(d.total_amount),0)::text
FROM prod JOIN devolutions d ON d.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'production_orders', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(po.budget_total),0)::text
FROM prod JOIN production_orders po ON po.store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'transfers_origin', prod.sid, prod.name,
       COUNT(*)::text, '0'
FROM prod JOIN transfers tf ON tf.origin_store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'transfers_dest', prod.sid, prod.name,
       COUNT(*)::text, '0'
FROM prod JOIN transfers tf ON tf.destination_store_id::text=prod.sid GROUP BY 1,2,3
UNION ALL
SELECT 'products', prod.sid, prod.name,
       COUNT(*)::text, COALESCE(SUM(p.stock_current),0)::text
FROM prod JOIN products p ON p.store_id::text=prod.sid GROUP BY 1,2,3
ORDER BY 3,1;
